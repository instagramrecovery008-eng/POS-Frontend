import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, ChevronLeft, ChevronRight, Check, ShoppingCart, Users,
  UtensilsCrossed, Search, Plus, Minus, Trash2,
  CreditCard, Smartphone, AlertTriangle, AlertCircle,
  Clock, Printer, FileText, Save, Play, Ban,
  ArrowRight, ArrowLeft, Building2, ChefHat,
  User, Loader2,
  RotateCcw, UserPlus, LayoutGrid, Package,
  Coffee, Pizza, Cake, Soup, Salad, Beef, Fish, Sandwich, Wine, Beer, Croissant
} from 'lucide-react';
import { useUiStore, useCartStore, useSettingsStore, useAuthStore } from '../../../../store';
import { getBusinessCapabilities, resolveMenuItemUnitPrice, isAcNonAcPricingEnabled } from '../../../../utils/businessCapabilities';
import { menuApi } from '../../../../api/menu.api';
import { tableApi } from '../../../../api/table.api';
import { orderApi } from '../../../../api/order.api';
import { kotApi } from '../../../../api/kot.api';
import { categoryApi } from '../../../../api/category.api';
import { userApi } from '../../../../api/user.api';
import { floorApi } from '../../../../api/floor.api';
import { dispatchKotPrint } from '../../../../services/kotPrintService';
import { openKotPrintWindow, closeKotPrintWindow } from '../../../../services/printService';
import { PLACEHOLDER_IMAGE } from '../../../../lib/imagePlaceholder';
import { useBodyScrollLock } from '../../../../hooks/useBodyScrollLock';
import useKeyboardWedgeScanner from '../../../../hooks/useKeyboardWedgeScanner';
import {
  SUBCATEGORY_ALL,
  subcategoryTabsFor,
  filterMenuItems,
} from '../../../../utils/menuHierarchy';
import {
  resolveAvailableOrderTypes,
  resolveAccessibleFloors,
} from '../../../../utils/orderFlow';

const STEP_LABELS = ['Order Type', 'Floor', 'Table', 'Menu', 'Review'];

// ── Category navigation persistence ─────────────────────────────────────────
// The selected menu category survives a page refresh (session storage is
// per-tab and cleared on logout/tab close, so no cross-session leakage). The
// value is only restored when the refreshed menu still contains that category.
const CATEGORY_STORAGE_KEY = 'pos_menu_category';
const readStoredCategory = () => {
  try {
    return window.sessionStorage.getItem(CATEGORY_STORAGE_KEY) || 'All';
  } catch {
    return 'All';
  }
};

// Desktop PC breakpoint (Tailwind `lg`) — matches the CSS gate used by the
// restaurant category rail, so the JS mounting decision and the CSS widths can
// never disagree.
const DESKTOP_RAIL_QUERY = '(min-width: 1024px)';
const readDesktopRailViewport = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(DESKTOP_RAIL_QUERY).matches;
};

// ── Category icons (restaurant PC sidebar) ─────────────────────────────────
// Deterministic keyword → icon mapping using the app's EXISTING lucide set (no
// new icon dependency). Unmatched names fall back to the generic Package icon, so every
// category always has a recognizable, labelled control in the collapsed rail.
const CATEGORY_ICON_RULES = [
  [/pizza/i, Pizza],
  [/coffee|tea|beverage|drink|juice|shake|smoothie|mocktail|cocktail|soda/i, Coffee],
  [/dessert|sweet|cake|ice ?cream|pastry|bakery/i, Cake],
  [/soup|starter|appetizer/i, Soup],
  [/salad|healthy|vegan/i, Salad],
  [/chicken|mutton|kebab|tandoori|beef|steak|grill/i, Beef],
  [/fish|seafood|prawn/i, Fish],
  [/burger|sandwich|wrap|roll|snack/i, Sandwich],
  [/wine|alcohol|liquor/i, Wine],
  [/beer/i, Beer],
  [/bread|croissant/i, Croissant],
];
const categoryIconFor = (name) => {
  const label = String(name || '');
  const rule = CATEGORY_ICON_RULES.find(([pattern]) => pattern.test(label));
  return rule ? rule[1] : Package;
};

const ORDER_TYPE_OPTIONS = [
  {
    value: 'dine_in', label: 'Dine In', desc: 'Customer eats at the restaurant',
    icon: UtensilsCrossed, color: '#16A34A', bg: 'bg-emerald-50',
  },
  {
    value: 'takeaway', label: 'Take Away', desc: 'Customer takes food to go',
    icon: ShoppingCart, color: '#C85A32', bg: 'bg-orange-50',
  },
];

// ── Confirmation Dialog ─────────────────────────────────────────────────────
function ConfirmDialog({ open, title, message, confirmLabel, confirmVariant, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl border border-slate-100 p-5 space-y-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            confirmVariant === 'danger' ? 'bg-red-50' :
            confirmVariant === 'warning' ? 'bg-amber-50' : 'bg-emerald-50'
          }`}>
            <AlertTriangle className={`w-5 h-5 ${
              confirmVariant === 'danger' ? 'text-red-500' :
              confirmVariant === 'warning' ? 'text-amber-500' : 'text-emerald-500'
            }`} />
          </div>
          <div>
            <h4 className="text-sm font-extrabold text-slate-800">{title}</h4>
            <p className="text-[11px] text-slate-500 mt-0.5">{message}</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel}
            className="h-10 px-4 bg-white border border-slate-200 rounded-xl text-[10px] font-bold text-slate-600 hover:bg-slate-50 transition-all cursor-pointer">
            Cancel
          </button>
          <button onClick={onConfirm}
            className={`h-10 px-4 rounded-xl text-[10px] font-bold text-white transition-all cursor-pointer ${
              confirmVariant === 'danger' ? 'bg-red-600 hover:bg-red-700' :
              confirmVariant === 'warning' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-[#16A34A] hover:bg-[#15803D]'
            }`}>
            {confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Wizard Component ───────────────────────────────────────────────────
export default function TakeOrderWizard({ mode = 'modal' } = {}) {
  const { showTakeOrderWizard, setShowTakeOrderWizard, setScreen, goBack: goBackScreen, addToast, activeOrderTakingId, setActiveOrderTakingId, currentScreen, incrementRefreshTrigger, pendingTable, clearPendingTable } = useUiStore();
  const { addOrder } = useCartStore();
  const { settings } = useSettingsStore();
  const { user } = useAuthStore();
  const assignedOrderTypes = useAuthStore((s) => s.staffAssignedOrderTypes);
  // Every store hook is called unconditionally, in a fixed order. An earlier
  // version short-circuited the third selector inside `&&`, so when the scanner
  // was unavailable the hook was skipped entirely — React then saw a different
  // hook sequence on the next render ("change in the order of Hooks" /
  // updateCallback crash). Read the flag, then combine the plain booleans.
  const barcodeAvailable = useSettingsStore((s) => s.barcodeScannerAvailable === true);
  const barcodeSupported = useSettingsStore((s) => s.barcodeScannerSupported === true);
  const barcodeEnabled = useSettingsStore((s) => s.settings?.barcodeScannerEnabled === true);
  const canScanBarcode = barcodeAvailable && barcodeSupported && barcodeEnabled;
  const printerConfigured = useSettingsStore((s) => s.printerConfigured) !== false;

  // ── All high-cost / derived values computed BEFORE any hook. ──
  // Capabilities come from the server-resolved settings. When that payload has
  // not arrived yet (or omits the map), fall back to the centralized
  // business-type map so a KOT / dietary business never loses its workflow
  // during load — the fallback is the same one the rest of the shell uses.
  const wizardCaps = settings?.capabilities || getBusinessCapabilities(settings?.businessType);
  const skipFloorMgmtResolved = settings?.enableFloorManagement === false || wizardCaps.tables === false;
  const isExemptRole = ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(String(user?.role || '').toUpperCase());
  const grantLoaded = !!user && (isExemptRole || Array.isArray(assignedOrderTypes));
  const orderTypeResolution = resolveAvailableOrderTypes({
    role: user?.role,
    assignedOrderTypes,
    grantLoaded,
    floorManagementOff: skipFloorMgmtResolved,
  });
  const acNonAcPricing = isAcNonAcPricingEnabled(settings);
  // PC category-sidebar treatment applies to RESTAURANT tenants ONLY. The
  // business type is the server-resolved platform value in the settings payload
  // (authoritative) — never inferred from category names or product data.
  const isRestaurantTenant = String(settings?.businessType || '').trim().toUpperCase() === 'RESTAURANT';
  const isDietaryBusiness = wizardCaps.dietary === true;
  const kotCapable = wizardCaps.kot === true;
  const currency = settings?.currencySymbol || '';
  const isServiceStaff = String(user?.role || '').toUpperCase() === 'WAITER';
  const takeawayGranted = isExemptRole || (Array.isArray(assignedOrderTypes) && assignedOrderTypes.includes('TAKEAWAY'));
  const isPageMode = mode === 'page';

  const [submitting, setSubmitting] = useState(null); // null | 'kot' | 'order' | 'update'
  // Synchronous re-entrancy guard: React state alone is async — a rapid
  // double-tap on Print KOT / Place Order / Update would fire two
  // order-creation requests (duplicate order + double stock deduction).
  const submittingRef = useRef(false);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const mountedRef = useRef(true);
  const previousScreenRef = useRef(null);

  // ── Step 1: Order Type ──
  const [orderType, setOrderType] = useState(null);

  // ── Wizard step ──
  // Declared BEFORE advanceOnce and every effect that reads it: dependency
  // arrays and callbacks are evaluated during render, so a later declaration
  // is a temporal-dead-zone ReferenceError at runtime.
  const [currentStep, setCurrentStep] = useState(0);

  // ── Order-type derived values ──
  // These MUST stay BELOW the orderType state they read. Moving them back up
  // above the state hooks reintroduces the `Cannot access 'orderType' before
  // initialization` crash the wizard had.
  const isTakeaway = orderType === 'takeaway';
  const needsTable = orderType === 'dine_in';
  const skipFloorMgmt = skipFloorMgmtResolved;
  const maxStep = isTakeaway ? 2 : (skipFloorMgmt ? 3 : 4);
  const tableFlowReturnScreen = skipFloorMgmt ? 'dashboard' : 'tables';

  // ── Auto-advance guard (touch/UX) ──
  // A synchronous ref guard prevents duplicate navigation from rapid taps:
  // React state updates are async, so two quick clicks on the same option
  // could fire two transitions. The guard is cleared in the same tick after
  // the transition is scheduled, so Back/forward navigation stays unaffected.
  const autoAdvanceRef = useRef(false);
  const advanceOnce = useCallback((toStep) => {
    if (autoAdvanceRef.current) return; // duplicate tap → ignored
    autoAdvanceRef.current = true;
    setCurrentStep(toStep);
    // Release the guard after the state commit window (no timers needed for
    // correctness — this only widens the double-tap rejection window slightly).
    setTimeout(() => { autoAdvanceRef.current = false; }, 0);
  }, []);

  // ── Step 2: Floor ──
  const [floors, setFloors] = useState([]);
  const [floorLoading, setFloorLoading] = useState(false);
  const [selectedFloor, setSelectedFloor] = useState(null);
  // True ONLY when floor assignments exist for this user (backend `restricted`).
  // Drives auto-selection and the "no floor assigned" state. It must never be
  // inferred from an empty list — "no assignments configured" means ALL active
  // floors, and a FAILED assignment request is an error state, not a licence to
  // show every floor.
  const [floorsRestricted, setFloorsRestricted] = useState(false);
  const [floorLoadError, setFloorLoadError] = useState(null);

  // ── Step 3: Table ──
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [tableLoading, setTableLoading] = useState(false);

  // ── Waiter ──
  // Service Staff is NO LONGER selectable: the backend attributes the order to
  // the authenticated user (JWT → order.userId). `waiterName` only feeds the
  // KOT print preview with the logged-in user's display name.
  const [waiterLoading, setWaiterLoading] = useState(false);
  const waiterName = user?.name || '';

  // ── Customer ──
  // Customer is no longer part of the New Order flow (backend falls back to
  // the Walk-in customer). No selection UI is rendered; legacy state vars are
  // kept minimal for edit-existing-order rendering paths.
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // ── Step 4: Menu ──
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]); // loaded once with the menu (Part 2 req. 2)
  const [menuError, setMenuError] = useState(null); // menu request failed → error state + Retry (req 15)
  const [selectedCat, setSelectedCat] = useState(readStoredCategory);
  // Captured once (before the wizard's own reset can change the selection) so
  // the value can be re-applied after the menu has loaded.
  const [restoredCategory] = useState(readStoredCategory);
  const [selectedSubcat, setSelectedSubcat] = useState(SUBCATEGORY_ALL); // 'All' | 'NONE' | subcategory id
  // Restaurant PC category rail (lg+ only — tablet/mobile keep their existing
  // layout). Collapsing is pure presentation: selected category, cart, step and
  // order state are untouched.
  const [categorySidebarCollapsed, setCategorySidebarCollapsed] = useState(false);
  // Desktop viewport flag for the POS Ordering page. The restaurant category
  // rail is MOUNTED at workspace level there (instead of inside the menu step)
  // so it spans from the top of the ordering workspace down to the action bar.
  // Reading it from one media query keeps ONE rail instance in the DOM — the
  // same categories, refs and selection — never a duplicated rail.
  const [desktopRailViewport, setDesktopRailViewport] = useState(readDesktopRailViewport);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mql = window.matchMedia(DESKTOP_RAIL_QUERY);
    const onChange = (event) => setDesktopRailViewport(event.matches);
    setDesktopRailViewport(mql.matches);
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else mql.addListener(onChange); // Safari < 14
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [notesForItem, setNotesForItem] = useState(null);
  const [notesText, setNotesText] = useState('');

  // ── Edit Mode ──
  // NOTE: declared BEFORE any effect that references `isEditing` — dependency
  // arrays are evaluated during render, so a later `const` would be a TDZ
  // ReferenceError ("Cannot access 'isEditing' before initialization").
  const [editingOrder, setEditingOrder] = useState(null);
  const [editExistingItems, setEditExistingItems] = useState([]);

  // ── Guest Count ──
  const [guestCount, setGuestCount] = useState(2);

  // ── Is editing existing order? ──
  // NOTE: declared BEFORE any effect that references `isEditing` — dependency
  // arrays are evaluated during render, so a later `const` would be a TDZ
  // ReferenceError ("Cannot access 'isEditing' before initialization").
  const isEditing = !!activeOrderTakingId && !!editingOrder;

  // ── Open Table hand-off (Floors & Tables → direct table ordering) ──
  // The Floors & Tables screen hands over the table the user tapped. A brand
  // new order for that table opens directly on the Menu with order type
  // DINE_IN: no Dine In/Take Away step, no floor/table re-selection. The order
  // id is what makes this an EDIT session, so the hand-off is ignored then.
  const isOpenTableFlow = !!pendingTable && !activeOrderTakingId;

  // ── Shared order-type resolution (Part 8) ──
  // Order type must be resolved BEFORE unnecessary steps render — no component
  // that depends on floor/table state mounts while orderType is still unknown.
  // §7: a non-table business (retail — capabilities.tables=false) also skips
  // floor management regardless of the tenant module toggle.

  // ── Clear floor/table when switching to Take Away ──
  useEffect(() => {
    if (orderType === 'takeaway') {
      setSelectedFloor(null);
      setSelectedTable(null);
    }
  }, [orderType]);

  // ── Force Service Staff to Dine In ──
  useEffect(() => {
    if (isServiceStaff && orderType !== 'dine_in') {
      setOrderType('dine_in');
    }
  }, [isServiceStaff, orderType]);

  // ── Load Data ──
  const [dataLoading, setDataLoading] = useState(false);

  // ── Page-mode table session ──
  // The POS Ordering screen (page mode) is entered from the Floors & Tables
  // board whenever a table is being ordered: the Open Table hand-off or "Add
  // Items" on an occupied table. The menu renders INLINE on that screen (no
  // separate modal/card overlay), so the session needs its own exit affordance
  // and its own end-of-session destination (the board it came from).
  const isTableSession = isPageMode && (isOpenTableFlow || !!activeOrderTakingId);

  // ── Dine-In-only staff: skip the Order Type step entirely ──
  // Part 8 (Cases A/B): when resolution yields exactly ONE type and no forced
  // selection yet, auto-set it and jump straight to the floor step (dine-in)
  // or menu (takeaway). Edit mode excluded. The resolution is computed before
  // any effect referencing it (no TDZ) and `isEditing` is already declared above.
  useEffect(() => {
    if (
      !isEditing &&
      grantLoaded &&
      !dataLoading &&
      orderTypeResolution.showSelection === false &&
      orderTypeResolution.forcedType &&
      currentStep === 0 &&
      orderType === null
    ) {
      const forced = orderTypeResolution.forcedType;
      setOrderType(forced);
      // Takeaway skips floor/table entirely (Part 8 Case B).
      if (forced === 'takeaway') {
        setCurrentStep(1);
      } else {
        setCurrentStep(skipFloorMgmtResolved ? 3 : 1);
      }
    }
  }, [isEditing, grantLoaded, dataLoading, orderTypeResolution.showSelection, orderTypeResolution.forcedType, currentStep, orderType, settings.enableFloorManagement]);

  // ── Auto-select the single assigned floor (Part 7 req. 1/6) ──
  // Exactly one permitted floor + dine-in + no selection yet → skip the floor
  // screen and land directly on that floor's tables. Multi-floor and zero-floor
  // cases stay interactive (zero → configuration message). The backend still
  // authorizes every floor/table operation (frontend is convenience only).
  useEffect(() => {
    if (
      orderType === 'dine_in' &&
      !floorLoading &&
      !selectedFloor &&
      currentStep === 1 &&
      !isEditing
    ) {
      const { autoSelectedFloor, hasAccess } = resolveAccessibleFloors(floors, floorsRestricted);
      if (hasAccess && autoSelectedFloor) {
        setSelectedFloor(autoSelectedFloor);
        setCurrentStep(2);
      }
    }
  }, [orderType, floorLoading, selectedFloor, currentStep, isEditing, floors, floorsRestricted]);

  useEffect(() => {
    mountedRef.current = true;
    // In page mode, always initialize (the page controls visibility)
    if (!isPageMode && !showTakeOrderWizard) return;
    // Capture the screen that opened the wizard so we can return there
    previousScreenRef.current = currentScreen;
    loadInitialData();
    return () => { mountedRef.current = false; };
  }, [isPageMode, showTakeOrderWizard]);

  const loadInitialData = async () => {
    resetWizard();
    setDataLoading(true);
    try {
      // Load every dataset independently — each loader already isolates its own
      // errors, and Promise.allSettled guarantees an optional failure (waiters,
      // customers, floors…) can never abort menu/table/order initialization.
      const settled = await Promise.allSettled([
        loadMenu(),
        loadCategories(),
        loadSubcategories(), // once per wizard open — tabs derive locally, no refetch per click (Part 2 req. 2)
        loadTables(),
        loadFloors(),
        // Waiter/customer lists no longer loaded: no selection UI exists in
        // the New Order flow (staff = logged-in user, customer = Walk-in).
      ]);
      const loadedTables = settled[3]?.status === 'fulfilled' ? (settled[3].value || []) : [];

      // ── Open Table hand-off ──
      // The tapped table is re-resolved from the tenant-scoped tables API (the
      // hand-off payload is never trusted as-is) and validated before the
      // order-entry screen is shown. Occupied / Reserved / Cleaning / deleted
      // tables follow the existing business rules and abort with a message.
      if (isOpenTableFlow) {
        const match = loadedTables.find((t) => t.id === `t-${pendingTable.id}`);
        if (!match) {
          addToast('That table is no longer available. Please pick another table.', 'error');
          clearPendingTable();
          // Page mode: leave the empty order screen and go back to the board
          // (overlay mode: close the overlay) — never strand the user on a
          // menu with no table.
          if (isPageMode) setScreen(tableFlowReturnScreen); else setShowTakeOrderWizard(false);
          return;
        }
        if (match.status !== 'Available') {
          addToast(`Table ${pendingTable.tableNo || match.number} is ${String(match.status).toLowerCase()} — it cannot be opened.`, 'error');
          clearPendingTable();
          setSelectedTable(null);
          if (isPageMode) setScreen(tableFlowReturnScreen); else setShowTakeOrderWizard(false);
          return;
        }
        setSelectedTable(match);
        setGuestCount(pendingTable.seats || match.seats || 2);
        setCurrentStep(3);
      }
      // If editing existing order, load it and pre-populate
      if (activeOrderTakingId) {
        try {
          const backendOrderId = parseInt(activeOrderTakingId.replace('ord-', ''), 10);
          if (!Number.isSafeInteger(backendOrderId) || backendOrderId <= 0) {
            addToast('Invalid order ID — cannot load order.', 'error');
            setActiveOrderTakingId(null);
            if (isPageMode) goBackScreen('active_orders');
            return;
          }
          const resp = await orderApi.getById(backendOrderId);
          if (resp?.data) {
            const orderData = resp.data;

            // ── Cancelled order guard ──
            if (orderData.status === 'CANCELLED' || orderData.cancelledAt) {
              addToast('This order has been cancelled and cannot be modified.', 'error');
              setShowTakeOrderWizard(false);
              setActiveOrderTakingId(null);
              if (isPageMode) goBackScreen('active_orders');
              return;
            }

            setEditingOrder(orderData);
            // Set order type — a COUNTER_SALE order (BASIC_POS production)
            // resolves to takeaway, the no-table branch of the wizard.
            const resolvedOrderType = orderData.orderType === 'DINE_IN' ? 'dine_in' : 'takeaway';
            setOrderType(resolvedOrderType);
            // Set guest count
            if (orderData.guestCount) setGuestCount(orderData.guestCount);
            // Keep the ORIGINAL order context visible: the table this order
            // belongs to is restored from the order relation (never re-picked),
            // so the header badge and the review/KOT payload identify the real
            // table. Counter/takeaway orders have no table and stay table-less.
            if (orderData.orderType === 'DINE_IN' && orderData.table) {
              const t = orderData.table;
              setSelectedTable({
                id: `t-${t.id}`,
                number: parseInt(t.tableNo) || t.id,
                name: t.name || `Table ${String(t.tableNo ?? t.id).padStart(2, '0')}`,
                seats: t.capacity || orderData.guestCount || 2,
                floorType: t.floorType || t.tableType || 'NON_AC',
                tableType: t.tableType || 'NON_AC',
                status: 'Occupied',
                floorId: t.floorId ? `floor-${t.floorId}` : null,
              });
            } else {
              setSelectedTable(null);
            }
            // Set customer info
            if (orderData.customer) {
              setCustomerName(orderData.customer.name || '');
              setCustomerPhone(orderData.customer.phone || '');
            }
            // Pre-populate existing order items (as read-only reference)
            const existingItems = (orderData.orderItems || []).map(oi => ({
              itemId: `menu-${oi.menuItemId}`,
              name: oi.menuItem?.name || 'Item',
              price: Number(oi.price || oi.rate || 0),
              qty: oi.quantity || 1,
              notes: oi.notes || ''
            }));
            setEditExistingItems(existingItems);
            // Waiter pre-population removed — attribution is server-side now.
            // Skip to Menu step (step 3 = Menu for dine-in, step 1 = Menu for takeaway)
            setCurrentStep(resolvedOrderType === 'takeaway' ? 1 : 3);
          }
        } catch (e) {
          console.error('Failed to load existing order:', e);
          addToast('Failed to load order details', 'error');
        }
      }
    } finally {
      setDataLoading(false);
    }
  };

  const resetWizard = () => {
    // Open Table: start directly on the Menu (step 3) with DINE_IN already
    // resolved — the table/order-type steps are never rendered for this flow.
    const openTableFlow = !!pendingTable && !activeOrderTakingId;
    setCurrentStep(openTableFlow ? 3 : 0);
    setEditingOrder(null);
    setEditExistingItems([]);
    setOrderType(openTableFlow ? 'dine_in' : null);
    setSelectedFloor(null);
    setSelectedTable(null);
    setSelectedCat('All');
    setSelectedSubcat(SUBCATEGORY_ALL);
    setSearchQuery('');
    setCart([]);
    setGuestCount(2);
    setCustomerName('');
    setCustomerPhone('');
    setSubmitting(null);
    setActionSuccess(null);
    setConfirmDialog(null);
    setFloors([]);
    setFloorLoadError(null);
  };

  const loadMenu = async () => {
    try {
      const resp = await menuApi.getAll();
      const items = (resp.items || []).map((m) => ({
        id: `menu-${m.id}`,
        name: m.name,
        price: Number(m.price),
        acPrice: m.acPrice != null ? Number(m.acPrice) : null,
        nonAcPrice: m.nonAcPrice != null ? Number(m.nonAcPrice) : null,
        category: m.category?.name || 'Main Course',
        subcategoryId: m.subcategoryId || null,
        subcategoryName: m.subcategory?.name || null,
        barcode: m.barcode || '',
        description: m.description || '',
        image: m.image || '',
        isLive: m.isAvailable !== false,
        isVeg: m.isVeg !== false,
        dietaryType: m.dietaryType || (m.isVeg !== false ? 'VEG' : 'NON_VEG'),
        stockStatus: m.isAvailable === false ? 'Out of Stock' : 'Available',
        prepTime: m.preparationTime || 15,
      }));
      setMenuItems(items.filter(m => m.isLive));
      setMenuError(null);
    } catch (e) {
      console.error('Failed to load menu:', e);
      setMenuError(e?.message || 'The menu could not be loaded. Check the connection and try again.');
    }
  };

  const loadCategories = async () => {
    try {
      const resp = await categoryApi.getAll();
      const cats = (resp.categories || [])
        .filter(c => c.isActive !== false)
        .map((c) => ({ id: `cat-${c.id}`, name: c.name, sortOrder: c.sortOrder || 0 }))
        .sort((a, b) => a.sortOrder - b.sortOrder);
      setCategories(cats);
    } catch (e) {
      console.error('Failed to load categories:', e);
    }
  };

  const loadSubcategories = async () => {
    try {
      const resp = await menuApi.getSubcategories();
      const subs = (resp?.data?.subcategories || resp?.subcategories || []).map((s) => ({
        id: s.id,
        name: s.name,
        categoryId: s.categoryId,
        categoryName: s.category?.name || '',
        isActive: s.isActive !== false,
        sortOrder: s.sortOrder || 0,
      }));
      setSubcategories(subs);
    } catch (e) {
      console.error('Failed to load subcategories:', e);
    }
  };

  // Returns the mapped, tenant-scoped table list so callers (the Open Table
  // hand-off) can validate the tapped table against the AUTHORITATIVE API data
  // before any order is created.
  const loadTables = async () => {
    setTableLoading(true);
    try {
      const resp = await tableApi.getAll();
      const mapped = (resp.tables || []).map((t) => ({
        id: `t-${t.id}`,
        number: parseInt(t.tableNo) || t.id,
        name: `Table ${String(t.tableNo).padStart(2, '0')}`,
        seats: t.capacity || 4,
        // AC / Non-AC is inherited from the floor (source of truth).
        floorType: t.floorType || t.tableType || 'NON_AC',
        tableType: t.tableType || 'NON_AC',
        status: t.status === 'OCCUPIED' ? 'Occupied' :
                t.status === 'RESERVED' ? 'Reserved' :
                t.status === 'CLEANING' ? 'Cleaning' : 'Available',
        floorId: t.floorId ? `floor-${t.floorId}` : null,
      }));
      setTables(mapped);
      return mapped;
    } catch (e) {
      console.error('Failed to load tables:', e);
      return [];
    } finally {
      setTableLoading(false);
    }
  };

  const loadFloors = async () => {
    setFloorLoading(true);
    setFloorLoadError(null);
    try {
      // GET /users/me/floors — the server applies the assignment rule:
      //   Case A (no assignment configured, or ADMIN/MANAGER) → all ACTIVE floors
      //   Case B (one or more assignments)                     → those floors only
      // `restricted` is true only for Case B. The backend still authorizes every
      // floor operation, this only shapes the UI.
      const resp = await userApi.getMyFloors();
      const list = resp?.floors || resp?.data?.floors || [];
      const restricted = !!(resp?.restricted ?? resp?.data?.restricted);
      setFloorsRestricted(restricted);
      const mapped = (list || []).map((f) => ({
        id: `floor-${f.id}`,
        name: f.name,
      }));
      setFloors(mapped);
    } catch (e) {
      // ERROR state ≠ Case A. Never render an unrestricted floor list when the
      // assignment state could not be loaded — show the failure instead.
      console.error('Failed to load floors:', e);
      setFloors([]);
      setFloorsRestricted(false);
      setFloorLoadError(e?.message || 'Failed to load floors');
    } finally {
      setFloorLoading(false);
    }
  };

  // ── Cart Operations ──
  const addToCart = useCallback((item) => {
    setCart(prev => {
      const exists = prev.find(c => c.itemId === item.id);
      if (exists) return prev.map(c => c.itemId === item.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { itemId: item.id, name: item.name, price: item.price, qty: 1, notes: '' }];
    });
  }, []);

  // ── Barcode scanning (Part 11) ──
  // USB/Bluetooth HID scanners type the code + Enter into a focused input.
  // The resolved item is added via the SAME addToCart used by card taps —
  // no second billing/cart engine. Unknown codes surface a visible error and
  // the input refocuses for the next scan.
  const scannerInputRef = useRef(null);
  const handleBarcodeScan = async (rawCode) => {
    const code = String(rawCode || '').trim();
    if (!code) return;
    try {
      const resp = await menuApi.getByBarcode(code);
      const item = resp?.item || resp?.data?.item;
      if (!item) {
        addToast(`Item not found for barcode: ${code}`, 'error');
        return;
      }
      addToCart({
        id: `menu-${item.id}`,
        name: item.name,
        acPrice: item.acPrice != null ? Number(item.acPrice) : null,
        nonAcPrice: item.nonAcPrice != null ? Number(item.nonAcPrice) : null,
        price: resolveMenuItemUnitPrice(
          { price: Number(item.price), acPrice: item.acPrice, nonAcPrice: item.nonAcPrice },
          selectedTable,
          settings
        ),
      });
      addToast(`${item.name} added`, 'success');
    } catch (e) {
      const status = e?.response?.status;
      if (status === 404) {
        addToast(`Item not found for barcode: ${code}`, 'error');
      } else if (status === 403) {
        addToast(e?.response?.data?.message || 'Barcode scanner is not enabled for this restaurant.', 'error');
      } else {
        addToast(e?.message || 'Barcode lookup failed', 'error');
      }
    } finally {
      // Refocus for the next scan — no manual click needed (Part 11 req.).
      requestAnimationFrame(() => scannerInputRef.current?.focus());
    }
  };

  // ── Keyboard-wedge capture (Part 11) ──
  // The wizard shows NO barcode field (the Basic POS workspace owns the
  // dedicated scan screen when the tenant runs quick billing), but a scanner
  // must still work here: HID scanners blast the code and press Enter. The
  // shared hook ignores keystrokes aimed at ANY text field (search box,
  // password, notes…) so typing is never hijacked, and only fires when the
  // whole burst arrives scanner-fast.
  useKeyboardWedgeScanner({
    enabled: canScanBarcode,
    onScan: handleBarcodeScan,
  });

  const updateCartQty = useCallback((itemId, delta) => {
    setCart(prev => prev.map(c => c.itemId === itemId ? { ...c, qty: Math.max(0, c.qty + delta) } : c).filter(c => c.qty > 0));
  }, []);

  const removeFromCart = useCallback((itemId) => {
    setCart(prev => prev.filter(c => c.itemId !== itemId));
  }, []);

  const setItemNotes = useCallback((itemId, notes) => {
    setCart(prev => prev.map(c => c.itemId === itemId ? { ...c, notes } : c));
    setNotesForItem(null);
    setNotesText('');
  }, []);

  // ── AC / Non-AC price (RESTAURANT mode only) ──
  // The displayed/cart price follows the SELECTED table's type. Before a table
  // is chosen the base price is shown; the backend always re-resolves and
  // validates the real price (a frontend price can never override it).
  const effectiveUnitPrice = (item) => resolveMenuItemUnitPrice(item, selectedTable, settings);
  // ── Computed Totals ──
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const gstRate = settings?.gstPercentage || 5;
  const taxAmount = settings?.taxType === 'Exclusive' ? Number(((subtotal) * gstRate / 100).toFixed(2)) : 0;
  const serviceCharge = settings?.serviceCharge || 0;
  const serviceChargeAmount = serviceCharge > 0 ? Number(((subtotal) * serviceCharge / 100).toFixed(2)) : 0;
  const grandTotal = Number((subtotal + taxAmount + serviceChargeAmount).toFixed(2));

  const getBackendId = (prefixedId, prefix) => {
    const id = parseInt((prefixedId || '').replace(prefix, ''));
    return isNaN(id) ? null : id;
  };

  // ── Build order payload helper ──
  const buildOrderPayload = () => {
    const itemsPayload = cart.map(c => ({
      menuItemId: getBackendId(c.itemId, 'menu-'),
      quantity: c.qty,
      notes: c.notes || undefined,
    })).filter(i => i.menuItemId);

    const backendOrderType = orderType === 'dine_in' ? 'DINE_IN' : 'TAKEAWAY';

    return {
      tableId: selectedTable ? getBackendId(selectedTable.id, 't-') : undefined,
      // customerId intentionally omitted — customer selection is out of the
      // New Order flow; the backend applies its Walk-in fallback.
      orderType: backendOrderType,
      items: itemsPayload,
    };
  };

  // ── Action: Print KOT (Create Order + Generate KOT) ────────────────────────
  const handlePrintKot = async () => {
    if (cart.length === 0) return;
    if (needsTable && !selectedTable) {
      addToast('Please select a table for Dine In orders.', 'warning');
      return;
    }
    if (submittingRef.current) return; // double-tap guard
    submittingRef.current = true;
    setSubmitting('kot');
    // Open the print window INSIDE the click gesture. The KOT number only
    // exists after the order API responds, and window.open() after an await is
    // treated as automated and blocked — which is why kitchen tickets stopped
    // printing. The ticket is rendered into this window once the KOT exists.
    const kotPrintWindow = openKotPrintWindow();
    try {
      const payload = buildOrderPayload();
      const resp = await orderApi.create(payload);
      const orderData = resp?.success ? resp.data : resp;
      if (!orderData || !orderData.id) {
        throw new Error('Order creation failed — no order data returned');
      }

      // Update table status if dine-in
      if (needsTable && selectedTable) {
        const tableBackendId = getBackendId(selectedTable.id, 't-');
        if (tableBackendId) {
          try { await tableApi.updateStatus(tableBackendId, 'OCCUPIED'); } catch {}
        }
      }

      // KOT is auto-created by backend during order creation.
      // The response includes order.kot[] with the auto-KOT (plus its
      // print-job state). NEVER create a second KOT — the backend will reject
      // it as "no new items".
      const autoKot = orderData.kot?.[0] || null;
      const kotNo = autoKot?.kotNo || null;

      // ── Dispatch the KOT print job (mandatory kitchen printing) ──
      // The shared dispatch service opens the existing print preview AND
      // reports DISPATCHED/FAILED back to the API, so the job survives a
      // refresh and can be retried from Active Orders / Kitchen Tickets. A
      // missing printer is a visible warning with a route to printer settings
      // — never a fake "printed" confirmation.
      let printResult = { dispatched: false };
      try {
        printResult = await dispatchKotPrint({
          kot: autoKot,
          printerConfigured,
          printWindow: kotPrintWindow,
          printData: {
            restaurantName: settings?.branding?.restaurantName || '',
            kotNo: kotNo || 'N/A',
            orderNo: orderData.orderNo || String(orderData.id),
            tableNo: selectedTable?.name || '',
            orderType: orderType === 'dine_in' ? 'DINE_IN' : 'TAKEAWAY',
            waiterName: waiterName || '',
            customerName: customerName || '',
            customerPhone: customerPhone || '',
            guestCount: guestCount || 1,
            notes: '',
            items: cart.map(c => ({ name: c.name, quantity: c.qty, notes: c.notes })),
            footer: settings?.receiptFooterMessage || 'Thank You!',
            date: new Date()
          }
        });
      } catch (printErr) {
        // KOT print preview failed — non-critical, the ticket still exists
        addToast('KOT created but print preview failed. You can reprint from Active Orders.', 'warning');
      }

      if (printResult.dispatched && printResult.needsConfiguration) {
        // Printed through the system printer, but this tenant has no kitchen
        // printer configured — an actionable warning, not a silent failure.
        addToast(`KOT ${kotNo || ''} sent to the system printer. ${printResult.warning || ''}`.trim(), 'warning');
      } else if (!printResult.dispatched) {
        addToast(`KOT created but NOT printed: ${printResult.error || 'print unavailable'}`, 'error');
      }
      // Nothing was rendered into the pre-opened window → close the blank tab.
      if (!printResult.dispatched) closeKotPrintWindow(kotPrintWindow);

      const printInitiated = printResult.dispatched === true;
      // Add to local store
      addOrder({
        id: `ord-${orderData.id}`,
        orderNumber: `#${orderData.orderNo || orderData.id}`,
        tableName: selectedTable?.name || 'Takeaway',
        guestsCount: guestCount,
        timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        serverName: waiterName || 'Staff',
        status: 'PREP',
        items: cart.map(c => ({ itemId: c.itemId, name: c.name, price: c.price, quantity: c.qty, status: 'Pending', notes: c.notes })),
        orderType: orderType === 'dine_in' ? 'Dine In' : 'Takeaway',
        discountAmount: 0,
        paymentStatus: 'Pending',
      });

      incrementRefreshTrigger();
      addToast(`KOT created for Order ${orderData.orderNo || orderData.id}!`, 'success');

      if (!printInitiated) {
        // Popup blocked / preview could not open: the KOT exists, but per the
        // existing error handling (service alert + warning toast above) the
        // user stays on Review with working navigation — never silently
        // advanced to Step 1 as if printing had happened.
        return;
      }

      // Print initiated successfully. The created order/KOT are untouched: no
      // payment opens, no second order and no second KOT are created.
      //   - Table session (POS Ordering screen entered from Floors & Tables):
      //     the session ends on that board, where the table is now occupied.
      //   - Otherwise: restart the SAME wizard at Step 1 (Order Type) by
      //     reusing its own open routine (resetWizard clears the completed
      //     cart/order-type/floor/table state, then data reloads), with the
      //     hand-off consumed so the restart begins at the normal first step.
      const wasTableSession = isPageMode && (!!pendingTable || !!activeOrderTakingId);
      if (wasTableSession) {
        finishSession();
        return;
      }
      clearPendingTable();
      await loadInitialData();
    } catch (e) {
      // The order was never created — close the pre-opened window so the user
      // is not left with a blank popup.
      closeKotPrintWindow(kotPrintWindow);
      const msg = e?.response?.data?.message || e?.message || 'Failed to create order';
      addToast(msg, 'error');
    } finally {
      submittingRef.current = false;
      setSubmitting(null);
    }
  };

  // ── Action: Place Order (business type WITHOUT a kitchen) ──────────────────
  // A retail/quick-billing vertical has no kitchen capability, so an order is
  // created without a kitchen ticket (Order → Direct Billing → Payment →
  // Complete). Payment is NEVER opened from here — the cashier collects it from
  // Active Orders / Billing, the single payment surface. This action is rendered
  // ONLY for non-KOT businesses: for a FOOD business Print KOT is the one
  // action that creates the order (so there is never a second create button
  // that could double-order), even when the Kitchen screen toggle is OFF.
  const handlePlaceOrder = async () => {
    if (cart.length === 0) return;
    if (needsTable && !selectedTable) {
      addToast('Please select a table for Dine In orders.', 'warning');
      return;
    }
    // An already-created order (Add Item / any edit session) must NEVER be
    // re-created here — that would create a second order (+ its auto-KOT).
    if (activeOrderTakingId || isEditing) {
      addToast('This order already exists — use Update Order to add items.', 'warning');
      return;
    }
    if (submittingRef.current) return; // double-tap guard
    submittingRef.current = true;
    setSubmitting('order');
    try {
      const payload = buildOrderPayload();
      const resp = await orderApi.create(payload);
      const orderData = resp?.success ? resp.data : resp;
      if (!orderData || !orderData.id) {
        throw new Error('Order creation failed — no order data returned');
      }

      // Update table status if dine-in
      if (needsTable && selectedTable) {
        const tableBackendId = getBackendId(selectedTable.id, 't-');
        if (tableBackendId) {
          try { await tableApi.updateStatus(tableBackendId, 'OCCUPIED'); } catch {}
        }
      }

      // Add to local store
      addOrder({
        id: `ord-${orderData.id}`,
        orderNumber: `#${orderData.orderNo || orderData.id}`,
        tableName: selectedTable?.name || 'Takeaway',
        guestsCount: guestCount,
        timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        serverName: waiterName || 'Staff',
        status: 'PREP',
        items: cart.map(c => ({ itemId: c.itemId, name: c.name, price: c.price, quantity: c.qty, status: 'Pending', notes: c.notes })),
        orderType: orderType === 'dine_in' ? 'Dine In' : 'Takeaway',
        discountAmount: 0,
        paymentStatus: 'Pending',
      });

      incrementRefreshTrigger();
      setActionSuccess('order');
      clearPendingTable(); // hand-off consumed — the table now has a real order
      addToast(`Order ${orderData.orderNo || orderData.id} created. Collect payment from Active Orders.`, 'success');
      setShowTakeOrderWizard(false);
      setActiveOrderTakingId(null);
      const prevScreen = previousScreenRef.current;
      if (prevScreen && prevScreen !== 'order_taking') setScreen(prevScreen);
    } catch (e) {
      addToast(e.message || 'Failed to process order', 'error');
    } finally {
      submittingRef.current = false;
      setSubmitting(null);
    }
  };

  // ── Action: Cancel ─────────────────────────────────────────────────────────
  const handleCancelOrder = () => {
    // Discard the whole entry context — a pending table hand-off or a stale
    // edit-order id must never leak into the next wizard session.
    const wasTableSession = isPageMode && (!!pendingTable || !!activeOrderTakingId);
    clearPendingTable();
    setActiveOrderTakingId(null);
    setShowTakeOrderWizard(false);
    if (wasTableSession) {
      // The session began on the Floors & Tables board — return there.
      setScreen(tableFlowReturnScreen);
      return;
    }
    const prevScreen = previousScreenRef.current;
    if (prevScreen && prevScreen !== 'order_taking') setScreen(prevScreen);
  };

  // ── Action: Update Order (for editing existing orders) ─────────────────────
  const handleUpdateOrder = async () => {
    if (cart.length === 0 || !activeOrderTakingId) return;
    if (submittingRef.current) return; // double-tap guard
    submittingRef.current = true;
    setSubmitting('update');
    // Same gesture rule as Print KOT: the delta KOT number only exists after
    // the add-item/KOT requests, so the window is opened now and filled later.
    const kotPrintWindow = openKotPrintWindow();
    try {
      const backendId = parseInt(activeOrderTakingId.replace('ord-', ''));
      if (isNaN(backendId)) throw new Error('Invalid order ID');

      // ── Cancelled order guard ──
      if (editingOrder && (editingOrder.status === 'CANCELLED' || editingOrder.cancelledAt)) {
        addToast('This order has been cancelled and cannot be modified.', 'error');
        setShowTakeOrderWizard(false);
        setActiveOrderTakingId(null);
        return;
      }
      
      // Add each new item to the existing order
      for (const item of cart) {
        const menuBackendId = parseInt(item.itemId.replace('menu-', ''));
        if (menuBackendId) {
          try {
            await orderApi.addItem(backendId, {
              menuItemId: menuBackendId,
              quantity: item.qty,
              notes: item.notes || undefined,
            });
          } catch (addItemErr) {
            console.error('Failed to add item:', addItemErr);
            addToast(`Failed to add ${item.name}: ${addItemErr.message || 'unknown error'}`, 'error');
          }
        }
      }
      
      // Generate new KOT with only the newly added items.
      // Backend calculates delta from KOTItem history, so only unsent items are included.
      try {
        if (cart.length > 0 && kotCapable) {
          const kotResp = await kotApi.create({ orderId: backendId });
          // Backend returns { success: true, data: { created, kot, kotItems } }
          const kotData = kotResp?.data || kotResp;
          // If no new items, backend returns created=false — this is normal, not an error
          if (kotData?.created === false || !kotData?.kotNo) {
            closeKotPrintWindow(kotPrintWindow);
            addToast('No new items to send to kitchen.', 'info');
          } else {
            const kotNo = kotData?.kotNo || null;
            // Incremental (delta) KOT print — the dispatch service opens the
            // shared preview AND records the print job, so an added-items
            // ticket is retriable exactly like a first one.
            try {
              const incResult = await dispatchKotPrint({
                kot: kotData.kot || kotData,
                printerConfigured,
                printWindow: kotPrintWindow,
                manual: true,
                printData: {
                  restaurantName: settings?.branding?.restaurantName || '',
                  kotNo: kotNo || 'N/A',
                  // The ticket must identify the REAL order — order number, the
                  // table it belongs to, order type, staff and kitchen notes.
                  // Items come from the KOTItems returned by the backend, which
                  // contain ONLY the newly added (previously unsent) quantities.
                  orderNo: editingOrder?.orderNo || String(backendId),
                  tableNo: editingOrder?.table?.tableNo || editingOrder?.table?.name || '',
                  orderType: editingOrder?.orderType || 'DINE_IN',
                  waiterName: editingOrder?.user?.name || user?.name || '',
                  customerName: editingOrder?.customer?.name || customerName || '',
                  customerPhone: editingOrder?.customer?.phone || customerPhone || '',
                  guestCount: editingOrder?.guestCount || 1,
                  notes: editingOrder?.notes || '',
                  items: (kotData?.kotItems || []).map(ki => ({
                    name: ki.menuItem?.name || 'Item',
                    quantity: ki.quantity || 1,
                    notes: ki.notes || '',
                    dietaryType: ki.menuItem?.dietaryType || null
                  })),
                  footer: settings?.receiptFooterMessage || 'Thank You!',
                  date: new Date()
                }
              });
              if (incResult.dispatched && incResult.needsConfiguration) {
                addToast(`KOT ${kotNo} sent to the system printer. ${incResult.warning || ''}`.trim(), 'warning');
              } else if (!incResult.dispatched) {
                addToast(`KOT ${kotNo} created but NOT printed: ${incResult.error || 'print unavailable'}`, 'error');
              }
              if (!incResult.dispatched) closeKotPrintWindow(kotPrintWindow);
            } catch (printErr) {
              // KOT print preview failed — non-critical
              closeKotPrintWindow(kotPrintWindow);
            }
          }
        } else {
          // Business type without a kitchen → no KOT was created, so no ticket
          // to print. (The kitchen SCREEN toggle never reaches this branch.)
          closeKotPrintWindow(kotPrintWindow);
        }
      } catch (kotErr) {
        closeKotPrintWindow(kotPrintWindow);
        const msg = kotErr?.message || '';
        // Real errors only — 'No new items' is now handled as a 200 success above
        // KOT generation failed — toast already shown
        addToast('Items added but KOT generation failed. You can reprint from Active Orders.', 'warning');
      }

      incrementRefreshTrigger();
      addToast('Items added successfully! Order updated.', 'success');
      // A table session (Add Items from the board) ends on the board, so the
      // updated order/table state is visible; other screens get the wizard back
      // on the screen they opened it from.
      finishSession();
    } catch (e) {
      closeKotPrintWindow(kotPrintWindow);
      addToast(e.message || 'Failed to update order', 'error');
    } finally {
      submittingRef.current = false;
      setSubmitting(null);
    }
  };

  // ── End of session ──
  // ONE cleanup + destination rule for every finished/cancelled session:
  //   - page mode (POS Ordering screen): back to the Floors & Tables board the
  //     table flow started from, where the table's new state is visible;
  //   - overlay mode: back to the screen that opened the wizard (unchanged).
  // The pending hand-off and any edit-order id are always dropped, so the next
  // session can never inherit them (duplicate items / wrong table).
  const finishSession = () => {
    // An ADD-ITEM session was opened from another screen (Active Orders).
    // Return to that screen so the updated order is visible — an edit session
    // must never bounce the user to Dashboard/Floors as if a new table order
    // had just been placed.
    const wasEditSession = isEditing;
    clearPendingTable();
    setActiveOrderTakingId(null);
    setShowTakeOrderWizard(false);
    if (wasEditSession) {
      goBackScreen('active_orders');
      return;
    }
    if (isPageMode) {
      setScreen(tableFlowReturnScreen);
      return;
    }
    const prevScreen = previousScreenRef.current;
    if (prevScreen && prevScreen !== 'order_taking') setScreen(prevScreen);
  };

  // Explicit exit from the handed-over table order (the overlay's Close button
  // cannot exist on a full screen).
  const handleExitTableSession = () => finishSession();

  // ── Close Handler ──
  const handleClose = () => {
    // One cleanup point for EVERY close path: the pending Open Table hand-off
    // and any edit-order id are dropped so the next wizard session starts from
    // its own flow (a stale order id used to silently turn a new order into an
    // edit of a previously resumed order → duplicate items + duplicate KOT).
    const wasEditSession = isEditing;
    clearPendingTable();
    setActiveOrderTakingId(null);
    setShowTakeOrderWizard(false);
    if (wasEditSession) {
      // Back to the screen that started Add Item (Active Orders).
      goBackScreen('active_orders');
    } else if (isPageMode) {
      setScreen('dashboard');
    } else {
      const prevScreen = previousScreenRef.current;
      if (prevScreen && prevScreen !== 'order_taking') setScreen(prevScreen);
    }
  };

  // ── Navigation ──
  const goNext = () => { if (currentStep < maxStep) setCurrentStep(s => s + 1); };
  // Open Table already resolved the order type and the table, so there is no
  // previous step to return to on the Menu screen — Back only leaves Review.
  const canGoBack = currentStep > 0 && !(isOpenTableFlow && currentStep <= 3);
  const goBack = () => { if (canGoBack) setCurrentStep(s => s - 1); };

  // ── Filtered Data ──
  // Part 11: a category holding zero visible items (e.g. all non-veg hidden
  // for a VEG_ONLY user) must not render as an empty chip — categories are
  // derived from the VISIBLE items and a stale selection falls back to All.
  const visibleCategories = new Set(menuItems.map((m) => m.category));
  // Every category the tenant still knows about (API registry + items). A
  // background menu refresh may temporarily hide a category's items, but that
  // must NOT silently reset the cashier's selection — only a genuinely
  // removed/renamed category falls back to All.
  const knownCategoryNames = new Set([
    ...categories.map((c) => c.name),
    ...visibleCategories,
  ]);
  useEffect(() => {
    // Wait for the menu before validating the selection: at mount the menu is
    // still empty, so a category restored from session storage (page refresh)
    // must not be wiped before it can be matched against the loaded menu.
    if (menuItems.length === 0) return;
    if (selectedCat !== 'All' && !knownCategoryNames.has(selectedCat)) {
      setSelectedCat('All');
      setSelectedSubcat(SUBCATEGORY_ALL);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCat, menuItems, categories]);

  // Restore the pre-refresh category exactly once, after the menu has loaded.
  const restoreAppliedRef = useRef(false);
  useEffect(() => {
    if (restoreAppliedRef.current || menuItems.length === 0) return;
    restoreAppliedRef.current = true;
    const stored = restoredCategory;
    if (stored && stored !== 'All' && visibleCategories.has(stored)) {
      setSelectedCat(stored);
      setSelectedSubcat(SUBCATEGORY_ALL);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuItems]);

  // Persist the current category so a full page refresh reopens on it.
  useEffect(() => {
    if (!restoreAppliedRef.current) return; // never overwrite before restoring
    try {
      window.sessionStorage.setItem(CATEGORY_STORAGE_KEY, selectedCat);
    } catch {
      // Storage disabled/quota — persistence is a convenience, never a blocker.
    }
  }, [selectedCat]);

  // Changing category MUST reset the subcategory to All (Part 2 req. 3).
  const handleWizardCategorySelect = (catName) => {
    setSelectedCat(catName);
    setSelectedSubcat(SUBCATEGORY_ALL);
  };

  // Subcategory tabs for the selected category — derived from already-loaded
  // data, no refetch on tab clicks. Only rendered for a specific category.
  const wizardSubcatTabs = selectedCat === 'All'
    ? []
    : subcategoryTabsFor(menuItems, subcategories, selectedCat);

  // Shared hierarchy filter (Part 2/9): category → subcategory → search.
  // SEARCH spans the COMPLETE menu: while a query is typed the category and
  // subcategory filters are suspended, so a dish is never hidden by the
  // current selection. Clearing the query restores the normal hierarchy.
  // NOTE: the inline barcode input was removed from the wizard — with the
  // scanner ON the Basic POS workspace owns the dedicated Counter Scan
  // screen (spec §8/§13: never show both interfaces at once).
  const isSearching = searchQuery.trim().length > 0;
  const filteredItems = isSearching
    ? filterMenuItems(menuItems, { searchQuery, dietaryFilter: 'All' })
    : filterMenuItems(menuItems, {
        selectedCategory: selectedCat,
        selectedSubcategory: selectedSubcat,
        dietaryFilter: 'All', // dietary restrictions already filtered server-side (dietaryMenuWhere)
      });

  // ── Category navigation model (sidebar + compact selector) ──
  // Item counts come from the already-loaded menu (no extra request). Active
  // API categories keep their sort order; any category that only exists on
  // items (e.g. the categories request failed) is appended so no item can
  // become unreachable.
  const countForCategory = (name) => menuItems.filter((i) => i.category === name).length;
  const apiCategoryNames = new Set(categories.map((c) => c.name));
  const sidebarCategories = [
    ...categories.filter((c) => visibleCategories.has(c.name)),
    ...Array.from(visibleCategories)
      .filter((name) => !apiCategoryNames.has(name))
      .sort()
      .map((name) => ({ id: `cat-item-${name}`, name })),
  ];

  // PC restaurant rail only: 44px rows and 13px labels at lg+, icon-only 64px
  // presentation while collapsed. Every other tenant/breakpoint keeps the
  // existing sidebar classes unchanged.
  const railCollapsed = isRestaurantTenant && categorySidebarCollapsed;

  // ── Category navigation interaction (scroll, wheel, keyboard) ──
  // Both the desktop sidebar and the tablet/mobile chip strip are independent
  // scroll containers. The active entry is revealed by adjusting ONLY that
  // container's scrollLeft/scrollTop — never with scrollIntoView(), which also
  // scrolls every ancestor (the AppShell <main> scroller) and made the whole
  // page jump on mobile. Arrow keys move focus between entries; buttons still
  // activate on Enter / Space natively.
  const chipRowRef = useRef(null);
  const sidebarListRef = useRef(null);
  const activeChipRef = useRef(null);
  const activeSidebarRef = useRef(null);
  const chipCleanupRef = useRef(null);
  const [chipScroll, setChipScroll] = useState({ left: false, right: false });

  const updateChipScrollState = useCallback(() => {
    const el = chipRowRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const next = { left: el.scrollLeft > 2, right: max - el.scrollLeft > 2 };
    setChipScroll((prev) => (
      prev.left === next.left && prev.right === next.right ? prev : next
    ));
  }, []);

  // Reveal an entry inside its own scroll container only.
  const revealCategory = (container, item, horizontal) => {
    if (!container || !item) return;
    const box = container.getBoundingClientRect();
    const target = item.getBoundingClientRect();
    if (horizontal) {
      if (target.left < box.left) container.scrollLeft -= Math.ceil(box.left - target.left + 12);
      else if (target.right > box.right) container.scrollLeft += Math.ceil(target.right - box.right + 12);
    } else {
      if (target.top < box.top) container.scrollTop -= Math.ceil(box.top - target.top + 8);
      else if (target.bottom > box.bottom) container.scrollTop += Math.ceil(target.bottom - box.bottom + 8);
    }
  };

  const setChipRowRef = useCallback((node) => {
    if (chipCleanupRef.current) {
      chipCleanupRef.current();
      chipCleanupRef.current = null;
    }
    chipRowRef.current = node;
    if (!node) return;
    // A plain mouse wheel scrolls the strip horizontally instead of being
    // swallowed by the layout. Touch/trackpad horizontal gestures are left to
    // the browser; only a dominant vertical delta is translated. This is the
    // ONLY wheel handler on the strip — it is attached once per mount and
    // removed in the stored cleanup (no duplicates across re-renders).
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const before = node.scrollLeft;
      node.scrollLeft = before + e.deltaY;
      if (node.scrollLeft !== before) e.preventDefault();
      updateChipScrollState();
    };
    node.addEventListener('wheel', onWheel, { passive: false });

    // Edge fades depend on how much is hidden — keep them in sync when the
    // strip or its contents resize (orientation change, fonts, more categories).
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateChipScrollState) : null;
    if (ro) ro.observe(node);
    const raf = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(updateChipScrollState)
      : null;

    chipCleanupRef.current = () => {
      node.removeEventListener('wheel', onWheel);
      if (ro) ro.disconnect();
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [updateChipScrollState]);

  useEffect(() => () => {
    if (chipCleanupRef.current) chipCleanupRef.current();
  }, []);

  // Reveal the active category after selection and whenever the menu step
  // re-mounts (Review → Back, Back → Menu) — without moving the page.
  useEffect(() => {
    const strip = chipRowRef.current;
    const list = sidebarListRef.current;
    if (strip && activeChipRef.current && strip.offsetParent !== null) {
      revealCategory(strip, activeChipRef.current, true);
    }
    if (list && activeSidebarRef.current && list.offsetParent !== null) {
      revealCategory(list, activeSidebarRef.current, false);
    }
    updateChipScrollState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCat, sidebarCategories.length, currentStep, updateChipScrollState]);

  const moveCategoryFocus = (container, key, horizontal) => {
    if (!container) return false;
    const buttons = Array.from(container.querySelectorAll('button'));
    const current = buttons.indexOf(document.activeElement);
    if (current < 0) return false;
    const last = buttons.length - 1;
    let next = current;
    if (key === (horizontal ? 'ArrowRight' : 'ArrowDown')) next = Math.min(current + 1, last);
    else if (key === (horizontal ? 'ArrowLeft' : 'ArrowUp')) next = Math.max(current - 1, 0);
    else if (key === 'Home') next = 0;
    else if (key === 'End') next = last;
    // preventScroll: focusing must never scroll the page/document.
    buttons[next]?.focus({ preventScroll: true });
    revealCategory(container, buttons[next], horizontal);
    return true;
  };

  const handleCategoryKeyDown = (e, horizontal) => {
    const keys = horizontal
      ? ['ArrowLeft', 'ArrowRight', 'Home', 'End']
      : ['ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const container = horizontal ? chipRowRef.current : sidebarListRef.current;
    if (moveCategoryFocus(container, e.key, horizontal)) e.preventDefault();
  };

  const filteredTables = tables.filter(t => {
    if (selectedFloor) return t.floorId === selectedFloor.id;
    return true;
  }).sort((a, b) => a.number - b.number);

  // ── Render: Step Indicator ──
  // Takeaway: just 3 steps (Order Type → Menu → Review), no floor/table
  // When floor management is disabled, skip floor/table steps
  // For dine-in with floor mgmt disabled: currentStep 0→1→2→3→4 but display only 3 steps
  // For takeaway: currentStep 0→1→2, all mapped 1:1
  // Open Table: order type + table came from the Floors & Tables screen, so the
  // indicator starts at Menu (the wizard's fixed steps 0–2 are skipped).
  const activeSteps = isTakeaway
    ? ['Order Type', 'Menu', 'Review']
    : isOpenTableFlow
      ? ['Menu', 'Review']
      : skipFloorMgmt
        ? STEP_LABELS.filter((_, i) => i !== 1 && i !== 2)
        : STEP_LABELS;

  const stepMap = isTakeaway
    ? { 0: 0, 1: 1, 2: 2 }
    : isOpenTableFlow
      ? { 3: 0, 4: 1 }
      : skipFloorMgmt
        ? { 0: 0, 1: 0, 2: 0, 3: 1, 4: 2 }
        : { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4 };

  const displayStep = stepMap[currentStep] || 0;

  // The Menu step is the only step that owns the menu search — the header puts
  // it beside the title on wide screens and wraps it onto its own compact row
  // on narrow ones (see the header below).
  const isMenuStep = !!orderType && (isTakeaway ? currentStep === 1 : currentStep === 3);

  // Restaurant PC page mode only: the category rail becomes a workspace-level
  // column (see wizardContent) so its top sits at the ordering header — the
  // first element below the app header — instead of below the stepper. Every
  // other context keeps the rail inside the menu step exactly as before.
  const workspaceCategoryRail = isPageMode && isRestaurantTenant && isMenuStep && desktopRailViewport;

  // ONE search implementation: the same `searchQuery` state and the same
  // `filteredItems` derivation as the menu grid below — only its position
  // changes with the viewport.
  const menuSearchField = (
    <div className="relative w-full min-w-0">
      <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
      <input
        type="text"
        aria-label="Search the whole menu"
        placeholder="Search the whole menu — dishes, categories..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full h-9 pl-8 pr-10 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-[#16A34A] focus:ring-1 focus:ring-[#16A34A]/20"
      />
      {isSearching && (
        <span
          title={`${filteredItems.length} match${filteredItems.length === 1 ? '' : 'es'} across all categories`}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500"
        >
          {filteredItems.length}
        </span>
      )}
    </div>
  );

  // Slim step indicator (Menu / Review etc. unchanged — only the height).
  const renderStepIndicator = () => (
    <div className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 border-b border-slate-100 bg-white overflow-x-auto no-scrollbar shrink-0">
      {activeSteps.map((label, idx) => {
        const isCompleted = idx < displayStep;
        const isCurrent = idx === displayStep;
        return (
          <React.Fragment key={idx}>
            <div className="flex items-center gap-1.5">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-extrabold shrink-0 transition-all ${
                isCompleted ? 'bg-[#16A34A] text-white' :
                isCurrent ? 'bg-[#16A34A] text-white shadow-sm ring-2 ring-[#16A34A]/20' :
                'bg-slate-200 text-slate-500'
              }`}>
                {isCompleted ? <Check className="w-3 h-3" /> : idx + 1}
              </div>
              <span className={`text-[9px] font-bold uppercase tracking-wider whitespace-nowrap ${
                isCurrent ? 'text-[#16A34A]' : isCompleted ? 'text-slate-600' : 'text-slate-400'
              }`}>{label}</span>
            </div>
            {idx < activeSteps.length - 1 && (
              <div className={`w-3 sm:w-4 h-px shrink-0 ${isCompleted ? 'bg-[#16A34A]/40' : 'bg-slate-200'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );

  // ── Render: Step 0 - Order Type ──
  // Options come from the shared resolver (Part 8): exempt roles see both,
  // granted staff see both, dine-in-only staff never reach this step.
  // When Floor Management is OFF only Take Away / Basic POS ordering is shown.
  const availableOrderTypes = ORDER_TYPE_OPTIONS.filter(opt => orderTypeResolution.types.includes(opt.value));

  // Part: auto-advance. Selecting an order type immediately moves to the next
  // applicable step (Dine In → Floor; Take Away → Menu) — no Continue press.
  // The selection state is committed FIRST (setOrderType), then the step
  // changes via the guarded transition. Loading state is irrelevant here:
  // order-type selection never depends on an API call.
  const handleOrderTypeSelect = (value) => {
    if (autoAdvanceRef.current) return; // duplicate tap guard
    setOrderType(value);
    advanceOnce(value === 'takeaway' ? 1 : 1); // both land on step 1 (floor for dine-in, menu for takeaway)
  };

  const renderOrderType = () => (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-4 sm:px-8">
      <div className="text-center mb-4 sm:mb-5">
        <h3 className="text-base sm:text-lg font-extrabold text-slate-800 mb-0.5">Choose Order Type</h3>
        <p className="text-[10px] sm:text-xs text-slate-400">Select how the customer will receive their order</p>
      </div>
      {skipFloorMgmt && (
        <div className="mb-4 px-3.5 py-2 bg-amber-50 border border-amber-200 rounded-xl text-[10px] font-semibold text-amber-800 max-w-sm w-full">
          Floor Management is turned OFF — only Take Away / Basic POS ordering is available.
        </div>
      )}
      <div className={`grid ${availableOrderTypes.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 max-w-xs'} gap-3 w-full max-w-md`}>
        {availableOrderTypes.map(opt => (
          <button key={opt.value} onClick={() => handleOrderTypeSelect(opt.value)}
            className={`p-4 sm:p-5 border-2 rounded-2xl transition-all text-center cursor-pointer min-h-[110px] sm:min-h-[130px] flex flex-col items-center justify-center ${
              orderType === opt.value
                ? 'border-[#16A34A] bg-[#16A34A]/5 shadow-lg scale-[1.02]'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}>
            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl ${opt.bg} flex items-center justify-center mb-2 sm:mb-2.5`}>
              <opt.icon className={`w-5 h-5 sm:w-6 sm:h-6 ${orderType === opt.value ? `text-[${opt.color}]` : 'text-slate-400'}`} />
            </div>
            <h4 className="font-extrabold text-xs sm:text-sm text-slate-800">{opt.label}</h4>
            <p className="text-[9px] sm:text-[10px] text-slate-500 mt-0.5 leading-tight">{opt.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );

  // ── Render: Step 1 (Dine In) - Floor ──
  const renderFloor = () => (
    <div className="flex-1 p-6 overflow-y-auto overscroll-contain">
      <h3 className="text-sm font-extrabold text-slate-800 mb-1">Select Floor / Area</h3>
      <p className="text-[10px] text-slate-400 mb-4">Choose the floor where the customer is seated</p>
      {floorLoading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 text-xs"><Loader2 className="w-4 h-4 animate-spin mr-2" />Loading floors...</div>
      ) : floorLoadError ? (
        // The assignment state could NOT be loaded. Show the failure and offer a
        // retry — never fall through to the unrestricted floor list.
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="w-10 h-10 text-red-300 mb-3" />
          <p className="text-sm font-bold text-slate-600 mb-1">Could not load floors</p>
          <p className="text-[10px] text-slate-400 mb-4">{floorLoadError}</p>
          <button onClick={loadFloors} className="h-8 px-3 bg-[#16A34A] hover:bg-[#15803D] text-white font-bold rounded-lg text-[10px] uppercase tracking-wider cursor-pointer">
            Retry
          </button>
        </div>
      ) : floors.length === 0 && floorsRestricted ? (
        // Zero assigned floors for a restricted user — never fall back to all
        // floors; say so clearly (backend also blocks unauthorized floors).
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Building2 className="w-10 h-10 text-slate-300 mb-3" />
          <p className="text-sm font-bold text-slate-600 mb-1">No floor has been assigned to your account.</p>
          <p className="text-[10px] text-slate-400 mb-4">Ask your manager to assign you a floor in Staff Roster → Assign Access.</p>
        </div>
      ) : floors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Building2 className="w-10 h-10 text-slate-300 mb-3" />
          <p className="text-sm font-bold text-slate-600 mb-1">No floors have been created yet.</p>
          <p className="text-[10px] text-slate-400 mb-4">Create a floor in Floor Management to get started.</p>
          <a
            href="/settings"
            onClick={(e) => { e.preventDefault(); setShowTakeOrderWizard(false); setScreen('settings'); }}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#16A34A] text-white rounded-xl text-[10px] font-bold hover:bg-[#15803D] transition-all cursor-pointer"
          >
            <Building2 className="w-3.5 h-3.5" />
            Create Floor
          </a>
        </div>
      ) : (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {floors.map(floor => (
          <button key={floor.id} onClick={() => handleFloorSelect(floor)}
            className={`p-5 border-2 rounded-2xl transition-all text-center cursor-pointer ${
              selectedFloor?.id === floor.id
                ? 'border-[#16A34A] bg-[#16A34A]/5 shadow-md'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}>
            <Building2 className={`w-6 h-6 mx-auto mb-2 ${selectedFloor?.id === floor.id ? 'text-[#16A34A]' : 'text-slate-400'}`} />
            <p className="font-extrabold text-xs text-slate-800">{floor.name}</p>
            <p className="text-[9px] text-slate-400 mt-0.5">{tables.filter(t => t.floorId === floor.id && t.status === 'Available').length} tables free</p>
          </button>
        ))}
      </div>
      )}
    </div>
  );

  // Part: auto-advance. Selecting a floor immediately moves to Table selection
  // (state committed first, then the guarded transition). Floor loading state
  // is checked by the caller — the button only renders after floors load.
  const handleFloorSelect = (floor) => {
    if (autoAdvanceRef.current || floorLoading) return; // duplicate tap / loading guard
    setSelectedFloor(floor);
    advanceOnce(2);
  };

  // Part: auto-advance. Tapping an AVAILABLE table commits the selection and
  // immediately moves to Menu. Occupied/reserved tables stay disabled by the
  // existing rules (button disabled below) — they can never trigger this.
  const handleTableSelect = (table) => {
    if (autoAdvanceRef.current || tableLoading) return; // duplicate tap / loading guard
    if (table.status !== 'Available') return; // occupied tables never advance
    setSelectedTable(table);
    advanceOnce(3);
  };

  // ── Render: Step 2 (Dine In) - Table ──
  const renderTable = () => (
    <div className="flex-1 p-6 overflow-y-auto overscroll-contain">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-extrabold text-slate-800">Select Table</h3>
          <p className="text-[10px] text-slate-400">
            {selectedFloor ? `Floor: ${selectedFloor.name}` : 'All tables'} · {tableLoading ? 'Loading...' : `${filteredTables.filter(t => t.status === 'Available').length} available`}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[9px] font-bold text-slate-500">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-500" /> Available</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-500" /> Occupied</span>
        </div>
      </div>
      {tableLoading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 text-xs"><Loader2 className="w-4 h-4 animate-spin mr-2" />Loading tables...</div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
          {filteredTables.map(table => {
            const isAvailable = table.status === 'Available';
            const isSelected = selectedTable?.id === table.id;
            return (
              <button key={table.id} disabled={!isAvailable}
                onClick={() => handleTableSelect(table)}
                className={`aspect-square p-2 border-2 rounded-xl transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                  isSelected ? 'border-[#16A34A] bg-[#16A34A]/5 shadow-md ring-2 ring-[#16A34A]/30' :
                  isAvailable ? 'border-emerald-500 bg-emerald-50 hover:border-[#16A34A] hover:shadow-sm' :
                  'border-red-300 bg-red-50 opacity-60 cursor-not-allowed'
                }`}>
                <span className="font-mono font-extrabold text-sm text-slate-800">{table.name.replace('Table ', 'T')}</span>
                <span className="text-[9px] text-slate-500 font-bold flex items-center gap-0.5"><Users className="w-3 h-3" />{table.seats}</span>
                {acNonAcPricing && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${table.floorType === 'AC' ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-500'}`}>
                    {table.floorType === 'AC' ? 'AC' : 'Non-AC'}
                  </span>
                )}
                <span className={`text-[7px] font-extrabold uppercase px-1.5 py-0.5 rounded-full ${
                  table.status === 'Available' ? 'bg-emerald-100 text-emerald-800' :
                  table.status === 'Occupied' ? 'bg-red-100 text-red-800' : 'bg-slate-200 text-slate-600'
                }`}>{table.status}</span>
              </button>
            );
          })}
        </div>
      )}
      {/* Guest Count */}
      <div className="mt-4 p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
        <span className="text-xs font-bold text-slate-600">Number of Guests</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setGuestCount(p => Math.max(1, p - 1))}
            className="w-9 h-9 bg-white border border-slate-200 rounded-lg flex items-center justify-center hover:bg-slate-50 cursor-pointer">
            <Minus className="w-4 h-4 text-slate-600" />
          </button>
          <span className="w-10 text-center font-extrabold text-sm text-slate-800">{guestCount}</span>
          <button onClick={() => setGuestCount(p => p + 1)}
            className="w-9 h-9 bg-white border border-slate-200 rounded-lg flex items-center justify-center hover:bg-slate-50 cursor-pointer">
            <Plus className="w-4 h-4 text-slate-600" />
          </button>
        </div>
      </div>
      {/* Service Staff + Customer selection REMOVED: the order is attributed to
          the logged-in user server-side (order.userId from the JWT) and the
          customer defaults to Walk-in. Nothing to pick here anymore. */}
    </div>
  );

  // ── Category rail (ONE implementation, two mount points) ─────────────────
  // `railClass` only decides HOW the rail is laid out in its parent:
  //   • 'hidden md:flex' — inside the menu step (tablet, other business types,
  //     and the modal wizard): same position as before.
  //   • 'flex'           — workspace level (restaurant PC page mode): the rail
  //     spans from the ordering header down to the action bar.
  // The width/typography/icon rules themselves are identical in both cases.
  const renderCategoryRail = (railClass) => (
      <aside className={`${railClass} flex-col shrink-0 min-h-0 border-r border-slate-100 bg-white transition-all duration-200 ${
        isRestaurantTenant
          ? (categorySidebarCollapsed ? 'w-40 lg:w-16' : 'w-40 lg:w-[250px]')
          : 'w-40 lg:w-52'
      }`}>
        <div className={`px-3 pt-3 pb-2 shrink-0 flex items-center ${
          railCollapsed ? 'lg:justify-center lg:px-0' : 'justify-between'
        }`}>
          <p className={`text-[9px] font-extrabold uppercase tracking-wider text-slate-400 ${railCollapsed ? 'lg:hidden' : ''}`}>Categories</p>
          <span className={`text-[9px] font-bold text-slate-400 ${railCollapsed ? 'lg:hidden' : ''}`}>{menuItems.length} items</span>
          {isRestaurantTenant && (
            <button type="button"
              onClick={() => setCategorySidebarCollapsed((collapsed) => !collapsed)}
              aria-label={categorySidebarCollapsed ? 'Expand category sidebar' : 'Collapse category sidebar'}
              aria-expanded={!categorySidebarCollapsed}
              aria-controls="pos-category-list"
              title={categorySidebarCollapsed ? 'Expand categories' : 'Collapse categories'}
              className="hidden lg:inline-flex w-7 h-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer">
              {categorySidebarCollapsed
                ? <ChevronRight className="w-4 h-4" aria-hidden="true" />
                : <ChevronLeft className="w-4 h-4" aria-hidden="true" />}
            </button>
          )}
        </div>
        <div ref={sidebarListRef}
          id="pos-category-list"
          role="tablist"
          aria-label="Menu categories"
          aria-orientation="vertical"
          onKeyDown={(e) => handleCategoryKeyDown(e, false)}
          className={`min-h-0 flex-1 overflow-y-auto overscroll-y-contain overscroll-contain touch-pan-y pb-3 space-y-1 ${railCollapsed ? 'px-2 lg:px-1.5' : 'px-2'}`}>
          <button ref={selectedCat === 'All' ? activeSidebarRef : null}
            role="tab" aria-selected={selectedCat === 'All'}
            aria-label="All Items"
            title="All Items"
            onClick={() => handleWizardCategorySelect('All')}
            className={`w-full rounded-xl transition-all cursor-pointer flex items-center gap-2 text-[11px] font-bold ${isRestaurantTenant ? 'h-10 lg:h-11 lg:text-[13px]' : 'h-10'} ${railCollapsed ? 'px-2 lg:justify-center lg:px-0' : 'px-3'} ${
              selectedCat === 'All'
                ? 'bg-[#16A34A] text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}>
            <LayoutGrid className={`w-3.5 h-3.5 shrink-0 ${isRestaurantTenant ? 'lg:w-4 lg:h-4' : ''}`} aria-hidden="true" />
            <span className={`flex-1 text-left truncate ${railCollapsed ? 'lg:hidden' : ''}`}>All Items</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${railCollapsed ? 'lg:hidden' : ''} ${selectedCat === 'All' ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>
              {menuItems.length}
            </span>
          </button>
          {sidebarCategories.map(cat => {
            const CategoryIcon = categoryIconFor(cat.name);
            return (
              <button key={cat.id} ref={selectedCat === cat.name ? activeSidebarRef : null}
                role="tab" aria-selected={selectedCat === cat.name}
                aria-label={cat.name}
                title={cat.name}
                onClick={() => handleWizardCategorySelect(cat.name)}
                className={`w-full rounded-xl transition-all cursor-pointer flex items-center gap-2 text-[11px] font-bold ${isRestaurantTenant ? 'h-10 lg:h-11 lg:text-[13px]' : 'h-10'} ${railCollapsed ? 'px-2 lg:justify-center lg:px-0' : 'px-3'} ${
                  selectedCat === cat.name
                    ? 'bg-[#16A34A] text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}>
                {/* Icons are a restaurant PC addition — tablet (md–lg) and
                    other business types keep their icon-free rows. */}
                {isRestaurantTenant && (
                  <CategoryIcon className="hidden lg:block w-4 h-4 shrink-0" aria-hidden="true" />
                )}
                <span className={`flex-1 text-left truncate ${railCollapsed ? 'lg:hidden' : ''}`}>{cat.name}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${railCollapsed ? 'lg:hidden' : ''} ${selectedCat === cat.name ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>
                  {countForCategory(cat.name)}
                </span>
              </button>
            );
          })}
          {sidebarCategories.length === 0 && !menuError && (
            <p className="px-2 py-3 text-[10px] text-slate-400 leading-relaxed">
              No categories yet — items show under All Items.
            </p>
          )}
        </div>
      </aside>
  );

  // ── Menu Step (Shared) ──
  const renderMenu = () => (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      {/* Inline barcode input removed (spec §13): the wizard never shows a
          scanner interface. With the scanner ON, the Basic POS workspace's
          dedicated Counter Scan screen is the single scanning UI. */}
      {/* Search lives in the header row (beside “New Order” on desktop, its own
          compact row on narrow screens) so the grid gets the vertical space.
          Search still spans the COMPLETE menu regardless of the selected
          category — see filteredItems above. */}

      {/* Compact category selector — PHONES only (below md). ONE non-wrapping,
          horizontally swipeable row: chips never wrap onto a second line, never
          widen the item grid, and every category stays reachable by swiping.
          The edge fades are the scroll affordance. Tablets (md+) use the
          persistent sidebar below instead. */}
      <div className="relative min-w-0 max-w-full shrink-0 border-b border-slate-100 bg-white md:hidden">
        {chipScroll.left && (
          <span aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-7 bg-gradient-to-r from-white via-white/80 to-transparent" />
        )}
        {chipScroll.right && (
          <span aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-7 bg-gradient-to-l from-white via-white/80 to-transparent" />
        )}
        <div ref={setChipRowRef}
          role="tablist"
          aria-label="Menu categories"
          onKeyDown={(e) => handleCategoryKeyDown(e, true)}
          onScroll={updateChipScrollState}
          className="flex flex-nowrap items-center gap-1.5 overflow-x-auto overflow-y-hidden overscroll-x-contain px-3 py-2 no-scrollbar touch-pan-x">
          <button ref={selectedCat === 'All' ? activeChipRef : null}
            role="tab" aria-selected={selectedCat === 'All'}
            onClick={() => handleWizardCategorySelect('All')}
            className={`shrink-0 h-9 px-3.5 text-[11px] font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedCat === 'All'
                ? 'bg-[#16A34A] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}>
            <LayoutGrid className="w-3.5 h-3.5" />
            All Items
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${selectedCat === 'All' ? 'bg-white/20' : 'bg-slate-200 text-slate-500'}`}>
              {menuItems.length}
            </span>
          </button>
          {sidebarCategories.map(cat => (
            <button key={cat.id} ref={selectedCat === cat.name ? activeChipRef : null}
              role="tab" aria-selected={selectedCat === cat.name}
              title={cat.name}
              onClick={() => handleWizardCategorySelect(cat.name)}
              className={`shrink-0 h-9 px-3.5 text-[11px] font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                selectedCat === cat.name
                  ? 'bg-[#16A34A] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              <span className="max-w-[9rem] truncate">{cat.name}</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${selectedCat === cat.name ? 'bg-white/20' : 'bg-slate-200 text-slate-500'}`}>
                {countForCategory(cat.name)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0 min-w-0">
      {!workspaceCategoryRail && renderCategoryRail('hidden md:flex')}

      {/* Right column: subcategory row + item grid */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0">

      {/* LEVEL 2 — Subcategory tab row for the selected category (Part 2 req. 1-4):
          Category → Subcategory → Items. Category change resets this to All. */}
      {selectedCat !== 'All' && wizardSubcatTabs.length > 0 && (
        <div className="shrink-0 border-b border-slate-100 bg-white">
          <div className="flex gap-1.5 overflow-x-auto px-3 py-2 no-scrollbar">
            <button onClick={() => setSelectedSubcat(SUBCATEGORY_ALL)}
              className={`shrink-0 h-8 px-3 text-[10px] font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                selectedSubcat === SUBCATEGORY_ALL
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              All
            </button>
            {wizardSubcatTabs.map(tab => (
              <button key={tab.id} onClick={() => setSelectedSubcat(tab.id)}
                className={`shrink-0 h-8 px-3 text-[10px] font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  selectedSubcat === tab.id
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}>
                {tab.name} ({tab.count})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Items grid — large POS-style cards */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-3">
        {menuError ? (
          /* Error state — the menu request failed. Offer a retry instead of
             silently showing an empty grid (the wizard never fabricates data). */
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mb-3">
              <AlertCircle className="w-7 h-7 text-red-400" />
            </div>
            <p className="text-sm font-bold text-slate-600 mb-1">Could not load the menu</p>
            <p className="text-[11px] text-slate-400 mb-4">{menuError}</p>
            <button onClick={loadMenu}
              className="h-8 px-4 bg-[#16A34A] hover:bg-[#15803D] text-white font-bold rounded-lg text-[10px] uppercase tracking-wider cursor-pointer">
              Retry
            </button>
          </div>
        ) : (
        <>
        <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 ${isRestaurantTenant ? '2xl:grid-cols-6' : ''}`}>
          {filteredItems.map(item => {
            const inCart = cart.find(c => c.itemId === item.id);
            const outOfStock = item.stockStatus === 'Out of Stock';
            return (
              <div key={item.id}
                onClick={() => !outOfStock && addToCart({ ...item, price: effectiveUnitPrice(item) })}
                className={`bg-white border rounded-2xl overflow-hidden transition-all active:scale-[0.97] ${
                  inCart ? 'border-[#16A34A] shadow-sm ring-1 ring-[#16A34A]/20' :
                  outOfStock ? 'opacity-50 border-slate-200 cursor-not-allowed grayscale' :
                  'border-slate-200 hover:border-[#16A34A] hover:shadow-md cursor-pointer'
                }`}>
                {/* Image section — larger for POS touch */}
                <div className="relative h-24 bg-slate-100 overflow-hidden">
                  {item.image ? (
                    <img src={item.image} alt={item.name} className="w-full h-full object-cover" loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(e) => { e.target.src = PLACEHOLDER_IMAGE; }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-3xl">{isDietaryBusiness ? (item.isVeg ? '🥗' : '🍖') : '📦'}</span>
                    </div>
                  )}
                  {/* Veg / Non-veg indicator — food verticals only (§10) */}
                  {isDietaryBusiness && (
                  <span className="absolute top-1.5 left-1.5 w-4 h-4 rounded-sm border-2 flex items-center justify-center bg-white/90">
                    <span className={`w-2 h-2 rounded-full ${item.isVeg ? 'bg-emerald-600 border-emerald-600' : 'bg-red-600 border-red-600'}`} />
                  </span>
                  )}
                  {/* Price badge */}
                  <span className="absolute bottom-1.5 right-1.5 bg-slate-900/80 text-white font-mono text-[10px] font-bold px-1.5 py-0.5 rounded">
                    {currency}{effectiveUnitPrice(item)}
                  </span>

                  {/* In-cart quantity badge */}
                  {inCart && (
                    <div className="absolute top-1.5 right-1.5 w-6 h-6 bg-[#16A34A] rounded-full flex items-center justify-center text-white text-[10px] font-extrabold shadow-md">
                      {inCart.qty}
                    </div>
                  )}
                </div>
                {/* Info section */}
                <div className="p-2.5">
                  <p className="text-[12px] font-extrabold text-slate-800 truncate leading-tight mb-1">{item.name}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold text-[#16A34A] font-mono">{currency}{effectiveUnitPrice(item)}</span>
                    {outOfStock ? (
                      <span className="text-[9px] font-bold text-red-500">Sold Out</span>
                    ) : item.stockStatus === 'Available' ? (
                      <span className="text-[9px] font-bold text-slate-400">In Stock</span>
                    ) : null}
                  </div>
                </div>
                {/* In-cart quantity controls */}
                {inCart && (
                  <div className="flex items-center justify-between px-2.5 pb-2.5">
                    <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50">
                      <button onClick={(e) => { e.stopPropagation(); updateCartQty(item.id, -1); }} className="px-2.5 py-1.5 hover:bg-slate-100 cursor-pointer transition-colors">
                        <Minus className="w-3.5 h-3.5 text-slate-600" />
                      </button>
                      <span className="px-2.5 py-1.5 font-extrabold text-xs text-slate-800">{inCart.qty}</span>
                      <button onClick={(e) => { e.stopPropagation(); updateCartQty(item.id, 1); }} className="px-2.5 py-1.5 hover:bg-slate-100 cursor-pointer transition-colors">
                        <Plus className="w-3.5 h-3.5 text-slate-600" />
                      </button>
                    </div>
                    <div className="flex gap-0.5">
                      <button onClick={(e) => { e.stopPropagation(); setNotesForItem(item.id); setNotesText(inCart.notes || ''); }}
                        className="p-1.5 text-slate-400 hover:text-amber-600 cursor-pointer" title="Add note">
                        <span className="text-[11px]">📝</span>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); removeFromCart(item.id); }}
                        className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer" title="Remove">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Empty state */}
        {filteredItems.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
              <Package className="w-7 h-7 text-slate-300" />
            </div>
            <p className="text-sm font-bold text-slate-500 mb-1">No menu items found</p>
            <p className="text-[11px] text-slate-400">
              {searchQuery
                ? `No results for "${searchQuery}" across the whole menu. Try a different search.`
                : selectedCat !== 'All'
                  ? `No items available in ${selectedCat}. Try another category.`
                  : 'No menu items available. Add items in Menu Management.'}
            </p>
          </div>
        )}
        </>
        )}
      </div>
      </div>
      </div>
    </div>
  );

  // ── Render: Review / Actions ──
  const renderReview = () => (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-3">
        <h3 className="text-sm font-extrabold text-slate-800">Review Order</h3>
        <p className="text-[10px] text-slate-400">
          {isTakeaway ? 'Take Away' : `Table: ${selectedTable?.name || '-'}${acNonAcPricing && selectedTable ? ` (${selectedTable.floorType === 'AC' ? 'AC' : 'Non-AC'})` : ''} · ${guestCount} guest(s)`} · {cart.reduce((s, c) => s + c.qty, 0)} items
          {!isTakeaway && waiterName ? ` · Service Staff: ${waiterName}` : ''}
        </p>

        {/* Order Info Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-100">
            <p className="text-[8px] font-bold text-emerald-600 uppercase tracking-wider">Type</p>
            <p className="text-[11px] font-extrabold text-slate-800 mt-0.5 capitalize">{orderType?.replace('_', ' ') || '-'}</p>
          </div>
          <div className="p-2.5 bg-blue-50 rounded-xl border border-blue-100">
            <p className="text-[8px] font-bold text-blue-600 uppercase tracking-wider">{needsTable ? 'Table' : 'Method'}</p>
            <p className="text-[11px] font-extrabold text-slate-800 mt-0.5">{selectedTable?.name || (isTakeaway ? 'Take Away' : '-')}</p>
          </div>
          {!isTakeaway && (
          <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-100">
            <p className="text-[8px] font-bold text-amber-600 uppercase tracking-wider">Guests</p>
            <p className="text-[11px] font-extrabold text-slate-800 mt-0.5">{guestCount}</p>
          </div>
          )}
          <div className="p-2.5 bg-purple-50 rounded-xl border border-purple-100">
            <p className="text-[8px] font-bold text-purple-600 uppercase tracking-wider">Items</p>
            <p className="text-[11px] font-extrabold text-slate-800 mt-0.5">{cart.reduce((s, c) => s + c.qty, 0)}</p>
          </div>
        </div>

        {/* Items List */}
        <div className="space-y-1">
          <p className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">Items</p>
          {cart.map((item) => (
            <div key={item.itemId} className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-xl">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold text-[#16A34A] shrink-0">{item.qty}x</span>
                  <p className="text-xs font-bold text-slate-800 truncate">{item.name}</p>
                </div>
                {item.notes && <p className="text-[9px] text-amber-700 font-semibold mt-0.5">📝 {item.notes}</p>}
              </div>
              <span className="font-mono font-bold text-xs text-slate-700 shrink-0 ml-2">{currency}{(item.price * item.qty).toFixed(0)}</span>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-3.5 space-y-1.5 text-xs">
          <div className="flex justify-between text-slate-600"><span>Subtotal</span><span className="font-mono font-bold">{currency}{subtotal.toFixed(0)}</span></div>
          {settings?.taxType === 'Exclusive' && (
            <div className="flex justify-between text-slate-500"><span>Tax ({gstRate}%)</span><span className="font-mono">{currency}{taxAmount.toFixed(0)}</span></div>
          )}
          {serviceCharge > 0 && (
            <div className="flex justify-between text-slate-500"><span>Service Charge ({serviceCharge}%)</span><span className="font-mono">{currency}{serviceChargeAmount.toFixed(0)}</span></div>
          )}
          <div className="flex justify-between font-extrabold text-sm text-slate-800 border-t border-slate-200 pt-2 mt-2">
            <span>Grand Total</span><span className="font-mono text-[#16A34A]">{currency}{grandTotal.toFixed(0)}</span>
          </div>
          {settings?.taxType === 'Inclusive' && gstRate > 0 && (
            <div className="text-[9px] text-slate-400 italic text-right">(incl. Tax {gstRate}%)</div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          <p className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">{isEditing ? 'Add Additional Items' : 'Choose Action'}</p>
          <div className="grid grid-cols-2 gap-2">
            {/* Show existing items when editing */}
            {isEditing && editExistingItems.length > 0 && (
              <div className="col-span-2 bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-1.5">
                <p className="text-[9px] font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1">
                  <ShoppingCart className="w-3 h-3" /> Existing Items on Order
                </p>
                {editExistingItems.map((item) => (
                  <div key={item.itemId} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="font-mono font-bold text-blue-600 shrink-0">{item.qty}x</span>
                      <span className="font-semibold text-slate-700 truncate">{item.name}</span>
                    </div>
                    <span className="font-mono font-bold text-slate-600 shrink-0 ml-1">{currency}{(item.price * item.qty).toFixed(0)}</span>
                  </div>
                ))}
              </div>
            )}

            {isEditing ? (
              /* Update Order (for editing existing orders) */
              <button onClick={handleUpdateOrder} disabled={submitting !== null || cart.length === 0}
                className="p-3 border-2 border-[#16A34A] rounded-2xl bg-[#16A34A]/5 hover:bg-[#16A34A]/10 transition-all text-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed col-span-2">
                {submitting === 'update' ? (
                  <Loader2 className="w-5 h-5 text-[#16A34A] mx-auto mb-1 animate-spin" />
                ) : (
                  <Play className="w-5 h-5 text-[#16A34A] mx-auto mb-1" />
                )}
                <p className="text-[10px] font-extrabold text-[#16A34A]">{submitting === 'update' ? 'Updating...' : 'Update Order'}</p>
                <p className="text-[8px] text-emerald-600 mt-0.5">Add {cart.reduce((s, c) => s + c.qty, 0)} new item(s) to order</p>
              </button>
            ) : (
            <>
            {/* No configured kitchen printer — printed through the system print
                dialog instead, with an explicit warning (never a silent claim). */}
            {kotCapable && !printerConfigured && (
              <div className="col-span-2 flex items-center gap-2 px-3 py-2 rounded-xl border border-amber-200 bg-amber-50">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <p className="text-[10px] font-semibold text-amber-800">
                  No printer configured — the KOT prints via the system dialog. Add one in POS Settings → Printer Configuration.
                </p>
              </div>
            )}
            {/* Print KOT — the ONE action that creates the order and issues its
                kitchen ticket. Available for EVERY kitchen-capable business: the
                Kitchen screen visibility toggle must never disable KOT printing. */}
            {kotCapable && (
            <button onClick={handlePrintKot} disabled={submitting !== null || (needsTable && !selectedTable)}
              className="p-3 border-2 border-orange-200 rounded-2xl hover:border-[#C85A32] hover:bg-orange-50 transition-all text-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              <Printer className="w-5 h-5 text-[#C85A32] mx-auto mb-1" />
              <p className="text-[10px] font-extrabold text-[#C85A32]">Print KOT</p>
              <p className="text-[8px] text-orange-500 mt-0.5">Send to kitchen</p>
            </button>
            )}
            {/* Place Order — only for a business WITHOUT the kitchen capability:
                creates the order without a kitchen ticket, payment stays with
                the cashier. A food business never sees this in place of KOT. */}
            {!kotCapable && (
            <button onClick={handlePlaceOrder} disabled={submitting !== null || (needsTable && !selectedTable)}
              className="p-3 border-2 border-emerald-200 rounded-2xl hover:border-[#16A34A] hover:bg-emerald-50 transition-all text-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              <Save className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
              <p className="text-[10px] font-extrabold text-emerald-700">Place Order</p>
              <p className="text-[8px] text-emerald-500 mt-0.5">No kitchen ticket · pay at cashier, {currency}{grandTotal.toFixed(0)}</p>
            </button>
            )}
            </>
            )}
          </div>
        </div>

        {/* Cancel Order - hidden when editing */}
        {!isEditing && (
        <div className="pt-1">
          <button onClick={handleCancelOrder} disabled={submitting !== null}
            className="w-full py-2.5 border border-red-200 rounded-xl text-[10px] font-bold text-red-600 hover:bg-red-50 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
            <Ban className="w-3.5 h-3.5" /> Cancel Order
          </button>
        </div>
        )}
      </div>

      {/* Submitting overlay */}
      {submitting && (
        <div className="px-4 py-2.5 bg-[#16A34A]/10 border-t border-[#16A34A]/20 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-[#16A34A]" />
          <span className="text-[11px] font-bold text-[#16A34A]">
            {submitting === 'kot' ? 'Printing KOT...' :
             submitting === 'order' ? 'Placing order...' :
             submitting === 'update' ? 'Updating order...' : 'Processing...'}
          </span>
        </div>
      )}

      {/* Success Banner */}
      {actionSuccess && (
        <div className="px-4 py-2.5 bg-emerald-50 border-t border-emerald-200 flex items-center justify-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          <span className="text-[11px] font-bold text-emerald-700">
            {actionSuccess === 'order' ? 'Order created!' : 'Order completed!'}
          </span>
        </div>
      )}

    </div>
  );

  // ── Main Render ──
  // The wizard's modal overlay is the only modal mount point for a table's
  // order entry; background scrolling is locked while it is open (its own
  // scrolling areas keep working).
  useBodyScrollLock(!isPageMode && showTakeOrderWizard);

  if (!isPageMode && !showTakeOrderWizard) return null;

  // Show loading spinner while initial data loads (placed after ALL hooks)
  if (dataLoading) {
    if (isPageMode) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#16A34A]" />
            <p className="text-xs font-bold text-slate-500">Loading...</p>
          </div>
        </div>
      );
    }
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
        <div className="bg-white rounded-2xl shadow-2xl p-10 flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#16A34A]" />
          <p className="text-xs font-bold text-slate-500">Loading...</p>
        </div>
      </div>
    );
  }

  // Ordering workspace = header row + stepper + step content. In POS Ordering
  // page mode for a restaurant on desktop the category rail is mounted OUTSIDE
  // this block (see wizardContent) so it starts at the ordering header — the
  // first element below the app header — instead of below the stepper.
  const wizardWorkspace = (
    <>
        {/* Header — one compact row on desktop: back + title, the menu search,
            then the table/order badges. On narrow widths the search wraps onto
            its own row (order-last) instead of overflowing. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-3 sm:px-4 py-2 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            {(!isPageMode || isTableSession) && (
              <>
                {/* Overlay: close. Page mode (POS Ordering screen): leave a
                    handed-over table order and go back to Floors & Tables. */}
                <button
                  onClick={isPageMode ? handleExitTableSession : handleClose}
                  aria-label={isPageMode ? 'Exit table order' : 'Close order wizard'}
                  className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                >
                  {isPageMode ? <ArrowLeft className="w-4 h-4" /> : <X className="w-4 h-4" />}
                </button>
                <div className="h-4 w-px bg-slate-200" />
              </>
            )}
            <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider whitespace-nowrap">{isEditing ? `Edit Order #${editingOrder.orderNo || editingOrder.id}` : 'New Order'}</h2>
          </div>

          {/* Search — beside the title from md up, second row below it on mobile */}
          {isMenuStep && (
            <div className="order-last w-full md:order-none md:w-auto md:flex-1 md:px-1">
              {menuSearchField}
            </div>
          )}

          <div className="flex items-center gap-1.5 flex-wrap justify-end ml-auto">
            {/* The table this order belongs to — always visible while ordering
                so a wrong table can never be mistaken for the right one
                (Floors & Tables → Open Table carries the exact table here). */}
            {selectedTable && !isTakeaway && (
              <span
                className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-lg text-[9px] font-bold flex items-center gap-1 max-w-[9rem]"
                title={selectedTable.name}
              >
                <Users className="w-3 h-3 shrink-0" />
                <span className="truncate">{selectedTable.name}</span>
              </span>
            )}
            {cart.length > 0 && (
              <span className="bg-[#16A34A]/10 text-[#16A34A] px-2 py-0.5 rounded-lg text-[9px] font-bold flex items-center gap-1">
                <ShoppingCart className="w-3 h-3" /> {cart.length}
              </span>
            )}
            {editExistingItems.length > 0 && (
              <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-lg text-[9px] font-bold flex items-center gap-1">
                {editExistingItems.reduce((s, i) => s + i.qty, 0)} existing
              </span>
            )}
            {orderType && (
              <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-lg text-[9px] font-bold capitalize">{orderType.replace('_', ' ')}</span>
            )}
          </div>
        </div>

        {/* Step Indicator */}
        {renderStepIndicator()}

        {/* Step Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Step 0: Order Type */}
          {currentStep === 0 && renderOrderType()}

          {/* Dine In Steps */}
          {orderType === 'dine_in' && currentStep === 1 && renderFloor()}
          {orderType === 'dine_in' && currentStep === 2 && renderTable()}
          {orderType === 'dine_in' && currentStep === 3 && renderMenu()}
          {orderType === 'dine_in' && currentStep === 4 && renderReview()}

          {/* Takeaway Steps - skip Order Details, open directly on Menu */}
          {isTakeaway && currentStep === 1 && renderMenu()}
          {isTakeaway && currentStep === 2 && renderReview()}
        </div>
    </>
  );

  const wizardContent = (
    <>
      {/* Restaurant PC page mode: the category rail is a workspace-level column,
          so its top aligns with the ordering header (directly below the app
          header) and its bottom meets the action bar. ONE rail instance —
          renderMenu skips its own copy in this branch. The footer stays OUTSIDE
          this row at full width, so the rail always ends above it and never
          covers Back / Review. The row is a definite-height flex child, so the
          category list alone scrolls and the page never scrolls. */}
      {workspaceCategoryRail ? (
        <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden">
          {renderCategoryRail('flex')}
          <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
            {wizardWorkspace}
          </div>
        </div>
      ) : wizardWorkspace}

        {/* Footer Navigation */}
        {/* Auto-advance steps (Order Type / Floor / Table) no longer show a
            Continue button — tapping a selection moves forward immediately.
            Continue remains ONLY on the Menu step (→ Review), where there is no
            single selection to advance on. Back is unchanged on every step. */}
        {!actionSuccess && (
          <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-t border-slate-200 bg-slate-50 shrink-0">
            <button onClick={goBack} disabled={!canGoBack}
              className="h-9 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 font-bold rounded-xl text-[10px] sm:text-xs flex items-center gap-1.5 transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-sm">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
            {currentStep === (isTakeaway ? 1 : 3) && currentStep < maxStep && (
              <button onClick={goNext}
                disabled={cart.length === 0}
                className={`h-9 px-4 font-bold rounded-xl text-[10px] sm:text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm ${
                  cart.length === 0
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                    : 'bg-[#16A34A] hover:bg-[#15803D] text-white'
                }`}>
                Review ({cart.reduce((s, c) => s + c.qty, 0)} items) <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

      {/* Notes Modal */}
      {notesForItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/30 backdrop-blur-xs">
          <div className="bg-white w-full max-w-xs rounded-xl shadow-xl border border-slate-100 p-4 space-y-3 animate-fade-in">
            <h4 className="text-xs font-extrabold text-slate-800">Add Note</h4>
            <input value={notesText} onChange={(e) => setNotesText(e.target.value)}
              placeholder="e.g., Less spicy, extra cheese..."
              className="w-full h-9 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-[#16A34A]" autoFocus />
            <div className="flex gap-2">
              <button onClick={() => setNotesForItem(null)}
                className="flex-1 h-8 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 cursor-pointer transition-colors">Cancel</button>
              <button onClick={() => setItemNotes(notesForItem, notesText)}
                className="flex-[2] h-8 bg-[#16A34A] text-white rounded-lg text-xs font-bold hover:bg-[#15803D] cursor-pointer transition-colors">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmDialog !== null && !confirmDialog?.children}
        title={confirmDialog?.title}
        message={confirmDialog?.message}
        confirmVariant={confirmDialog?.confirmVariant}
        onConfirm={confirmDialog?.onConfirm || (() => {})}
        onCancel={confirmDialog?.onCancel || (() => {})}
      />
    </>
  );

  if (isPageMode) {
    return (
      <div className="h-full w-full flex flex-col overflow-hidden">
        {wizardContent}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      {/* Full-bleed on phones; inset rounded card from sm up (portrait tablets
          get the same card at a comfortable width without touching screen edges).
          DYNAMIC viewport units (dvh) keep the card inside the VISIBLE viewport
          on mobile browsers whose toolbar changes the viewport height, and the
          safe-area padding keeps the header/footer clear of notches and
          gesture bars. The card has a definite height, so the step content and
          item list scroll INSIDE it (the page behind never scrolls). */}
      <div className="bg-white w-full h-[100dvh] sm:h-[95dvh] sm:max-w-4xl sm:rounded-2xl sm:shadow-2xl sm:mx-4 flex flex-col overflow-hidden pt-safe pb-safe sm:pt-0 sm:pb-0">
        {wizardContent}
      </div>
    </div>
  );
}
