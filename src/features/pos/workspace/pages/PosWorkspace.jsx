import React, { useState, useEffect, useRef } from 'react';
import {
  Search, Plus, Minus, ShoppingCart, Trash, X, User, Phone, CreditCard,
  ArrowLeft, ChevronLeft, Package, LayoutGrid, UtensilsCrossed,
  ScanBarcode, AlertTriangle, ScanLine,
} from 'lucide-react';
import { useCartStore, useUiStore, useSettingsStore, useAuthStore } from '../../../../store';
import { getBusinessCapabilities, isBasicPosProductionMode } from '../../../../utils/businessCapabilities';
import { menuApi } from '../../../../api/menu.api';
import { categoryApi } from '../../../../api/category.api';
import { orderApi } from '../../../../api/order.api';
import { openKotPrintPreview } from '../../../../services/printService';
import { useSocketEvent } from '../../../../hooks/useSocket';
import { PLACEHOLDER_IMAGE } from '../../../../lib/imagePlaceholder';
import { canHandleBilling } from '../../../../utils/permissions';
// Shared Category → Subcategory → Item hierarchy (Parts 2/9) — the SAME rule set
// as the Menu Manager and the full POS wizard; no second filtering system.
import { filterMenuItems, subcategoryTabsFor, SUBCATEGORY_ALL } from '../../../../utils/menuHierarchy';

const ICON_MAP = {
  utensils: '🍽️', pizza: '🍕', hamburger: '🍔', coffee: '☕',
  wine: '🍷', cake: '🎂', 'ice-cream': '🍦', salad: '🥗',
  fish: '🐟', drumstick: '🍗', bread: '🍞', cheese: '🧀',
  apple: '🍎', cup: '🥤', beer: '🍺',
};

export default function PosWorkspace() {
  const { settings } = useSettingsStore();
  // Dietary indicators only for food verticals (§10) — retail product cards
  // show no veg/non-veg marks. One capability check, not scattered flags.
  const isDietaryBusiness = (settings.capabilities || getBusinessCapabilities(settings.businessType)).dietary === true;
  const currency = settings?.currencySymbol || '₹';
  const { activeOrderTakingId, setScreen, setCheckoutOrderId, addToast, goBack, refreshTrigger, incrementRefreshTrigger } = useUiStore();
  const { user } = useAuthStore();
  // The Payment action opens the billing overlay — restricted to billing-capable
  // roles (ADMIN/MANAGER/CASHIER). WAITER may take orders but never collect payment.
  const canBill = canHandleBilling(user?.role);

  // ── Data state ──
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);

  // ── Category-first workflow state ──
  // view 'categories' = large touch-friendly category picker (shown first)
  // view 'items'     = items belonging to the selected category
  const [view, setView] = useState('categories');
  const [selectedCategory, setSelectedCategory] = useState(null); // null = show categories view, then first cat
  const [selectedSubcategory, setSelectedSubcategory] = useState(SUBCATEGORY_ALL); // 'All' | 'NONE' | String(id)
  const [subcategories, setSubcategories] = useState([]); // loaded ONCE, reused across tab clicks (Part 1 req. 14)
  const [searchQuery, setSearchQuery] = useState('');

  // ── Cart / order state ──
  const [cartItems, setCartItems] = useState([]);
  // §7: capability-aware POS — a non-table business (retail/bakery/food-truck)
  // never shows Dine In / table selection. Derived from the server-resolved
  // capabilities, composed with the existing module toggles.
  const businessCaps = (settings?.capabilities) || {};
  const tablesCapable = businessCaps.tables !== false && businessCaps.floors !== false;
  const floorManagementOff = settings?.enableFloorManagement === false || !tablesCapable;
  const [orderType, setOrderType] = useState(floorManagementOff ? 'Takeaway' : 'Dine In');
  const [guestCount, setGuestCount] = useState(2);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [itemNotes, setItemNotes] = useState('');
  const [noteForItem, setNoteForItem] = useState(null);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  // Submit-in-progress state for Place Order / Payment (prevents double taps)
  const [submitting, setSubmitting] = useState(null); // null | 'place' | 'pay'

  // §2/§9: BASIC_POS quick-billing vs production mode.
  // - A QUICK_BILLING retail tenant is ALWAYS quick billing (no kitchen
  //   capability — the toggle never re-introduces restaurant behavior).
  // - A BASIC_POS food business follows "Enable Basic POS Quick Billing":
  //   ON → direct payment; OFF (default) → production (Order → KOT → Active
  //   Orders → kitchen → Ready → Bill) with a visible "Place Order" step.
  // Both resolve through the ONE centralized workflow-mode predicate
  // (isBasicPosProductionMode) shared with the Sidebar and route guard —
  // the three can never disagree.
  const isBasicPos = (settings?.capabilities || {}).kitchen === true && !tablesCapable;
  const isBasicPosProduction = isBasicPosProductionMode(settings);
  const counterSaleMode = tablesCapable
    ? false
    : isBasicPos
      ? settings?.enableCounterSale === true
      : true; // retail QUICK_BILLING — always quick billing

  // ── Barcode scanner (Part 11 + Counter Scan mode) — same entitlement rule
  // as the full POS wizard: plan includes barcode_scanner AND the restaurant
  // toggle is ON. When ON, the workspace switches ENTIRELY to Counter Scan
  // mode: no category cards, no subcategory tabs, no item grid.
  const canScanBarcode =
    useSettingsStore((s) => s.barcodeScannerAvailable) === true &&
    useSettingsStore((s) => s.settings?.barcodeScannerEnabled) === true;
  const scanMode = canScanBarcode; // dedicated Counter Scan screen replaces the category/item UI
  const scannerInputRef = useRef(null);
  const [scanError, setScanError] = useState(null); // { barcode } of the last failed scan

  const handleBarcodeScan = async (rawCode) => {
    const code = String(rawCode || '').trim();
    if (!code) return;
    try {
      const resp = await menuApi.getByBarcode(code);
      const item = resp?.item || resp?.data?.item;
      if (!item) {
        // Controlled not-found: keep the scan screen alive (spec §10).
        setScanError({ barcode: code });
        addToast(`Item not found for barcode: ${code}`, 'error');
        return;
      }
      setScanError(null);
      addToCart({
        id: `menu-${item.id}`,
        name: item.name,
        price: Number(item.price),
        currentStock: item.currentStock ?? null,
      });
      addToast(`${item.name} added`, 'success');
    } catch (e) {
      // axios interceptor exposes the HTTP status as e.status (e.response is
      // stripped from the processed error).
      const status = e?.status ?? e?.response?.status;
      if (status === 404) {
        setScanError({ barcode: code });
        addToast(`Item not found for barcode: ${code}`, 'error');
      } else if (status === 403) {
        addToast(e?.response?.data?.message || 'Barcode scanner is not enabled for this restaurant.', 'error');
      } else {
        addToast(e?.message || 'Barcode lookup failed', 'error');
      }
    } finally {
      // Clear + refocus after every scan — continuous scanning workflow (§12).
      requestAnimationFrame(() => {
        if (scannerInputRef.current) {
          scannerInputRef.current.value = '';
          scannerInputRef.current.focus();
        }
      });
    }
  };

  // Auto-focus the scanner input whenever scan mode mounts or re-renders.
  useEffect(() => {
    if (scanMode && scannerInputRef.current) {
      scannerInputRef.current.focus();
    }
  }, [scanMode]);

  useEffect(() => {
    loadMenu();
  }, []);

  // Real-time: stock is reserved at ORDER PLACEMENT, so refresh whenever any
  // order lifecycle event changes inventory — created/updated/cancelled/deleted
  // (any terminal in this restaurant), plus payment for legacy flows.
  useSocketEvent({ event: 'order:created', handler: () => { loadMenu(); } });
  useSocketEvent({ event: 'order:updated', handler: () => { loadMenu(); } });
  useSocketEvent({ event: 'order:cancelled', handler: () => { loadMenu(); } });
  useSocketEvent({ event: 'order:deleted', handler: () => { loadMenu(); } });
  useSocketEvent({ event: 'order:payment', handler: () => { loadMenu(); } });
  // Local fallback trigger (same-terminal payments increment refreshTrigger)
  useEffect(() => {
    if (refreshTrigger > 0) loadMenu();
  }, [refreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMenu = async () => {
    try {
      const [menuResp, catResp, subResp] = await Promise.all([
        menuApi.getAll(),
        categoryApi.getAll(),
        menuApi.getSubcategories(),
      ]);
      const items = (menuResp.items || []).map((m) => ({
        id: `menu-${m.id}`,
        name: m.name,
        price: Number(m.price),
        category: m.category?.name || 'Main Course',
        subcategoryId: m.subcategoryId ?? m.subcategory?.id ?? null,
        subcategoryName: m.subcategory?.name || null,
        sku: m.sku || null,
        barcode: m.barcode || null,
        dietaryType: m.dietaryType || (m.isVeg !== false ? 'VEG' : 'NON_VEG'),
        description: m.description || '',
        image: m.image || PLACEHOLDER_IMAGE,
        isLive: m.isAvailable !== false,
        currentStock: m.currentStock,
        isVeg: m.isVeg !== false,
      }));
      const cats = (catResp.categories || []).map((c) => ({
        id: `cat-${c.id}`,
        name: c.name,
        color: c.color || '#16A34A',
        icon: c.icon || 'utensils',
        isActive: c.isActive !== false,
      }));
      const subs = (subResp?.data?.subcategories || subResp?.subcategories || []).map((s) => ({
        id: s.id,
        name: s.name,
        categoryId: s.categoryId,
        categoryName: s.category?.name || null,
        isActive: s.isActive !== false,
        sortOrder: s.sortOrder || 0,
      }));
      setMenuItems(items);
      setCategories(cats);
      setSubcategories(subs);
    } catch (e) {
      console.error(e);
    }
  };

  // Only categories that actually contain live menu items
  const liveItems = menuItems.filter((i) => i.isLive);
  const catsWithItems = categories.filter(
    (c) => c.isActive !== false && liveItems.some((i) => i.category === c.name)
  );

  const filteredItems = filterMenuItems(liveItems, {
    selectedCategory: selectedCategory || 'All',
    selectedSubcategory,
    searchQuery,
  });

  // Subcategory tabs for the selected category, with item counts (reuses
  // already-loaded data — no per-click fetch). Hidden when none exist.
  const subTabs = selectedCategory
    ? subcategoryTabsFor(liveItems, subcategories, selectedCategory)
    : [];

  const countForCategory = (name) => liveItems.filter((i) => i.category === name).length;

  // ── Cart actions ──
  const addToCart = (item) => {
    if (item.currentStock !== null && item.currentStock !== undefined && item.currentStock <= 0) {
      addToast(`${item.name} is out of stock`, 'warning');
      return;
    }
    setCartItems((prev) => {
      const existing = prev.find((c) => c.itemId === item.id);
      if (existing) {
        return prev.map((c) => (c.itemId === item.id ? { ...c, quantity: c.quantity + 1 } : c));
      }
      return [...prev, { itemId: item.id, name: item.name, price: item.price, quantity: 1, notes: '', currentStock: item.currentStock }];
    });
  };

  const updateQty = (itemId, delta) => {
    setCartItems((prev) =>
      prev.map((c) => (c.itemId === itemId ? { ...c, quantity: Math.max(0, c.quantity + delta) } : c)).filter((c) => c.quantity > 0)
    );
  };

  const removeFromCart = (itemId) => {
    setCartItems((prev) => prev.filter((c) => c.itemId !== itemId));
  };

  const setItemNote = (itemId, notes) => {
    setCartItems((prev) => prev.map((c) => (c.itemId === itemId ? { ...c, notes } : c)));
    setNoteForItem(null);
    setItemNotes('');
  };

  const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const discount = 0;
  const tax = settings.taxType === 'Exclusive' ? (subtotal - discount) * ((settings.gstPercentage || 0) / 100) : 0;
  const total = settings.taxType === 'Inclusive' ? subtotal - discount : subtotal + tax - discount;

  // ── §4: KOT print for BASIC_POS production orders (reuses the existing
  // shared KOT print preview — no table/floor info on a counter order).
  // The backend auto-creates the KOT inside the order transaction and returns
  // it in the create-order response (order.kot[0]) — printing uses that
  // directly, so no second KOT-create request is made (a second call would
  // hit NO_PENDING_ITEMS and return created:false, silently skipping print).
  const printCounterKot = async (order, itemsPayload) => {
    try {
      const autoKot = (order.kot || [])[0] || null;
      if (!autoKot?.kotNo) return; // defensive: no auto-KOT on the response
      openKotPrintPreview({
        restaurantName: settings?.branding?.restaurantName || '',
        kotNo: autoKot.kotNo,
        orderNo: order.orderNo || String(order.id),
        tableNo: '', // counter order — never a table number
        orderType: order.orderType || 'COUNTER_SALE',
        waiterName: user?.name || '',
        customerName: customerName || '',
        customerPhone: customerPhone || '',
        guestCount: 1,
        notes: '',
        items: (order.orderItems || []).map((oi) => ({
          name: oi.menuItem?.name || `Item #${oi.menuItemId}`,
          quantity: oi.quantity,
          notes: oi.notes || '',
          dietaryType: oi.dietaryType || oi.menuItem?.dietaryType || null,
        })),
        footer: settings?.receiptFooterMessage || 'Thank You!',
        date: new Date(),
      });
    } catch (e) {
      // The auto-KOT is created server-side on order creation; a manual KOT
      // attempt failing (e.g. NO_PENDING_ITEMS race) must not fail the order.
      console.warn('[BASIC_POS] KOT print skipped:', e?.message);
    }
  };

  const handlePlaceOrder = async () => {
    if (cartItems.length === 0 || submitting) return;
    setSubmitting('place');
    try {
      const itemsPayload = cartItems.map((c) => ({
        menuItemId: parseInt(c.itemId.replace('menu-', '')),
        quantity: c.quantity,
        notes: c.notes || undefined,
      }));
      const resp = await orderApi.create({
        // §3: a BASIC_POS food business has no tables — counter orders are
        // COUNTER_SALE (backend enforces the same and ignores any table).
        orderType: isBasicPos ? 'COUNTER_SALE' : (orderType === 'Dine In' ? 'DINE_IN' : orderType === 'Takeaway' ? 'TAKEAWAY' : 'DELIVERY'),
        items: itemsPayload,
        notes: '',
      });
      if (!resp.success || !resp.data) {
        throw new Error(resp.message || 'Failed to create order');
      }
      // §1/§13: PRODUCTION MODE STOPS HERE — create + KOT + toast + clear,
      // NEVER touch payment. The direct-payment path below runs ONLY in
      // quick-billing mode (Quick Billing ON / retail). COUNTER_SALE alone
      // must never determine whether payment opens.
      const order = resp.data;
      if (isBasicPosProduction) {
        await printCounterKot(order, itemsPayload);
        addToast(`Order #${order.orderNo || order.id} sent to kitchen.`, 'success');
        setCartItems([]);
        incrementRefreshTrigger(); // Active Orders re-fetches on next open
        setScreen('active_orders');
        return;
      }
      {
        if (isBasicPos) {
          // §4: legacy quick-billing BASIC_POS path — kept for backward
          // compatibility, though the centralized predicate normally routes
          // here only when Quick Billing is ON (direct payment later in
          // handlePayment).
          await printCounterKot(order, itemsPayload);
          addToast(`Order #${order.orderNo || order.id} sent to kitchen!`, 'success');
        } else {
          useCartStore.getState().addOrder({
            id: `ord-${order.id}`,
            orderNumber: `#${order.orderNo || order.id}`,
            tableName: activeOrderTakingId ? `Table ${parseInt(activeOrderTakingId.split('-')[1] || '0')}` : 'Takeaway',
            guestsCount: guestCount,
            timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
            serverName: 'Staff',
            status: 'PREP',
            items: cartItems.map((c) => ({ itemId: c.itemId, name: c.name, price: c.price, quantity: c.quantity, status: 'Pending', notes: c.notes })),
            orderType,
            customerName,
            customerPhone,
            discountAmount: 0,
            paymentStatus: 'Pending',
          });
          addToast(`Order #${order.orderNo || order.id} placed successfully!`, 'success');
        }
        setCartItems([]);
        setScreen('dashboard');
      }
    } catch (e) {
      addToast(e.message || 'Failed to place order', 'error');
      console.error('Order creation error:', e);
    } finally {
      setSubmitting(null);
    }
  };

  const handlePayment = async () => {
    if (submitting) return;
    if (!canBill) {
      addToast('Payment is restricted to billing staff.', 'warning');
      return;
    }
    if (cartItems.length === 0 && !activeOrderTakingId) {
      addToast('Add items to cart first', 'warning');
      return;
    }
    setSubmitting('pay');
    if (cartItems.length > 0) {
      try {
        const itemsPayload = cartItems.map((c) => ({
          menuItemId: parseInt(c.itemId.replace('menu-', '')),
          quantity: c.quantity,
          notes: c.notes || undefined,
        }));
        const backendOrderType = counterSaleMode
          ? 'COUNTER_SALE'
          : (orderType === 'Dine In' ? 'DINE_IN' : orderType === 'Takeaway' ? 'TAKEAWAY' : 'DELIVERY');
        const resp = await orderApi.create({ orderType: backendOrderType, items: itemsPayload, notes: '' });
        if (resp.success && resp.data) {
          const order = resp.data;
          addToast(counterSaleMode
            ? `Counter sale #${order.orderNo || order.id} created! Opening payment...`
            : `Order #${order.orderNo || order.id} placed! Opening payment...`, 'success');
          setCartItems([]);
          setCheckoutOrderId(order.id);
        } else {
          throw new Error(resp.message || 'Failed to create order');
        }
      } catch (e) {
        addToast(e.message || 'Failed to place order', 'error');
      } finally {
        setSubmitting(null);
      }
    } else if (activeOrderTakingId && !counterSaleMode) {
      const backendId = parseInt(activeOrderTakingId.replace('ord-', ''), 10);
      if (Number.isSafeInteger(backendId) && backendId > 0) {
        setCheckoutOrderId(backendId);
      } else {
        addToast('Invalid order ID.', 'error');
        setCheckoutOrderId(null);
      }
      setSubmitting(null);
    }
  };

  // ── Select a category → show its items ──
  const selectCategory = (name) => {
    setSelectedCategory(name);
    setSelectedSubcategory(SUBCATEGORY_ALL); // category change resets subcategory (Part 2 req. 3)
    setSearchQuery('');
    setView('items');
  };

  const selectSubcategory = (value) => setSelectedSubcategory(value);

  // When entering items view without a category, auto-select first
  const handleBackToCategories = () => {
    setSelectedCategory(null);
    setView('categories');
  };

  // ── Counter Scan view (Barcode Scanner ON) — replaces the whole
  // category/subcategory/item UI. Real counter-POS: scan area + cart. ──
  const renderScanMode = () => (
    <div className="flex-1 flex flex-col items-center overflow-y-auto py-6 px-4">
      {/* Big scan target */}
      <div className={`w-full max-w-xl rounded-3xl border-2 border-dashed flex flex-col items-center justify-center gap-3 py-10 px-6 text-center transition-all ${
        scanError ? 'border-red-300 bg-red-50/60' : 'border-[#16A34A]/40 bg-[#16A34A]/5'
      }`}>
        {scanError ? (
          <AlertTriangle className="w-12 h-12 text-red-500" />
        ) : (
          <ScanBarcode className="w-12 h-12 text-[#16A34A]" />
        )}
        <p className="text-base font-extrabold text-slate-800">
          {scanError ? 'Product not found' : 'SCAN BARCODE'}
        </p>
        {scanError ? (
          <p className="text-[11px] font-bold text-red-600">Barcode: <span className="font-mono">{scanError.barcode}</span></p>
        ) : (
          <p className="text-[11px] font-semibold text-slate-500">Scan product barcode to add item</p>
        )}
      </div>

      {/* Scanner input — HID scanners submit with Enter; kept focused after
          every scan so the cashier can Scan → Scan → Scan → Payment. */}
      <form
        className="w-full max-w-xl mt-5"
        onSubmit={(e) => {
          e.preventDefault();
          const el = e.target.elements.barcodeInput;
          const v = el.value;
          handleBarcodeScan(v);
          el.value = '';
        }}
      >
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Barcode</label>
        <input
          type="text"
          name="barcodeInput"
          placeholder="Scan barcode..."
          autoComplete="off"
          ref={scannerInputRef}
          className="mt-1 w-full h-14 px-4 bg-white border-2 border-slate-200 focus:border-[#16A34A] rounded-2xl text-lg font-mono font-bold outline-none focus:ring-2 focus:ring-[#16A34A]/20 transition-all"
        />
      </form>

      <p className="text-[10px] text-slate-400 mt-3 flex items-center gap-1.5">
        <ScanLine className="w-3.5 h-3.5" /> Scanner stays focused — scan items back to back
      </p>
    </div>
  );

  // ── Category picker view (large touch cards) ──
  const renderCategories = () => (
    <div className="flex-1 overflow-y-auto pr-0.5">
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
        {catsWithItems.map((cat) => (
          <button
            key={cat.id}
            onClick={() => selectCategory(cat.name)}
            className="group relative flex flex-col items-center justify-center gap-2.5 min-h-[120px] p-4 rounded-2xl border-2 transition-all cursor-pointer active:scale-[0.97] border-slate-200 bg-white hover:shadow-md"
            style={{ borderColor: selectedCategory === cat.name ? cat.color : undefined }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-sm"
              style={{ backgroundColor: `${cat.color}18`, border: `1px solid ${cat.color}40` }}
            >
              {ICON_MAP[cat.icon] || '🍽️'}
            </div>
            <div className="text-center">
              <p className="text-sm font-extrabold text-slate-800" style={{ color: cat.color }}>{cat.name}</p>
              <p className="text-[11px] font-bold text-slate-400 mt-0.5">{countForCategory(cat.name)} items</p>
            </div>
          </button>
        ))}
      </div>

      {catsWithItems.length === 0 && (
        <div className="text-center py-20 text-slate-400 text-sm italic">
          <UtensilsCrossed className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          No categories with available items found.
        </div>
      )}
    </div>
  );

  // ── Items view (large touch cards for the selected category) ──
  const renderItems = () => (
    <div className="flex-1 overflow-y-auto pr-0.5">
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {filteredItems.map((item) => {
          const outOfStock = item.currentStock !== null && item.currentStock !== undefined && item.currentStock <= 0;
          const lowStock = !outOfStock && item.currentStock !== null && item.currentStock < 10;
          return (
            <div
              key={item.id}
              onClick={() => addToCart(item)}
              className={`bg-white border rounded-2xl overflow-hidden cursor-pointer transition-all active:scale-[0.97] ${
                outOfStock
                  ? 'opacity-50 border-slate-200 cursor-not-allowed'
                  : lowStock
                    ? 'border-red-300 hover:shadow-md ring-1 ring-red-100'
                    : 'border-slate-200 hover:border-[#16A34A] hover:shadow-md'
              }`}
            >
              <div className="relative h-24 rounded-none overflow-hidden border-b border-slate-100">
                <img src={item.image} alt={item.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" decoding="async"
                  onError={(e) => { e.target.src = PLACEHOLDER_IMAGE; }} />
                {isDietaryBusiness && (
                <span className="absolute top-1.5 left-1.5 w-4 h-4 rounded-sm border-2 flex items-center justify-center bg-white/90 ${
                  item.isVeg ? 'border-emerald-600' : 'border-red-600'
                }">
                  <span className={`w-2 h-2 rounded-full ${item.isVeg ? 'bg-emerald-600' : 'bg-red-600'}`} />
                </span>
                )}
                <span className="absolute bottom-1.5 right-1.5 bg-slate-900/80 text-white font-mono text-[10px] font-bold px-1.5 py-0.5 rounded">{currency}{item.price}</span>
                {lowStock && (
                  <span className="absolute bottom-1.5 left-1.5 bg-red-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded">Low Stock</span>
                )}
              </div>
              <div className="p-2.5">
                <p className="text-[13px] font-extrabold text-slate-800 truncate">{item.name}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-[13px] font-bold text-[#16A34A] font-mono">{currency}{item.price}</p>
                  {outOfStock ? (
                    <span className="text-[9px] font-bold text-slate-400">Out of stock</span>
                  ) : (
                    <span className="text-[9px] font-bold text-slate-400">
                      {item.currentStock !== null && item.currentStock !== undefined ? `${item.currentStock} left` : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {filteredItems.length === 0 && (
          <div className="col-span-full text-center py-16 text-slate-400 text-sm italic">
            <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            No menu items found in this category.
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col md:flex-row gap-4 md:h-[calc(100vh-120px)] animate-fade-in">
      {/* Left: Category / Item area */}
      <div className="flex-1 flex flex-col gap-3 md:overflow-hidden min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 shrink-0">
          {view === 'items' ? (
            <button
              onClick={handleBackToCategories}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-xl text-[11px] uppercase tracking-wider transition-all cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              Categories
            </button>
          ) : (
            <button
              onClick={() => goBack()}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 font-bold rounded-xl text-[11px] uppercase tracking-wider transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold text-slate-800 leading-none">
              {counterSaleMode ? 'Basic POS — Quick Billing' : isBasicPos ? 'Basic POS — Counter Order' : 'POS Ordering'}
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5 truncate">
              {scanMode ? 'Scan products to add them to the sale' : view === 'categories' ? 'Select a category to start' : `${selectedCategory || 'All'} · ${filteredItems.length} items`}
            </p>
          </div>
          {scanMode && (
            <span className="ml-auto shrink-0 inline-flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#16A34A] text-white">
              <ScanLine className="w-3 h-3" /> Scan Mode On
            </span>
          )}
        </div>

        {/* COUNTER SCAN MODE: no categories/subcategories/items at all —
            the dedicated scan screen replaces the browsing UI (spec §8). */}
        {scanMode ? (
          renderScanMode()
        ) : (
          <>
        {/* Items view: quick category chips for fast navigation */}
        {view === 'items' && (
          <div className="flex gap-1 overflow-x-auto pb-0.5 no-scrollbar shrink-0">
            {catsWithItems.map((cat) => (
              <button key={cat.id} onClick={() => selectCategory(cat.name)}
                className={`shrink-0 px-3 py-2 text-[11px] font-bold rounded-xl transition-all cursor-pointer ${selectedCategory === cat.name ? 'text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                style={selectedCategory === cat.name ? { backgroundColor: cat.color } : undefined}>
                {ICON_MAP[cat.icon] || '🍽️'} {cat.name}
              </button>
            ))}
          </div>
        )}

        {/* Subcategory tabs — directly below the category row (Part 2 req. 1-4).
            Hidden when the selected category has no subcategories at all. */}
        {view === 'items' && selectedCategory && subTabs.length > 0 && (
          <div className="flex gap-1 overflow-x-auto pb-0.5 no-scrollbar shrink-0">
            {[{ id: SUBCATEGORY_ALL, name: 'All' }, ...subTabs].map((sub) => (
              <button key={sub.id} onClick={() => selectSubcategory(sub.id)}
                className={`shrink-0 px-3 py-1.5 text-[10px] font-bold rounded-lg border transition-all cursor-pointer ${
                  selectedSubcategory === sub.id
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                }`}>
                {sub.name}{typeof sub.count === 'number' ? ` (${sub.count})` : ''}
              </button>
            ))}
          </div>
        )}

        {/* Barcode input in NORMAL (scan-off) mode was removed: per spec §13
            both interfaces must never show at once. Scan mode owns the
            barcode workflow; normal mode is Category → Subcategory → Item. */}

        {/* Search (items view only) */}
        {view === 'items' && (
          <div className="relative shrink-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input type="text" placeholder="Search menu items..." value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 h-10 bg-white border border-slate-200 focus:border-[#16A34A] rounded-xl text-xs outline-none" />
          </div>
        )}

        {/* Category picker OR item grid — never both */}
        {view === 'categories' ? renderCategories() : renderItems()}
          </>
        )}
      </div>

      {/* Right: Cart — full width below the grid on mobile, wider fixed rail on md+ for touch comfort */}
      <div className="w-full md:w-[340px] lg:w-[380px] xl:w-[420px] md:h-full bg-white rounded-[18px] border border-slate-200 shadow-xs flex flex-col overflow-hidden shrink-0 md:min-h-0">
        {/* Cart Header */}
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-extrabold text-slate-800 uppercase flex items-center gap-1.5">
              <ShoppingCart className="w-4 h-4 text-[#16A34A]" /> {counterSaleMode ? 'Counter Sale' : 'Order'} ({cartItems.length})
            </h3>
            {!counterSaleMode && !floorManagementOff && (
              <div className="flex bg-slate-200 p-0.5 rounded-lg text-[9px] font-bold">
                {['Dine In', 'Takeaway', 'Parcel'].map((type) => (
                  <button key={type} onClick={() => setOrderType(type)}
                    className={`px-2.5 py-1.5 rounded cursor-pointer ${orderType === type ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500'}`}>{type === 'Dine In' ? 'Dine' : type === 'Takeaway' ? 'Take' : 'Parcel'}</button>
                ))}
              </div>
            )}
          </div>
          {!counterSaleMode && (
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-white border rounded-lg text-[10px] font-bold">
                <button onClick={() => setGuestCount((p) => Math.max(1, p - 1))} className="px-2.5 py-1.5 hover:bg-slate-50 cursor-pointer"><Minus className="w-3.5 h-3.5" /></button>
                <span className="px-2 py-1.5 font-extrabold">{guestCount}</span>
                <button onClick={() => setGuestCount((p) => p + 1)} className="px-2.5 py-1.5 hover:bg-slate-50 cursor-pointer"><Plus className="w-3.5 h-3.5" /></button>
              </div>
              <button onClick={() => setShowCustomerModal(true)} className="text-[10px] font-bold text-slate-500 hover:text-[#16A34A] flex items-center gap-0.5 cursor-pointer">
                <User className="w-3 h-3" /> {customerName || 'Guest'}
              </button>
            </div>
          )}
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cartItems.map((item) => (
            <div key={item.itemId} className="border border-slate-100 rounded-xl p-2.5">
              <div className="flex justify-between items-start">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-extrabold text-slate-800 truncate">{item.name}</p>
                  <p className="text-[10px] font-bold text-slate-500 font-mono">{currency}{item.price} each</p>
                </div>
                <button onClick={() => removeFromCart(item.itemId)} aria-label={`Remove ${item.name} from cart`} className="p-1.5 text-slate-300 hover:text-red-500 cursor-pointer">
                  <Trash className="w-3.5 h-3.5" />
                </button>
              </div>
              {item.notes && <p className="text-[9px] text-red-600 font-semibold mt-1 bg-red-50 rounded px-1.5 py-0.5">📝 {item.notes}</p>}
              <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-50">
                <div className="flex items-center border rounded-lg bg-slate-50 text-[10px]">
                  <button onClick={() => updateQty(item.itemId, -1)} className="px-2.5 py-1.5 hover:bg-slate-100 cursor-pointer"><Minus className="w-3.5 h-3.5" /></button>
                  <span className="px-2.5 py-1.5 font-extrabold">{item.quantity}</span>
                  <button onClick={() => updateQty(item.itemId, 1)} className="px-2.5 py-1.5 hover:bg-slate-100 cursor-pointer"><Plus className="w-3.5 h-3.5" /></button>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => { setNoteForItem(item.itemId); setItemNotes(item.notes || ''); }} aria-label={`Add note to ${item.name}`} className="p-1.5 text-slate-400 hover:text-[#C85A32] cursor-pointer"><span className="text-[10px]">📝</span></button>
                  <span className="font-mono font-bold text-xs text-slate-800">{currency}{(item.price * item.quantity).toFixed(0)}</span>
                </div>
              </div>
            </div>
          ))}
          {cartItems.length === 0 && (
            <div className="text-center py-12 text-slate-400 text-xs italic">
              <LayoutGrid className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              Cart is empty. Pick a category and tap items to add them.
            </div>
          )}
        </div>

        {/* Order Summary & Actions */}
        <div className="border-t border-slate-200 p-3.5 bg-slate-50/50 space-y-2">
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between font-semibold text-slate-600"><span>Subtotal</span><span className="font-mono">{currency}{subtotal.toFixed(0)}</span></div>
            {discount > 0 && <div className="flex justify-between font-semibold text-green-600"><span>Discount</span><span className="font-mono">-{currency}{discount.toFixed(0)}</span></div>}
            <div className="flex justify-between font-bold text-slate-800 text-sm border-t border-slate-200 pt-1.5">
              <span>Total</span><span className="font-mono text-[#16A34A]">{currency}{total.toFixed(0)}</span>
            </div>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => setCartItems([])} className="flex-1 h-10 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-500 hover:bg-slate-100 cursor-pointer transition-all">Clear</button>
          {/* §6: production mode shows the single primary action here; the
              direct-PAYMENT button below is hidden (mutually exclusive with
              Place Order (KOT) — no two competing workflows). */}
          {!counterSaleMode && (
            <button onClick={handlePlaceOrder} disabled={cartItems.length === 0 || submitting !== null}
              className="flex-[2] h-10 bg-[#16A34A] hover:bg-[#15803D] text-white font-bold rounded-xl text-[10px] uppercase tracking-wider shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all">
              {submitting === 'place' ? 'Placing...' : (isBasicPos ? 'Place Order (KOT)' : 'Place Order')}
            </button>
          )}
          </div>
          {/* §7/§11: direct PAYMENT shows for quick-billing flows (quick-billing
              BASIC_POS with enableCounterSale ON, and retail QUICK_BILLING)
              and is PRESERVED for the existing restaurant flow. Hidden only
              for BASIC_POS production mode, where Place Order (KOT) is the
              single order-completion action and payment happens later via Bill. */}
          {canBill && (counterSaleMode || tablesCapable) && (
            <button
              onClick={handlePayment}
              disabled={(cartItems.length === 0 && !activeOrderTakingId) || submitting !== null}
              className={`w-full h-10 font-bold rounded-xl text-[10px] uppercase tracking-wider shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                counterSaleMode
                  ? 'bg-[#16A34A] hover:bg-[#15803D] text-white'
                  : 'bg-[#1a73e8] hover:bg-[#1557b0] text-white'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              {submitting === 'pay' ? 'Processing...' : (counterSaleMode ? 'PAYMENT' : 'Payment')}
            </button>
          )}
        </div>
      </div>

      {/* Notes Modal */}
      {noteForItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-xs rounded-xl shadow-xl border border-slate-100 p-4 space-y-3">
            <h4 className="text-xs font-extrabold text-slate-800">Add Note</h4>
            <input value={itemNotes} onChange={(e) => setItemNotes(e.target.value)} placeholder="e.g., Less spicy, extra cheese..." className="w-full h-9 px-2 bg-slate-50 border rounded-lg text-xs outline-none" />
            <div className="flex gap-2">
              <button onClick={() => setNoteForItem(null)} className="flex-1 h-8 border rounded-lg text-xs font-bold text-slate-500 cursor-pointer">Cancel</button>
              <button onClick={() => setItemNote(noteForItem, itemNotes)} className="flex-[2] h-8 bg-[#16A34A] text-white rounded-lg text-xs font-bold cursor-pointer">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Modal */}
      {showCustomerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-xs rounded-xl shadow-xl border border-slate-100 p-4 space-y-3">
            <h4 className="text-xs font-extrabold text-slate-800">Customer Details</h4>
            <div className="space-y-2">
              <div className="relative">
                <User className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer name" className="w-full pl-8 h-8 bg-slate-50 border rounded-lg text-xs outline-none" />
              </div>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Phone number" className="w-full pl-8 h-8 bg-slate-50 border rounded-lg text-xs outline-none" />
              </div>
            </div>
            <button onClick={() => setShowCustomerModal(false)} className="w-full h-8 bg-[#16A34A] text-white rounded-lg text-xs font-bold cursor-pointer">Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
