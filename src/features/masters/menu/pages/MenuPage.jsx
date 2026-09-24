import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, RefreshCw, Edit, Trash, X, Leaf, Beef, Barcode, Package, AlertTriangle, Check, Info, AlertCircle, Eye, EyeOff, Image as ImageIcon, Upload, Camera } from 'lucide-react';
import { useSettingsStore, useUiStore } from '../../../../store';
import { getBusinessCapabilities, catalogNaming } from '../../../../utils/businessCapabilities';
import { menuApi } from '../../../../api/menu.api';
import { categoryApi } from '../../../../api/category.api';
import { useSocketEvent } from '../../../../hooks/useSocket';
import { subscribeMenuInvalidation } from '../../../../services/menuSync';
import { PLACEHOLDER_IMAGE } from '../../../../lib/imagePlaceholder';
import ConfirmationDialog from '../../../../components/ConfirmationDialog';
import {
  SUBCATEGORY_ALL,
  subcategoryTabsFor,
  filterMenuItems,
} from '../../../../utils/menuHierarchy';

// ── Numeric input sanitizer ──
// One reusable rule for every numeric field (Price, Prep Time, Stock Quantity,
// Tax %, Display Order). Returns a STRING so an empty field stays empty and the
// input text always matches the state — the classic fix for the leading-zero
// "0219" artifact in controlled number inputs (a numeric value would otherwise
// collapse empty → 0 and let the raw text linger in the DOM). The API payload
// converts the sanitized string with toNumber() below.
const sanitizeNumeric = (raw) => {
  if (raw == null) return '';
  let value = String(raw).trim();
  if (value === '') return '';
  // Strip unnecessary leading zeros: "00219" → "219", "0005" → "5",
  // "0180.50" → "180.50", "0" → "0", "0.5" stays "0.5".
  if (/^0+\d/.test(value)) value = value.replace(/^0+/, '');
  // Never drop the integer zero before a decimal point: ".5" → "0.5".
  if (value.startsWith('.')) value = `0${value}`;
  return value;
};

// Convert a sanitized field value to the actual numeric value sent to the API.
const toNumber = (value) => {
  if (value === '' || value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const CATEGORY_COLORS = [
  '#16A34A', '#2563EB', '#DC2626', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#84CC16', '#6366F1',
  '#14B8A6', '#E11D48', '#A855F7', '#0EA5E9', '#D946EF'
];

const CATEGORY_ICONS = ['utensils', 'pizza', 'hamburger', 'coffee', 'wine', 'cake', 'ice-cream', 'salad', 'fish', 'drumstick', 'bread', 'cheese', 'apple', 'cup', 'beer'];

const ICON_MAP = {
  utensils: '🍽️', pizza: '🍕', hamburger: '🍔', coffee: '☕',
  wine: '🍷', cake: '🎂', 'ice-cream': '🍦', salad: '🥗',
  fish: '🐟', drumstick: '🍗', bread: '🍞', cheese: '🧀',
  apple: '🍎', cup: '🥤', beer: '🍺'
};

// Module-level cache to prevent refetch on remount
let cachedMenuItems = null;
let cachedCategories = null;
let cachedMenuFetched = 0;
let cachedCatFetched = 0;
const CACHE_TTL = 60000; // 1 minute cache

// Root-cause fix for stale stock: AppShell invalidates this cache on every
// order:payment event (even while this screen is unmounted), so the next open
// always shows freshly deducted stock.
// Registered once per module instance (guards against Vite HMR duplicates).
let invalidationRegistered = false;
if (!invalidationRegistered) {
  invalidationRegistered = true;
  subscribeMenuInvalidation(() => {
    cachedMenuFetched = 0;
    cachedCatFetched = 0;
  });
}

export default function MenuPage() {
  const { settings } = useSettingsStore();
  const currency = settings?.currencySymbol || '₹';
  const { addToast } = useUiStore();
  
  // Menu items state
  const [menuItems, setMenuItems] = useState(cachedMenuItems || []);
  const [loading, setLoading] = useState(!cachedMenuItems);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedSubcategory, setSelectedSubcategory] = useState('All');
  const [filterDietary, setFilterDietary] = useState('All');
  const [subcategories, setSubcategories] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false); // re-entrancy guard against duplicate submits
  const [imageUploadedRef, setImageUploadedRef] = useState(null);
  const [legacyImageWarning, setLegacyImageWarning] = useState(false);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  // Local object-URL preview shown immediately while the file uploads (revoked after use)
  const localPreviewUrlRef = useRef(null);
  
  // Categories state
  const [categories, setCategories] = useState(cachedCategories || []);
  const [catLoading, setCatLoading] = useState(false);
  const [showCatForm, setShowCatForm] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteItemTarget, setDeleteItemTarget] = useState(null);
  const [deletingItem, setDeletingItem] = useState(false);
  const [catForm, setCatForm] = useState({ name: '', sortOrder: 0, image: '', color: '#16A34A', icon: 'utensils', isActive: true });
  const [catSubmitting, setCatSubmitting] = useState(false);

  // ── Update Category flow state ──
  const [showUpdateCatModal, setShowUpdateCatModal] = useState(false);
  const [catSearchQuery, setCatSearchQuery] = useState('');

  // ── Subcategory management state (Part 15) ──
  const [showSubCatModal, setShowSubCatModal] = useState(false);
  const [subCatCategory, setSubCatCategory] = useState('');
  const [subCatForm, setSubCatForm] = useState({ name: '', description: '', sortOrder: 0 });
  const [editingSubCat, setEditingSubCat] = useState(null);
  const [subCatSaving, setSubCatSaving] = useState(false);

  // Form state
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState(150);
  const [itemCategory, setItemCategory] = useState('');
  const [itemDesc, setItemDesc] = useState('');
  const [itemImage, setItemImage] = useState('');
  const [itemImagePublicId, setItemImagePublicId] = useState('');
  const [itemStock, setItemStock] = useState('Available');
  const [itemLive, setItemLive] = useState(true);
  const [itemVeg, setItemVeg] = useState(true);
  const [itemSubcategoryId, setItemSubcategoryId] = useState('');
  // Restaurant dietary mode (Part 16): VEG_ONLY restaurants can only create
  // VEG items — the Non-Veg option is hidden entirely (backend enforces too).
  const restaurantVegOnly = (settings.dietaryMode || 'VEG_AND_NON_VEG') === 'VEG_ONLY';
  // Centralized capability check (§9/§10): the dietary filter and veg/non-veg
  // indicators only exist for food verticals. Non-food businesses (retail)
  // get a clean product UI — the DB fields stay but are never surfaced.
  const isDietaryBusiness = (settings.capabilities || getBusinessCapabilities(settings.businessType)).dietary === true;
  // Full capability set (§2): the Add/Edit form itself is capability-driven —
  // retail tenants get Product Name / no Veg-Non-Veg / no Prep Time, food
  // tenants keep the existing form. catalogNaming() drives the terminology.
  const menuCapabilities = settings.capabilities || getBusinessCapabilities(settings.businessType);
  const isKitchenBusiness = menuCapabilities.kitchen === true;
  const showBarcodeField = menuCapabilities.barcode === true;
  const naming = catalogNaming(settings.businessType);
  const isStockBusiness = menuCapabilities.stock === true;
  const [itemSku, setItemSku] = useState('');
  const [itemBarcode, setItemBarcode] = useState('');
  const [itemPrepTime, setItemPrepTime] = useState(10);
  const [itemStockQty, setItemStockQty] = useState(50);
  const [itemTax, setItemTax] = useState(5);
  const [itemKitchenCategory, setItemKitchenCategory] = useState('Main Course');
  const [itemGst, setItemGst] = useState(settings.gstPercentage || 5);

  useEffect(() => {
    const now = Date.now();
    if (!cachedMenuItems || now - cachedMenuFetched > CACHE_TTL) {
      loadMenu();
    }
    if (!cachedCategories || now - cachedCatFetched > CACHE_TTL) {
      loadCategories();
    }
    loadSubcategories();
  }, []);

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

  // ── Live stock sync: stock is reserved at ORDER PLACEMENT (not payment), so
  // any order lifecycle event changes stock levels. Invalidate the module cache
  // and refetch so Menu & Stock always reflects the latest quantities
  // (same-terminal and cross-terminal). ──
  const refreshStockFromOrderEvent = () => {
    cachedMenuFetched = 0;
    loadMenu();
  };
  useSocketEvent({ event: 'order:created', handler: refreshStockFromOrderEvent });
  useSocketEvent({ event: 'order:updated', handler: refreshStockFromOrderEvent });
  useSocketEvent({ event: 'order:cancelled', handler: refreshStockFromOrderEvent });
  useSocketEvent({ event: 'order:deleted', handler: refreshStockFromOrderEvent });
  useSocketEvent({ event: 'order:payment', handler: refreshStockFromOrderEvent });

  const loadMenu = async () => {
    setLoading(true);
    try {
      const resp = await menuApi.getAll();
      const items = (resp.items || []).map((m) => ({
        id: `menu-${m.id}`,
        name: m.name,
        price: Number(m.price),
        category: m.category?.name || 'Main Course',
        categoryId: m.category?.id || m.categoryId,
        description: m.description || '',
        image: m.image || PLACEHOLDER_IMAGE,
        imagePublicId: m.imagePublicId || '',
        imageIsExternal: m.imageIsExternal === true,
        isLive: m.isAvailable !== false,
        stockStatus: m.isAvailable === false ? 'Out of Stock' : (m.currentStock !== undefined && m.currentStock < 10 && m.currentStock >= 0) ? 'Low Stock' : 'Available',
        isVeg: m.isVeg !== false,
        dietaryType: m.dietaryType || (m.isVeg !== false ? 'VEG' : 'NON_VEG'),
        subcategoryId: m.subcategoryId || null,
        subcategoryName: m.subcategory?.name || null,
        sku: m.sku || `SKU-${String(m.id).padStart(4, '0')}`,
        barcode: m.barcode || '',
        prepTime: m.preparationTime || 10,
        currentStock: m.currentStock ?? 50,
        stockQty: m.currentStock ?? 50,
        taxPercentage: m.gstPercentage ?? settings.gstPercentage ?? 5,
        kitchenCategory: m.kitchenCategory || 'Main Course',
      }));
      setMenuItems(items);
      cachedMenuItems = items;
      cachedMenuFetched = Date.now();
    } catch (e) {
      console.error('Failed to load menu:', e);
      addToast('Failed to load menu items', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    setCatLoading(true);
    try {
      const resp = await categoryApi.getAll();
      const mapped = (resp.categories || []).map((c) => ({
        id: `cat-${c.id}`,
        name: c.name,
        sortOrder: c.sortOrder || 0,
        image: c.image || '',
        color: c.color || '#16A34A',
        icon: c.icon || 'utensils',
        isActive: c.isActive !== false,
      }));
      const sorted = mapped.sort((a, b) => a.sortOrder - b.sortOrder);
      setCategories(sorted);
      cachedCategories = sorted;
      cachedCatFetched = Date.now();
    } catch (e) {
      console.error('Failed to load categories:', e);
    } finally {
      setCatLoading(false);
    }
  };

  // ── Subcategory CRUD Handlers (Part 15) ────────────────
  const handleSubCatSubmit = async () => {
    if (!subCatForm.name.trim() || !subCatCategory) return;
    setSubCatSaving(true);
    try {
      const categoryId = parseInt(String(subCatCategory).replace('cat-', ''));
      if (editingSubCat) {
        await menuApi.updateSubcategory(editingSubCat.id, { name: subCatForm.name.trim(), sortOrder: subCatForm.sortOrder });
        addToast('Subcategory updated', 'success');
      } else {
        await menuApi.createSubcategory({ categoryId, name: subCatForm.name.trim(), sortOrder: subCatForm.sortOrder || 0 });
        addToast('Subcategory added', 'success');
      }
      setEditingSubCat(null);
      setSubCatForm({ name: '', description: '', sortOrder: 0 });
      loadSubcategories();
    } catch (e) {
      addToast(e?.message || 'Failed to save subcategory', 'error');
    } finally {
      setSubCatSaving(false);
    }
  };

  const handleSubCatToggle = async (s) => {
    try {
      await menuApi.updateSubcategory(s.id, { isActive: !s.isActive });
      loadSubcategories();
    } catch (e) {
      addToast(e?.message || 'Failed to update subcategory', 'error');
    }
  };

  const handleSubCatDelete = async (s) => {
    const itemCount = menuItems.filter(m => m.subcategoryId === s.id).length;
    let moveTo;
    if (itemCount > 0) {
      const siblings = subcategories.filter(x => x.categoryId === s.categoryId && x.id !== s.id && x.isActive);
      if (siblings.length === 0) {
        moveTo = 'none'; // no siblings — items drop to None (still visible under the category)
      } else {
        moveTo = String(siblings[0].id); // move into the first sibling
      }
    }
    try {
      await menuApi.deleteSubcategory(s.id, moveTo);
      addToast(itemCount > 0 ? `Deleted — ${itemCount} item(s) reassigned.` : 'Subcategory deleted', 'success');
      if (editingSubCat?.id === s.id) setEditingSubCat(null);
      loadSubcategories();
      cachedMenuFetched = 0;
      loadMenu();
    } catch (e) {
      addToast(e?.message || 'Failed to delete subcategory', 'error');
    }
  };

  // ── Category CRUD Handlers ───────────────────────────────────
  const resetCatForm = () => {
    setCatForm({ name: '', sortOrder: categories.length + 1, image: '', color: '#16A34A', icon: 'utensils', isActive: true });
    setEditingCat(null);
  };

  const handleOpenAddCat = () => {
    resetCatForm();
    setShowCatForm(true);
  };

  const handleOpenUpdateCat = () => {
    setCatSearchQuery('');
    setShowUpdateCatModal(true);
  };

  const handleSelectCatToUpdate = (cat) => {
    setShowUpdateCatModal(false);
    handleOpenEditCat(cat);
  };

  const handleOpenEditCat = (cat) => {
    setEditingCat(cat);
    setCatForm({
      name: cat.name,
      sortOrder: cat.sortOrder || 0,
      image: cat.image || '',
      color: cat.color || '#16A34A',
      icon: cat.icon || 'utensils',
      isActive: cat.isActive !== false
    });
    setShowCatForm(true);
  };

  const handleCatSubmit = async (e) => {
    e.preventDefault();
    if (!catForm.name.trim()) return;
    setCatSubmitting(true);
    try {
      const payload = {
        name: catForm.name,
        sortOrder: toNumber(catForm.sortOrder),
        image: catForm.image || undefined,
        color: catForm.color,
        icon: catForm.icon,
        isActive: catForm.isActive,
      };

      if (editingCat) {
        const backendId = parseInt(editingCat.id.replace('cat-', ''));
        await categoryApi.update(backendId, payload);
        addToast(`Category \"${catForm.name}\" updated`, 'success');
      } else {
        await categoryApi.create(payload);
        addToast(`Category \"${catForm.name}\" created`, 'success');
      }
      setShowCatForm(false);
      resetCatForm();
      // Invalidate cache so it refetches
      cachedCatFetched = 0;
      cachedMenuFetched = 0;
      loadCategories();
      loadMenu();
    } catch (e) {
      console.error('Failed to save category:', e);
      addToast(e?.message || 'Failed to save category', 'error');
    } finally {
      setCatSubmitting(false);
    }
  };

  const handleCatToggleActive = async (cat) => {
    const newStatus = !cat.isActive;
    const backendId = parseInt(cat.id.replace('cat-', ''));
    try {
      await categoryApi.update(backendId, { isActive: newStatus });
      addToast(newStatus ? `\"${cat.name}\" enabled` : `\"${cat.name}\" disabled`, 'info');
      cachedCatFetched = 0;
      loadCategories();
    } catch (e) {
      addToast(e?.message || 'Failed to update category status', 'error');
    }
  };

  const handleCatDelete = async () => {
    if (!deleteTarget) return;
    
    const itemsInCategory = menuItems.filter(m => m.category === deleteTarget.name);
    if (itemsInCategory.length > 0) {
      addToast(`Cannot delete \"${deleteTarget.name}\": ${itemsInCategory.length} menu item(s) belong to this category. Move or delete those items first.`, 'error');
      setDeleteTarget(null);
      return;
    }

    const backendId = parseInt(deleteTarget.id.replace('cat-', ''));
    try {
      await categoryApi.delete(backendId);
      addToast(`Category \"${deleteTarget.name}\" deleted`, 'info');
      setDeleteTarget(null);
      cachedCatFetched = 0;
      loadCategories();
    } catch (e) {
      addToast(e?.message || 'Failed to delete category', 'error');
      setDeleteTarget(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Re-entrancy guard: a rapid double-click / Enter+click must never fire two requests.
    if (submittingRef.current) return;
    if (isUploadingImage) {
      addToast('Please wait for the image upload to finish', 'error');
      return;
    }
    if (!itemName || !itemName.trim()) {
      addToast(isDietaryBusiness ? 'Please enter a dish name' : 'Please enter a product name', 'error');
      return;
    }
    if (itemPrice === '' || itemPrice == null || toNumber(itemPrice) <= 0) {
      addToast('Please enter a price greater than 0', 'error');
      return;
    }
    const matchedCategory = categories.find(c => c.name === itemCategory);
    if (!itemCategory || !matchedCategory) {
      addToast('Please select a valid category', 'error');
      return;
    }
    const categoryId = parseInt(matchedCategory.id.replace('cat-', ''));
    if (!Number.isFinite(categoryId)) {
      addToast('Please select a valid category', 'error');
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      // Part 16: a VEG_ONLY restaurant can only ever submit VEG items.
      const effectiveVeg = restaurantVegOnly ? true : itemVeg;
      // §2: the submitted payload must also be capability-aware — dietary and
      // prep fields are omitted entirely for non-food tenants (not just hidden).
      const payload = {
        name: itemName.trim(),
        price: toNumber(itemPrice),
        description: itemDesc,
        image: itemImage,
        imagePublicId: itemImagePublicId,
        isAvailable: itemLive,
        ...(isDietaryBusiness ? {
          isVeg: effectiveVeg,
          dietaryType: effectiveVeg ? 'VEG' : 'NON_VEG',
        } : {}),
        subcategoryId: itemSubcategoryId ? parseInt(itemSubcategoryId) : null,
        sku: itemSku.trim() || `SKU-${Date.now()}`,
        ...(showBarcodeField ? { barcode: itemBarcode } : {}),
        ...(isKitchenBusiness ? { preparationTime: toNumber(itemPrepTime), kitchenCategory: itemKitchenCategory } : {}),
        ...(isStockBusiness ? { currentStock: toNumber(itemStockQty) } : {}),
        gstPercentage: toNumber(itemTax),
        categoryId,
      };

      if (editingId) {
        const backendId = parseInt(editingId.replace('menu-', ''));
        await menuApi.update(backendId, payload);
        addToast(`"${itemName.trim()}" updated successfully`, 'success');
      } else {
        await menuApi.create(payload);
        addToast(`"${itemName.trim()}" added successfully`, 'success');
      }
      cachedMenuFetched = 0;
      loadMenu();
      setShowModal(false);
      resetForm();
    } catch (err) {
      // Keep the dialog open with the entered values intact; surface the real error.
      console.error('Failed to save menu item:', err);
      addToast(err?.message || 'Failed to save menu item', 'error');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setItemName('');
    setItemPrice(150);
    setItemCategory(categories[0]?.name || '');
    setItemDesc('');
    setItemImage('');
    setItemImagePublicId('');
    setImagePreview('');
    setImageUploadedRef(null);
    setLegacyImageWarning(false);
    setItemStock('Available');
    setItemLive(true);
    setItemVeg(true);
    setItemSubcategoryId('');
    setItemSku('');
    setItemBarcode('');
    setItemPrepTime(10);
    setItemStockQty(50);
    setItemTax(settings.gstPercentage || 5);
    setItemKitchenCategory('Main Course');
  };

  const handleDeleteConfirm = async () => {
    if (!deleteItemTarget || deletingItem) return; // guard against duplicate requests
    setDeletingItem(true);
    try {
      await menuApi.delete(parseInt(deleteItemTarget.id.replace('menu-', '')));
      addToast(`"${deleteItemTarget.name}" deleted`, 'success');
      cachedMenuFetched = 0;
      loadMenu();
      setDeleteItemTarget(null);
    } catch (e) {
      addToast(e?.response?.data?.message || e?.message || 'Failed to delete item', 'error');
      setDeleteItemTarget(null);
    } finally {
      setDeletingItem(false);
    }
  };

  const handleToggleLive = async (item, value) => {
    const backendId = parseInt(item.id.replace('menu-', ''));
    try {
      await menuApi.update(backendId, { isAvailable: value });
      cachedMenuFetched = 0;
      loadMenu();
    } catch (e) {
      console.error(e);
    }
  };

  // ── Image upload: uploads to the app's own storage and keeps only the
  // returned reference (imageUrl + imagePublicId). No external URL input exists. ──
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      addToast('Only JPG, PNG, and WEBP formats are supported.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      addToast('Image size must be less than 5MB.', 'error');
      return;
    }

    // Show the selected file immediately (local object URL) while it uploads.
    // No base64, no URL input — the real File is uploaded via FormData below.
    if (localPreviewUrlRef.current) URL.revokeObjectURL(localPreviewUrlRef.current);
    const localPreviewUrl = URL.createObjectURL(file);
    localPreviewUrlRef.current = localPreviewUrl;
    const previousPreview = imagePreview;
    setImagePreview(localPreviewUrl);

    setIsUploadingImage(true);
    try {
      // Delete a previously uploaded-but-unsaved image immediately (no orphans)
      const previousUnbound = imageUploadedRef;
      const formData = new FormData();
      formData.append('image', file);
      const resp = await menuApi.uploadImage(formData);
      const imageUrl = resp?.data?.imageUrl;
      const imagePublicId = resp?.data?.imagePublicId;
      if (!imageUrl) throw new Error(resp?.message || 'Image upload failed');
      if (previousUnbound && previousUnbound !== imagePublicId) {
        try { await menuApi.deleteImage(previousUnbound); } catch (_) { /* best effort */ }
      }
      setImageUploadedRef(imagePublicId);
      setLegacyImageWarning(false);
      setImagePreview(imageUrl);
      setItemImage(imageUrl);
      setItemImagePublicId(imagePublicId);
      addToast('Image uploaded', 'success');
    } catch (err) {
      // Upload failed — restore the previous preview (never show a broken image)
      setImagePreview(previousPreview);
      addToast(err?.message || 'Image upload failed', 'error');
    } finally {
      setIsUploadingImage(false);
      if (localPreviewUrlRef.current) {
        URL.revokeObjectURL(localPreviewUrlRef.current);
        localPreviewUrlRef.current = null;
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  // Remove image: an unbound upload is deleted immediately; a saved image is
  // cleared here and removed from storage when the item is saved (image → null).
  const handleRemoveImage = async () => {
    const isUnbound = imageUploadedRef && imageUploadedRef === itemImagePublicId && !!itemImagePublicId;
    if (isUnbound) {
      try { await menuApi.deleteImage(itemImagePublicId); } catch (_) { /* best effort */ }
    }
    setImageUploadedRef(null);
    setImagePreview('');
    setLegacyImageWarning(false);
    setItemImage('');
    setItemImagePublicId('');
    if (localPreviewUrlRef.current) {
      URL.revokeObjectURL(localPreviewUrlRef.current);
      localPreviewUrlRef.current = null;
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  // Single shared hierarchy filter (Part 1 req. 8/15): category → subcategory →
  // search → dietary, one implementation for every menu surface.
  const filteredItems = filterMenuItems(menuItems, {
    selectedCategory,
    selectedSubcategory,
    searchQuery,
    dietaryFilter: filterDietary,
  });

  // Tabs for the currently selected category (derived, not fetched per click).
  const subcategoryTabs = selectedCategory === 'All'
    ? []
    : subcategoryTabsFor(menuItems, subcategories, selectedCategory);

  const lowStockItems = menuItems.filter(item => item.stockStatus === 'Low Stock' || item.stockQty < 10);

  return (
    <div className="space-y-4 animate-fade-in max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h3 className="text-lg font-extrabold text-[#191c1e]">Menu & Inventory Manager</h3>
          <p className="text-[11px] text-slate-500 font-medium">Add new dishes, manage pricing, sort categories, and check stock.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {lowStockItems.length > 0 && (
            <span className="h-8.5 px-3 bg-red-50 border border-red-200 text-red-700 font-bold rounded-xl text-[10px] flex items-center gap-1">
              <Package className="w-3.5 h-3.5" /> {lowStockItems.length} Low Stock
            </span>
          )}
          <button onClick={() => { cachedMenuFetched = 0; loadMenu(); }} className="p-2 hover:bg-slate-100 rounded-lg cursor-pointer">
            <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => { resetForm(); if (selectedCategory !== 'All') setItemCategory(selectedCategory); setShowModal(true); }}
            className="h-8.5 px-3 bg-[#16A34A] hover:bg-[#15803D] text-white font-bold rounded-xl text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-xs transition-all cursor-pointer">
            <Plus className="w-4 h-4" /> Add Item
          </button>
        </div>
      </div>

      {/* Category Management Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[9px] font-bold text-slate-400 uppercase">Categories:</span>
        <button onClick={handleOpenAddCat}
          className="h-8 px-3 bg-white hover:bg-slate-50 border border-[#16A34A]/40 text-[#16A34A] font-bold rounded-xl text-[10px] uppercase tracking-wider flex items-center gap-1.5 shadow-xs transition-all cursor-pointer">
          <Plus className="w-3.5 h-3.5" /> Add Category
        </button>
        <button onClick={handleOpenUpdateCat}
          className="h-8 px-3 bg-white hover:bg-slate-50 border border-blue-500/40 text-blue-600 font-bold rounded-xl text-[10px] uppercase tracking-wider flex items-center gap-1.5 shadow-xs transition-all cursor-pointer">
          <Edit className="w-3.5 h-3.5" /> Update Category
        </button>
        <button onClick={() => { setSubCatForm({ name: '', description: '', sortOrder: 0 }); setEditingSubCat(null); setShowSubCatModal(true); }}
          className="h-8 px-3 bg-white hover:bg-slate-50 border border-violet-500/40 text-violet-600 font-bold rounded-xl text-[10px] uppercase tracking-wider flex items-center gap-1.5 shadow-xs transition-all cursor-pointer">
          <Plus className="w-3.5 h-3.5" /> Manage Subcategories
        </button>
      </div>

      {/* LEVEL 1 — Category tabs: horizontal scroll row, never wrapped (Part 1 req. 2/13) */}
      <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-[10px] font-bold overflow-x-auto no-scrollbar">
        <button onClick={() => { setSelectedCategory('All'); setSelectedSubcategory(SUBCATEGORY_ALL); }}
          className={`shrink-0 px-3 py-1.5 rounded-lg transition-all whitespace-nowrap cursor-pointer ${selectedCategory === 'All' ? 'bg-[#16A34A] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}>🍽️ All ({menuItems.length})</button>
        {categories.filter(c => c.isActive !== false).map(cat => (
          <button key={cat.id} onClick={() => { setSelectedCategory(cat.name); setSelectedSubcategory(SUBCATEGORY_ALL); }}
            style={{
              backgroundColor: selectedCategory === cat.name ? (cat.color || '#16A34A') : undefined,
              borderColor: selectedCategory === cat.name ? (cat.color || '#16A34A') : undefined,
              color: selectedCategory === cat.name ? '#fff' : undefined
            }}
            className={`shrink-0 px-3 py-1.5 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
              selectedCategory === cat.name 
                ? 'text-white shadow-xs border' 
                : 'text-slate-600 hover:text-slate-900 border border-transparent'
            }`}>
            {ICON_MAP[cat.icon || 'utensils'] || '🍽️'} {cat.name} ({menuItems.filter(m => m.category === cat.name).length})
          </button>
        ))}
      </div>

      {/* LEVEL 2 — Subcategory tab row, directly under the Category row (Part 1:
          Category → Subcategory → Search/filter → Items; no dropdown anywhere).
          Horizontal scroll row; renders whenever the category has subcategories
          or items without one. */}
      {selectedCategory !== 'All' && subcategoryTabs.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <span className="text-[9px] font-bold text-slate-400 uppercase shrink-0">{selectedCategory} ›</span>
          <button onClick={() => setSelectedSubcategory(SUBCATEGORY_ALL)}
            className={`shrink-0 h-8 px-3 rounded-xl text-[10px] font-bold transition-all cursor-pointer border whitespace-nowrap ${
              selectedSubcategory === SUBCATEGORY_ALL
                ? 'bg-[#16A34A] text-white border-[#16A34A] shadow-xs'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}>
            All ({menuItems.filter(m => m.category === selectedCategory).length})
          </button>
          {subcategoryTabs.map(tab => (
            <button key={tab.id} onClick={() => setSelectedSubcategory(tab.id)}
              className={`shrink-0 h-8 px-3 rounded-xl text-[10px] font-bold transition-all cursor-pointer border whitespace-nowrap ${
                selectedSubcategory === tab.id
                  ? 'bg-[#16A34A] text-white border-[#16A34A] shadow-xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}>
              {tab.name} ({tab.count})
            </button>
          ))}
        </div>
      )}

      {/* LEVEL 3 — Search & dietary filter (below both tab rows, Part 1 req. 12).
          Dietary dropdown only for food businesses (§9). */}
      <div className="flex flex-wrap items-center gap-2 w-full">
        {isDietaryBusiness && (
        <select value={filterDietary} onChange={(e) => setFilterDietary(e.target.value)}
          className="h-10 px-2 bg-white border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:border-[#16A34A] cursor-pointer shrink-0">
          <option value="All">Veg + Non-Veg</option>
          <option value="VEG">Veg Only</option>
          <option value="NON_VEG">Non-Veg Only</option>
        </select>
        )}
        <div className="relative w-full sm:w-[300px] sm:min-w-[260px] sm:flex-shrink-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input type="text" placeholder="Search menu items..." value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-10 pr-10 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/10 transition-all" />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              title="Clear search">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Menu Grid */}
      <div className="bg-white p-5 rounded-[20px] border border-slate-200 shadow-xs">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 text-xs">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading menu items...
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
            {filteredItems.map((item) => {
              const isLowStock = item.stockQty < 10;
              return (
              <div key={item.id} className={`border rounded-2xl p-3.5 bg-white flex flex-col justify-between gap-3 hover:shadow-md transition-all ${
                isLowStock ? 'border-red-300 ring-1 ring-red-100' : 'border-slate-200 hover:border-[#16A34A]'
              } ${!item.isLive ? 'opacity-65 grayscale' : ''}`}>
                {/* Image */}
                <div className="relative h-24 rounded-lg overflow-hidden border border-slate-200">
                  <img src={item.image} alt={item.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" decoding="async"
                    onError={(e) => { e.target.src = PLACEHOLDER_IMAGE; }} />
                  {isDietaryBusiness && (
                  <span className={`absolute top-1.5 left-1.5 w-4 h-4 rounded-sm border-2 flex items-center justify-center ${
                    item.isVeg ? 'border-emerald-600 bg-emerald-50' : 'border-red-600 bg-red-50'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${item.isVeg ? 'bg-emerald-600' : 'bg-red-600'}`} />
                  </span>
                  )}
                  <span className="absolute top-1.5 right-1.5 bg-slate-900/80 text-white font-mono text-[9px] font-bold px-1.5 py-0.5 rounded">{currency}{item.price}</span>
                  <span className={`absolute bottom-1.5 right-1.5 text-[8px] font-bold px-1.5 py-0.5 rounded shadow ${
                    item.stockStatus === 'Available' ? 'bg-emerald-500 text-white' :
                    item.stockStatus === 'Low Stock' ? 'bg-red-500 text-white animate-pulse' : 'bg-red-600 text-white'
                  }`}>{item.stockStatus}</span>
                </div>

                {/* Details */}
                <div className="space-y-0.5 flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-1">
                    <p className="text-xs font-extrabold text-slate-800 truncate flex items-center gap-1">
                      {item.name}
                      {isDietaryBusiness && (item.isVeg ? (
                        <Leaf className="w-3 h-3 text-emerald-600 shrink-0" />
                      ) : (
                        <Beef className="w-3 h-3 text-red-600 shrink-0" />
                      ))}
                    </p>
                    <span className="text-[9px] font-bold text-[#16A34A] uppercase font-mono shrink-0">{item.category}{item.subcategoryName ? ` › ${item.subcategoryName}` : ''}</span>
                  </div>
                  <p className="text-[9px] text-slate-400 font-medium mt-1">
                    SKU: {item.sku} {isKitchenBusiness && item.prepTime && `· Prep: ${item.prepTime}m`}
                  </p>
                  {/* §8-§10: the REAL tenant-DB barcode (MenuItem.barcode).
                      Absence stays an absence — no SKU fallback, no placeholder. */}
                  <p className="text-[9px] text-slate-400 font-medium font-mono truncate">
                    Barcode: {item.barcode || '—'}
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium leading-relaxed truncate mt-0.5">{item.description || 'No description.'}</p>
                </div>

                {/* Actions */}
                <div className="flex justify-between items-center pt-2 border-t border-slate-100 mt-auto">
                  <div className="flex items-center gap-1.5">
                    {/* Green status toggle (replaces the old Live/Toggle indicator) */}
                    <button onClick={() => handleToggleLive(item, !item.isLive)}
                      className={`relative w-7 h-4 rounded-full transition-all cursor-pointer ${item.isLive ? 'bg-[#16A34A]' : 'bg-slate-300'}`}
                      title={item.isLive ? 'Item is Live — click to disable' : 'Item is Off — click to make live'}>
                      <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${item.isLive ? 'left-3.5' : 'left-0.5'}`} />
                    </button>
                    <span className={`text-[9px] font-bold ${item.isLive ? 'text-[#16A34A]' : 'text-slate-400'}`}>
                      {item.isLive ? 'Live' : 'Off'}
                    </span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      isLowStock ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'
                    }`}>{item.stockQty} in stock</span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => {
                      setEditingId(item.id); setItemName(item.name); setItemPrice(item.price);
                      setItemCategory(item.category); setItemDesc(item.description);
                      // Never send the UI placeholder back to the backend: a no-image
                      // item must submit an empty image reference (the backend rejects
                      // the data-URI placeholder with a 400, which silently broke updates).
                      setItemImage(item.image === PLACEHOLDER_IMAGE ? '' : item.image);
                      setImagePreview(item.image === PLACEHOLDER_IMAGE ? '' : item.image);
                      setItemImagePublicId(item.imagePublicId || '');
                      setImageUploadedRef(null);
                      setLegacyImageWarning(item.imageIsExternal === true);
                      setItemStock(item.stockStatus); setItemLive(item.isLive);
                      setItemVeg(item.isVeg); setItemSku(item.sku || '');
                      setItemSubcategoryId(item.subcategoryId ? String(item.subcategoryId) : '');
                      setItemBarcode(item.barcode || ''); setItemPrepTime(item.prepTime || 10);
                      setItemStockQty(item.stockQty ?? 50); setItemTax(item.taxPercentage ?? settings.gstPercentage ?? 5);
                      setItemKitchenCategory(item.kitchenCategory || 'Main Course');
                      setShowModal(true);
                    }} className="p-1 bg-slate-200 hover:bg-slate-300 rounded text-slate-600 cursor-pointer" title="Edit Item">
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleteItemTarget(item)} className="p-1 bg-red-50 hover:bg-red-100 text-red-600 rounded cursor-pointer" title="Delete Item">
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
            })}
            {filteredItems.length === 0 && !loading && (
              <div className="col-span-full py-16 text-center text-slate-400 text-xs italic">No items match filter criteria.</div>
            )}
          </div>
        )}
      </div>

      {/* ── MANAGE SUBCATEGORIES MODAL (Part 15) ── */}
      {showSubCatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs" onClick={() => setShowSubCatModal(false)}>
          <div className="bg-white w-full max-w-md rounded-xl shadow-xl border border-slate-100 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center rounded-t-xl shrink-0">
              <h4 className="font-extrabold text-xs uppercase tracking-wider text-slate-800">Manage Subcategories</h4>
              <button onClick={() => setShowSubCatModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              {/* Category selector */}
              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase text-slate-400">Category *</label>
                <select value={subCatCategory} onChange={(e) => { setSubCatCategory(e.target.value); setEditingSubCat(null); setSubCatForm({ name: '', description: '', sortOrder: 0 }); }}
                  className="w-full h-9 px-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#16A34A]">
                  <option value="">Select a category…</option>
                  {categories.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
              </div>

              {subCatCategory && (
                <>
                  {/* Add / edit form */}
                  <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold uppercase text-slate-400">{editingSubCat ? 'Edit Subcategory' : 'Add Subcategory'}</label>
                      <input type="text" placeholder="e.g. Classic Pizza" value={subCatForm.name}
                        onChange={(e) => setSubCatForm({ ...subCatForm, name: e.target.value })}
                        className="w-full h-9 px-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#16A34A]" />
                    </div>
                    <button onClick={handleSubCatSubmit} disabled={subCatSaving || !subCatForm.name.trim()}
                      className="h-9 px-3 bg-[#16A34A] hover:bg-[#15803D] text-white font-bold rounded-lg text-[10px] uppercase tracking-wider cursor-pointer disabled:opacity-50">
                      {editingSubCat ? 'Save' : 'Add'}
                    </button>
                  </div>

                  {/* List for this category */}
                  <div className="space-y-1.5">
                    {subcategories.filter(s => String(s.categoryId) === String(subCatCategory)).map(s => (
                      <div key={s.id} className="flex items-center gap-2 p-2.5 border border-slate-200 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-bold truncate ${s.isActive ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{s.name}</p>
                          <p className="text-[9px] text-slate-400">
                            {menuItems.filter(m => m.subcategoryId === s.id).length} items · {s.isActive ? 'Active' : 'Inactive'}
                          </p>
                        </div>
                        <button onClick={() => handleSubCatToggle(s)}
                          className={`text-[9px] font-bold px-2 py-1 rounded-md cursor-pointer ${s.isActive ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                          {s.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => { setEditingSubCat(s); setSubCatForm({ name: s.name, description: '', sortOrder: s.sortOrder || 0 }); }}
                          className="p-1.5 bg-slate-100 hover:bg-blue-100 rounded text-slate-500 cursor-pointer" title="Edit"><Edit className="w-3 h-3" /></button>
                        <button onClick={() => handleSubCatDelete(s)}
                          className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded cursor-pointer" title="Delete"><Trash className="w-3 h-3" /></button>
                      </div>
                    ))}
                    {subcategories.filter(s => String(s.categoryId) === String(subCatCategory)).length === 0 && (
                      <p className="text-[10px] text-slate-400 italic text-center py-2">No subcategories yet for this category.</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── UPDATE CATEGORY — SELECT CATEGORY MODAL ── */}
      {showUpdateCatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-sm rounded-xl shadow-xl border border-slate-100 max-h-[80vh] flex flex-col">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center shrink-0">
              <h4 className="font-extrabold text-xs uppercase tracking-wider text-slate-800">Update Category</h4>
              <button onClick={() => setShowUpdateCatModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input type="text" placeholder="Search category..." value={catSearchQuery}
                  onChange={(e) => setCatSearchQuery(e.target.value)}
                  className="w-full h-10 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-[#16A34A] transition-all" autoFocus />
              </div>
              <div className="space-y-1">
                {categories.filter(c =>
                  c.name.toLowerCase().includes(catSearchQuery.toLowerCase())
                ).map(cat => (
                  <button key={cat.id} onClick={() => handleSelectCatToUpdate(cat)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all cursor-pointer text-left">
                    <span className="w-5 h-5 rounded-full border-2 border-slate-300 flex items-center justify-center shrink-0">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color || '#16A34A' }} />
                    </span>
                    <span className="flex-1 text-xs font-bold text-slate-700">
                      {ICON_MAP[cat.icon || 'utensils'] || '🍽️'} {cat.name}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400">
                      {menuItems.filter(m => m.category === cat.name).length} items
                    </span>
                  </button>
                ))}
                {categories.filter(c =>
                  c.name.toLowerCase().includes(catSearchQuery.toLowerCase())
                ).length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4 italic">No categories found.</p>
                )}
              </div>
            </div>
            <div className="px-4 pb-4 pt-2 border-t border-slate-100 shrink-0">
              <button onClick={() => setShowUpdateCatModal(false)}
                className="w-full h-9 bg-white hover:bg-slate-50 border border-slate-200 text-slate-500 font-bold rounded-lg uppercase tracking-wider text-xs cursor-pointer transition-all">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── CATEGORY FORM MODAL ── */}
      {showCatForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-xl shadow-xl border border-slate-100">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h4 className="font-extrabold text-xs uppercase tracking-wider text-slate-800">
                {editingCat ? 'Edit Category' : 'Add Category'}
              </h4>
              <button onClick={() => { setShowCatForm(false); resetCatForm(); }} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCatSubmit} className="p-4 space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase text-slate-400">Category Name *</label>
                <input type="text" value={catForm.name} onChange={(e) => setCatForm({...catForm, name: e.target.value})}
                  placeholder="e.g., Starters, Main Course, Desserts"
                  className="w-full h-8.5 px-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#16A34A]" required autoFocus />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase text-slate-400">Color</label>
                  <div className="flex flex-wrap gap-1">
                    {CATEGORY_COLORS.map(color => (
                      <button key={color} type="button"
                        onClick={() => setCatForm({...catForm, color})}
                        className={`w-6 h-6 rounded-lg border-2 transition-all cursor-pointer ${catForm.color === color ? 'border-slate-800 scale-110 shadow-sm' : 'border-transparent'}`}
                        style={{ backgroundColor: color }} />
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase text-slate-400">Icon</label>
                  <div className="flex flex-wrap gap-1">
                    {CATEGORY_ICONS.map(icon => (
                      <button key={icon} type="button"
                        onClick={() => setCatForm({...catForm, icon})}
                        className={`w-7 h-7 rounded-lg border text-sm flex items-center justify-center transition-all cursor-pointer ${catForm.icon === icon ? 'border-slate-800 bg-slate-100 scale-110 shadow-sm' : 'border-slate-200 hover:bg-slate-50'}`}
                        title={icon}>{ICON_MAP[icon] || '🍽️'}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase text-slate-400">Display Order</label>
                  <input type="number" inputMode="numeric" value={catForm.sortOrder} onChange={(e) => setCatForm({...catForm, sortOrder: sanitizeNumeric(e.target.value)})}
                    className="no-spinner w-full h-8.5 px-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#16A34A]" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase text-slate-400">Status</label>
                  <label className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer h-8.5">
                    <input type="checkbox" checked={catForm.isActive} onChange={(e) => setCatForm({...catForm, isActive: e.target.checked})}
                      className="w-4 h-4 text-[#16A34A] border-slate-300 rounded focus:ring-0" />
                    <span className="text-xs font-semibold text-slate-600">{catForm.isActive ? 'Active' : 'Inactive'}</span>
                  </label>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase text-slate-400">Image URL (Optional)</label>
                <div className="flex gap-2">
                  <input type="text" value={catForm.image} onChange={(e) => setCatForm({...catForm, image: e.target.value})}
                    placeholder="https://example.com/category-image.jpg"
                    className="flex-1 h-8.5 px-2 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[10px] outline-none focus:border-[#16A34A]" />
                  {catForm.image && (
                    <div className="relative w-8.5 h-8.5 shrink-0">
                      <img src={catForm.image} alt="" className="w-8.5 h-8.5 object-cover rounded-lg border border-slate-200"
                        onError={(e) => { e.target.style.display = 'none'; }} />
                    </div>
                  )}
                </div>
              </div>

              {editingCat && (
                <button type="button" onClick={() => { setShowCatForm(false); resetCatForm(); setDeleteTarget(editingCat); }}
                  className="w-full h-9 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 font-bold rounded-lg uppercase tracking-wider text-xs cursor-pointer transition-all flex items-center justify-center gap-1.5">
                  <Trash className="w-3.5 h-3.5" /> Delete Category
                </button>
              )}
              <div className="flex gap-2 pt-2 border-t border-slate-150">
                <button type="button" onClick={() => { setShowCatForm(false); resetCatForm(); }}
                  className="flex-1 h-9 bg-white hover:bg-slate-50 border border-slate-200 text-slate-500 font-bold rounded-lg uppercase tracking-wider text-xs cursor-pointer transition-all">Cancel</button>
                <button type="submit" disabled={catSubmitting}
                  className="flex-[2] h-9 bg-[#16A34A] hover:bg-[#15803D] text-white font-bold rounded-lg uppercase tracking-wider text-xs transition-all cursor-pointer disabled:opacity-50">
                  {catSubmitting ? 'Saving...' : (editingCat ? 'Update Category' : 'Add Category')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── DELETE MENU ITEM CONFIRMATION ── */}
      <ConfirmationDialog
        isOpen={!!deleteItemTarget}
        onClose={() => { if (!deletingItem) setDeleteItemTarget(null); }}
        onConfirm={handleDeleteConfirm}
        title="Delete Menu Item?"
        message={`Are you sure you want to delete "${deleteItemTarget?.name || 'this item'}"? This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deletingItem}
      />

      {/* ── DELETE CATEGORY CONFIRMATION ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-sm rounded-xl shadow-xl border border-slate-100">
            <div className="p-5 text-center">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mb-3">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <h4 className="font-extrabold text-sm text-slate-800">Delete Category?</h4>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                {menuItems.filter(m => m.category === deleteTarget.name).length > 0 
                  ? `\"${deleteTarget.name}\" has ${menuItems.filter(m => m.category === deleteTarget.name).length} menu item(s). Move or delete those items before deleting this category.`
                  : `Are you sure you want to delete \"${deleteTarget.name}\"? This action cannot be undone.`
                }
              </p>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 h-9 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 font-bold rounded-lg text-xs uppercase tracking-wider cursor-pointer transition-colors">Cancel</button>
              {menuItems.filter(m => m.category === deleteTarget.name).length === 0 && (
                <button onClick={handleCatDelete}
                  className="flex-1 h-9 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-xs uppercase tracking-wider cursor-pointer transition-colors">Delete</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Item Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-xl shadow-xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center sticky top-0 z-10">
              <h4 className="font-extrabold text-xs uppercase tracking-wider text-slate-800">{editingId ? `Edit ${naming.itemLabel.replace(/s$/, '')}` : `Add ${naming.itemLabel.replace(/s$/, '')}`}</h4>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-3.5 text-xs">
              {/* Basic Info */}
              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase text-slate-400">{isDietaryBusiness ? 'Dish Name' : 'Product Name'} *</label>
                <input type="text" value={itemName} onChange={(e) => setItemName(e.target.value)}
                  className="w-full h-8 px-2 bg-slate-50 border rounded-lg outline-none focus:border-[#16A34A]" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase text-slate-400">Price ({currency}) *</label>
                  {/* no-spinner: direct numeric entry only — no increment/decrement arrows */}
                  <input type="number" step="0.01" inputMode="decimal" value={itemPrice} onChange={(e) => setItemPrice(sanitizeNumeric(e.target.value))}
                    className="no-spinner w-full h-8 px-2 bg-slate-50 border rounded-lg outline-none" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase text-slate-400">Category *</label>
                  <select value={itemCategory} onChange={(e) => { setItemCategory(e.target.value); setItemSubcategoryId(''); }}
                    className="w-full h-8 px-1 bg-slate-50 border rounded-lg outline-none">
                    {categories.map(c => (<option key={c.id} value={c.name}>{c.name}</option>))}
                  </select>
                </div>
              </div>

              {/* Subcategory (Part 16) — depends on the selected category */}
              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase text-slate-400">Subcategory</label>
                <select value={itemSubcategoryId} onChange={(e) => setItemSubcategoryId(e.target.value)}
                  className="w-full h-8 px-1 bg-slate-50 border rounded-lg outline-none">
                  <option value="">None</option>
                  {subcategories.filter(s => s.isActive && s.categoryName === itemCategory).map(s => (
                    <option key={s.id} value={String(s.id)}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase text-slate-400">Description</label>
                <input type="text" value={itemDesc} onChange={(e) => setItemDesc(e.target.value)}
                  className="w-full h-8 px-2 bg-slate-50 border rounded-lg outline-none" />
              </div>

              {/* SKU & Barcode (§2) — barcode input only for barcode-capable businesses */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase text-slate-400">SKU</label>
                  <input type="text" value={itemSku} onChange={(e) => setItemSku(e.target.value)}
                    placeholder="Auto-generated" className="w-full h-8 px-2 bg-slate-50 border rounded-lg outline-none font-mono text-[10px]" />
                </div>
                {showBarcodeField && (
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase text-slate-400">Barcode (Optional)</label>
                  <input type="text" value={itemBarcode} onChange={(e) => setItemBarcode(e.target.value)}
                    placeholder="e.g. 8901234567890" className="w-full h-8 px-2 bg-slate-50 border rounded-lg outline-none font-mono text-[10px]" />
                  <p className="text-[8px] text-slate-400">Scannable in POS when the plan includes the Barcode Scanner.</p>
                </div>
                )}
              </div>

              {/* Veg/Non-Veg Type — dietary businesses only (§2). Retail has no
                  dietary concept, so the whole selector disappears. */}
              {isDietaryBusiness && (<div className="space-y-1">
                <label className="text-[9px] font-bold uppercase text-slate-400">Type</label>
                {restaurantVegOnly && (
                  <p className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1">
                    This restaurant is configured for Veg Only — all items are vegetarian.
                  </p>
                )}
                <div className="flex gap-2 h-8">
                  <button type="button" onClick={() => setItemVeg(true)}
                    className={`flex-1 rounded-lg border text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer ${
                      itemVeg ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}>
                    <Leaf className="w-3 h-3" /> Veg
                  </button>
                  {!restaurantVegOnly && (
                    <button type="button" onClick={() => setItemVeg(false)}
                      className={`flex-1 rounded-lg border text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer ${
                        !itemVeg ? 'bg-red-50 border-red-400 text-red-700' : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}>
                      <Beef className="w-3 h-3" /> Non-Veg
                    </button>
                  )}
                </div>
              </div>) }

              {/* Prep Time (kitchen businesses only) & Stock (§2) */}
              <div className="grid grid-cols-2 gap-3">
                {isKitchenBusiness && (
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase text-slate-400">Prep Time (min)</label>
                  <input type="number" inputMode="numeric" value={itemPrepTime} onChange={(e) => setItemPrepTime(sanitizeNumeric(e.target.value))}
                    className="no-spinner w-full h-8 px-2 bg-slate-50 border rounded-lg outline-none" />
                </div>
                )}
                {isStockBusiness && (
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase text-slate-400">Stock Quantity</label>
                  <input type="number" inputMode="numeric" value={itemStockQty} onChange={(e) => setItemStockQty(sanitizeNumeric(e.target.value))}
                    className="no-spinner w-full h-8 px-2 bg-slate-50 border rounded-lg outline-none" />
                </div>
                )}
              </div>

              {/* Tax & GST */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase text-slate-400">Tax %</label>
                  <input type="number" step="0.1" inputMode="decimal" value={itemTax} onChange={(e) => setItemTax(sanitizeNumeric(e.target.value))}
                    className="no-spinner w-full h-8 px-2 bg-slate-50 border rounded-lg outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase text-slate-400">Status</label>
                  <select value={itemLive ? 'true' : 'false'} onChange={(e) => setItemLive(e.target.value === 'true')}
                    className="w-full h-8 px-1 bg-slate-50 border rounded-lg outline-none">
                    <option value="true">Live (Active on POS)</option>
                    <option value="false">Disabled (Hidden)</option>
                  </select>
                </div>
              </div>

              {/* Item Image — upload only (no external URL input) */}
              <div className="space-y-2">
                <label className="text-[9px] font-bold uppercase text-slate-400">Item Image</label>

                {legacyImageWarning && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[9px] text-amber-700 leading-relaxed">
                      This item's image is hosted on a third-party website and may stop working.
                      Upload your own image to replace it.
                    </p>
                  </div>
                )}

                {imagePreview ? (
                  <div className="border-2 border-dashed border-[#16A34A] bg-[#16A34A]/5 rounded-lg p-3 flex items-center gap-3">
                    <img src={imagePreview} alt="Preview" className="w-16 h-16 object-cover rounded-lg border border-slate-200 bg-white" />
                    <div className="flex-1 space-y-1.5 min-w-0">
                      <p className="text-[9px] text-slate-400">
                        {isUploadingImage
                          ? <span className="flex items-center gap-1.5 font-bold text-slate-500"><RefreshCw className="w-3 h-3 animate-spin" /> Uploading…</span>
                          : 'Stored in app storage ✓'}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" disabled={isUploadingImage}
                          onClick={() => fileInputRef.current?.click()}
                          className="h-9 px-3 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-lg text-[10px] font-bold transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1">
                          <Camera className="w-3 h-3" /> Replace
                        </button>
                        <button type="button" disabled={isUploadingImage}
                          onClick={handleRemoveImage}
                          className="h-9 px-3 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-lg text-[10px] font-bold transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1">
                          <Trash className="w-3 h-3" /> Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center space-y-2">
                    <p className="text-[10px] font-bold text-slate-500">Add an image (optional)</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      <button type="button" disabled={isUploadingImage}
                        onClick={() => fileInputRef.current?.click()}
                        className="h-10 px-3.5 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-lg text-[10px] font-bold transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1">
                        <Upload className="w-3.5 h-3.5" /> {isUploadingImage ? 'Uploading…' : 'Upload Image'}
                      </button>
                      <button type="button" disabled={isUploadingImage}
                        onClick={() => cameraInputRef.current?.click()}
                        className="h-10 px-3.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-lg text-[10px] font-bold transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1"
                        title="Take a photo with the device camera">
                        <Camera className="w-3.5 h-3.5" /> Take Photo
                      </button>
                    </div>
                    <p className="text-[8.5px] text-slate-400">JPG, PNG, WEBP · max 5MB</p>
                  </div>
                )}

                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageUpload} className="hidden" />
                {/* Camera capture for tablets/phones */}
                <input ref={cameraInputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={handleImageUpload} className="hidden" />

                <p className="text-[8.5px] text-slate-400 flex items-center gap-1">
                  <Info className="w-3 h-3 shrink-0" />
                  Upload only images you have permission to use.
                </p>
              </div>

              {/* Submit */}
              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowModal(false)} disabled={submitting}
                  className="flex-1 h-9 bg-white hover:bg-slate-50 border border-slate-200 text-slate-500 font-bold rounded-lg uppercase tracking-wider text-xs cursor-pointer disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={submitting || isUploadingImage}
                  className="flex-[2] h-9 bg-[#16A34A] hover:bg-[#15803D] text-white font-bold rounded-lg uppercase tracking-wider text-xs transition-all cursor-pointer disabled:opacity-50">
                  {submitting ? 'Saving...' : (editingId ? 'Update Item' : 'Save Item')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
