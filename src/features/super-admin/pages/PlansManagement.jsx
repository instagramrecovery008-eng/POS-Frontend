import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { superAdminApi } from '../../../api/superAdmin.api';
import { FEATURE_LABELS } from '../../../utils/permissions';
import ConfirmationDialog from '../../../components/ConfirmationDialog';
import { PLAN_MODES, modeBadge } from '../../../utils/businessTypes';
import {
  Package, Plus, Pencil, Trash2, Power, Loader2, RefreshCw, Copy, Search,
  Users, Monitor, Utensils, Printer, HardDrive, Building2, CreditCard,
  CheckCircle2, Check, XCircle, X, Save, Layers, ShoppingCart, Globe, Cpu, Network,
  Settings as SettingsIcon, ChevronUp, ChevronDown, ArrowUpDown, Sparkles,
} from 'lucide-react';

// Feature key → icon for display
const FEATURE_ICONS = {
  dashboard: Layers, pos: ShoppingCart, menu: Utensils, billing: CreditCard,
  tables: Layers, active_orders: Layers, kitchen: Utensils, staff: Users, customers: Users,
  reports: Cpu, floors: Layers, inventory: Package, printers: Printer,
  settings: SettingsIcon, barcode_scanner: Printer,
};

// The ONLY restaurant modules that exist in the app — mirrors
// AVAILABLE_RESTAURANT_MODULES in the backend (subscription.config.js).
// Part 11: barcode_scanner is plan-controlled (Basic OFF, Premium ON).
const AVAILABLE_RESTAURANT_MODULE_KEYS = [
  'dashboard', 'pos', 'billing', 'floors', 'tables', 'kitchen',
  'active_orders', 'menu', 'customers', 'staff', 'reports', 'settings',
  'barcode_scanner',
];

// ── Central basic-mode capability map (mirrors backend
// RESTAURANT_ONLY_MODULES in subscription.config.js — the backend strips
// these from every basic-plan payload regardless of what is sent). Both
// BASIC_POS and QUICK_BILLING share the same module rule: no floors/tables/
// kitchen (restaurant-only workflow). ──
const RESTAURANT_ONLY_MODULES = ['floors', 'tables', 'kitchen'];
const MODULE_LABELS = {
  dashboard: 'Dashboard', pos: 'POS Ordering', billing: 'Billing & Payments',
  floors: 'Floor Management', tables: 'Table Management', kitchen: 'Kitchen (KOT)',
  active_orders: 'Active Orders', menu: 'Menu & Stock', customers: 'Customers',
  staff: 'Staff', reports: 'Reports & Sales', settings: 'Settings',
  barcode_scanner: 'Barcode Scanner',
};
/** Modules selectable for the given business mode (authoritative: backend). */
const modulesForMode = (mode) =>
  mode === 'RESTAURANT'
    ? AVAILABLE_RESTAURANT_MODULE_KEYS
    : AVAILABLE_RESTAURANT_MODULE_KEYS.filter((k) => !RESTAURANT_ONLY_MODULES.includes(k));

// The THREE plan-mode definitions (stable enum values = Prisma BusinessMode;
// labels/capability lines are the only UI copy — never plan names or prices).
const MODE_CARDS = [
  {
    mode: 'RESTAURANT',
    emoji: '🍽️',
    label: 'Restaurant',
    desc: 'Full restaurant operations',
    details: 'Tables • KOT • Kitchen • Orders • Billing',
  },
  {
    mode: 'BASIC_POS',
    emoji: '🧾',
    label: 'Basic POS',
    desc: 'Quick food-business billing',
    details: 'Menu • Orders • Billing',
  },
  {
    mode: 'QUICK_BILLING',
    emoji: '🛒',
    label: 'Basic / Quick Billing',
    desc: 'Quick retail billing',
    details: 'Products • Barcode • Stock',
  },
];

const LIMIT_FIELDS = [
  { key: 'maxUsers', label: 'Max Users', icon: Users, hint: 'Leave empty for unlimited' },
  { key: 'maxTables', label: 'Max Tables', icon: Layers },
  { key: 'maxFloors', label: 'Max Floors', icon: Building2 },
  { key: 'maxMenuItems', label: 'Max Menu Items', icon: Utensils },
  { key: 'maxPrinters', label: 'Max Printers', icon: Printer },
  { key: 'maxBranches', label: 'Max Branches', icon: Network },
  { key: 'maxOrdersPerMonth', label: 'Max Orders/Month', icon: ShoppingCart },
  { key: 'storageLimitMB', label: 'Storage (MB)', icon: HardDrive },
];

const EMPTY_PLAN = {
  code: '', name: '', description: '', businessMode: 'RESTAURANT',
  monthlyPrice: 0, yearlyPrice: 0,
  billingCycle: 'YEARLY', trialDays: 0,
  maxUsers: '', maxTables: '', maxFloors: '', maxMenuItems: '', maxPrinters: '',
  maxBranches: '', maxOrdersPerMonth: '', storageLimitMB: '',
  isActive: true, isDefault: false, sortOrder: 0,
};

const PlanFormModal = ({ plan, onClose, onSaved }) => {
  const isEdit = !!plan?.id;

  // Determine included features — for new plans all modules are included by default;
  // for existing plans use the stored features list.
  const includedFeatures = useMemo(() => {
    if (isEdit && Array.isArray(plan.features) && plan.features.length > 0) {
      return plan.features;
    }
    // New plan: all available modules included by default
    return [...AVAILABLE_RESTAURANT_MODULE_KEYS];
  }, [plan, isEdit]);

  const [form, setForm] = useState(() => {
    if (!plan) return { ...EMPTY_PLAN };
    return {
      code: plan.code || '', name: plan.name || '', description: plan.description || '',
      businessMode: plan.businessMode || 'RESTAURANT',
      monthlyPrice: plan.monthlyPrice ?? 0, yearlyPrice: plan.yearlyPrice ?? 0,
      billingCycle: plan.billingCycle || 'MONTHLY', trialDays: plan.trialDays ?? 0,
      maxUsers: plan.maxUsers ?? '', maxTables: plan.maxTables ?? '', maxFloors: plan.maxFloors ?? '',
      maxMenuItems: plan.maxMenuItems ?? '', maxPrinters: plan.maxPrinters ?? '',
      maxBranches: plan.maxBranches ?? '', maxOrdersPerMonth: plan.maxOrdersPerMonth ?? '',
      storageLimitMB: plan.storageLimitMB ?? '',
      isActive: plan.isActive !== false, isDefault: !!plan.isDefault, sortOrder: plan.sortOrder ?? 0,
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Part 9: Super Admin selects WHICH modules this plan includes. The options
  // come from the canonical module registry (AVAILABLE_RESTAURANT_MODULE_KEYS,
  // mirroring the backend config + PlanModule catalog) — no hardcoded lists.
  const [selectedModules, setSelectedModules] = useState(() => new Set(includedFeatures));

  const set = (key, val) => setForm((f) => {
    const next = { ...f, [key]: val };
    // Mode switch → drop restaurant-only selections that are no longer applicable.
    if (key === 'businessMode' && val !== 'RESTAURANT') {
      setSelectedModules((prev) => {
        const filtered = new Set([...prev].filter((k) => !RESTAURANT_ONLY_MODULES.includes(k)));
        return filtered;
      });
    }
    // EDIT of an existing plan created before a mode existed: its stored
    // feature list may contain restaurant-only modules that the (new) basic
    // mode forbids — drop them so the payload never contradicts the mode.
    if (key === 'businessMode') {
      setSelectedModules((prev) => {
        const allowed = modulesForMode(val);
        return new Set([...prev].filter((k) => allowed.includes(k)));
      });
    }
    return next;
  });

  const toggleModule = (key) => {
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) { setError('Plan code and name are required'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        code: form.code, name: form.name, description: form.description || '',
        businessMode: form.businessMode,
        monthlyPrice: Number(form.monthlyPrice || 0), yearlyPrice: Number(form.yearlyPrice || 0),
        billingCycle: form.billingCycle, trialDays: Number(form.trialDays || 0),
        maxUsers: form.maxUsers === '' ? null : Number(form.maxUsers),
        maxTables: form.maxTables === '' ? null : Number(form.maxTables),
        maxFloors: form.maxFloors === '' ? null : Number(form.maxFloors),
        maxMenuItems: form.maxMenuItems === '' ? null : Number(form.maxMenuItems),
        maxPrinters: form.maxPrinters === '' ? null : Number(form.maxPrinters),
        maxBranches: form.maxBranches === '' ? null : Number(form.maxBranches),
        maxOrdersPerMonth: form.maxOrdersPerMonth === '' ? null : Number(form.maxOrdersPerMonth),
        storageLimitMB: form.storageLimitMB === '' ? null : Number(form.storageLimitMB),
        // Part 9: only the Super-Admin-selected modules are entitlements.
        // Backend syncs PlanModulePermission and Plan.features from this.
        // Capability rule: restaurant-only modules are excluded from the
        // payload for BASIC_POS plans (the backend strips them anyway —
        // this keeps the payload honest and the two layers consistent).
        modules: modulesForMode(form.businessMode).map((key) => ({ moduleKey: key, enabled: selectedModules.has(key) })),
        features: modulesForMode(form.businessMode).filter((key) => selectedModules.has(key)),
        isActive: form.isActive, isDefault: form.isDefault,
        sortOrder: Number(form.sortOrder || 0),
      };
      if (isEdit) {
        try {
          await superAdminApi.updatePlan(plan.id, payload);
        } catch (modeErr) {
          // Plan mode changed while subscriptions exist → backend demands an
          // explicit confirmation (409 PLAN_MODE_CHANGE_CONFIRMATION).
          if (modeErr?.code === 'PLAN_MODE_CHANGE_CONFIRMATION' || /confirmModeChange/.test(modeErr?.message || '')) {
            const ok = window.confirm(
              'This plan is used by existing subscriptions. Changing its mode re-categorizes those subscriptions. Continue?'
            );
            if (!ok) { setError('Plan mode change cancelled'); return; }
            await superAdminApi.updatePlan(plan.id, { ...payload, confirmModeChange: true });
          } else {
            throw modeErr;
          }
        }
      } else {
        await superAdminApi.createPlan(payload);
      }
      onSaved();
    } catch (err) {
      setError(err.message || 'Failed to save plan');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A] transition-all";
  const labelCls = "block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-extrabold text-slate-800">{isEdit ? 'Edit Plan' : 'Create New Plan'}</h3>
            <p className="text-[10px] text-slate-400 mt-0.5">Define pricing, limits, and entitlements for this subscription tier.</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-5 no-scrollbar">
          {error && <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-[11px] font-bold text-red-600">{error}</div>}

          {/* Basic Information */}
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-3">Basic Information</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className={labelCls}>Plan Code *</label>
                <input value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="e.g. GOLD" className={inputCls} disabled={isEdit} />
              </div>
              <div>
                <label className={labelCls}>Plan Name *</label>
                <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Gold" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Billing Cycle</label>
                {/* Yearly-only platform (spec §13): existing plans keep their stored
                    cycle for historical compatibility, but no NEW plan can be
                    monthly. */}
                <select
                  value={form.billingCycle}
                  onChange={(e) => set('billingCycle', e.target.value)}
                  className={inputCls}
                  disabled={isEdit && form.billingCycle !== 'YEARLY' && form.billingCycle !== 'ONCE'}
                >
                  <option value="YEARLY">Yearly</option>
                  <option value="ONCE">One Time</option>
                </select>
                {isEdit && form.billingCycle === 'MONTHLY' && (
                  <p className="text-[9px] font-bold text-amber-600 mt-1">Legacy monthly plan — the purchase flow is yearly-only.</p>
                )}
              </div>
              <div>
                <label className={labelCls}>Trial Days</label>
                <input type="number" min="0" inputMode="numeric" value={form.trialDays} onChange={(e) => set('trialDays', e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="mt-3">
              <label className={labelCls}>Description</label>
              <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A] resize-none" placeholder="Brief description of this plan..." />
            </div>
          </div>

          {/* Business Mode — exactly THREE modes */}
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">Business Mode</p>
            <p className="text-[10px] text-slate-400 mb-3">Choose the POS experience provided by this subscription plan.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {MODE_CARDS.map(({ mode, label, desc, details, emoji }) => (
                <button
                  type="button"
                  key={mode}
                  onClick={() => set('businessMode', mode)}
                  className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                    form.businessMode === mode
                      ? 'border-[#16A34A] bg-[#16A34A]/5 shadow-md'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{emoji}</span>
                    <div>
                      <p className="text-xs font-extrabold text-slate-800">{label}</p>
                      <p className="text-[9px] text-slate-500 mt-0.5">{desc}</p>
                      <p className="text-[9px] text-slate-400 mt-0.5">{details}</p>
                    </div>
                    {form.businessMode === mode && (
                      <div className="ml-auto">
                        <Check className="w-5 h-5 text-[#16A34A]" />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Pricing */}
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-3">Pricing</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className={labelCls}>Monthly Price (₹)</label>
                <input type="number" min="0" step="0.01" inputMode="decimal" value={form.monthlyPrice} onChange={(e) => set('monthlyPrice', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Yearly Price (₹)</label>
                <input type="number" min="0" step="0.01" inputMode="decimal" value={form.yearlyPrice} onChange={(e) => set('yearlyPrice', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Sort Order</label>
                <input type="number" inputMode="numeric" value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select value={form.isActive ? '1' : '0'} onChange={(e) => set('isActive', e.target.value === '1')} className={inputCls}>
                  <option value="1">Active</option>
                  <option value="0">Inactive</option>
                </select>
              </div>
            </div>
          </div>

          {/* Subscription Limits */}
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-3">Subscription Limits</p>
            <p className="text-[10px] text-slate-400 mb-2">Leave empty for unlimited. These limits are enforced per restaurant.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {LIMIT_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className={labelCls}>{f.label}</label>
                  <div className="relative">
                    <f.icon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input type="number" min="0" inputMode="numeric" value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} placeholder="Unlimited" className={`${inputCls} pl-8`} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Plan Entitlements — SELECTABLE module checkboxes (Part 9) */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-3.5 h-3.5 text-[#16A34A]" />
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Plan Entitlements</p>
            </div>
            <p className="text-[10px] text-slate-400 mb-3">Select the modules this plan includes. Restaurants on this plan can toggle these modules on/off; excluded modules are blocked server-side.</p>
            {form.businessMode !== 'RESTAURANT' && (
              <p className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-2">
                {form.businessMode === 'BASIC_POS'
                  ? 'Basic POS plan — Restaurant-only modules (Floor Management, Table Management, Kitchen/KOT) are not applicable and are hidden.'
                  : 'Basic / Quick Billing plan — Restaurant-only modules (Floor Management, Table Management, Kitchen/KOT) are not applicable and are hidden.'}
              </p>
            )}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 grid grid-cols-2 md:grid-cols-3 gap-2">
              {modulesForMode(form.businessMode).map((key) => {
                const Icon = FEATURE_ICONS[key] || Package;
                const label = MODULE_LABELS[key] || FEATURE_LABELS[key] || key;
                const selected = selectedModules.has(key);
                return (
                  <label key={key} className={`flex items-center gap-2 text-[10px] font-bold px-2.5 py-2 rounded-lg border cursor-pointer transition-all ${
                    selected ? 'bg-[#16A34A]/10 text-[#16A34A] border-[#16A34A]/30' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                  }`}>
                    <input type="checkbox" checked={selected} onChange={() => toggleModule(key)} className="w-3.5 h-3.5 accent-[#16A34A]" />
                    <Icon className="w-3 h-3 shrink-0" />
                    <span className="truncate">{label}</span>
                  </label>
                );
              })}
            </div>
            {selectedModules.size === 0 && (
              <p className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mt-2">
                A plan with no modules grants restaurants no features.
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 cursor-pointer">
            <input type="checkbox" checked={form.isDefault} onChange={(e) => set('isDefault', e.target.checked)} className="w-3.5 h-3.5 text-[#16A34A] rounded" />
            Default plan (used when creating a restaurant without a selected plan)
          </label>
        </form>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="h-9 px-4 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl cursor-pointer">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="h-9 px-5 bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {isEdit ? 'Save Changes' : 'Create Plan'}
          </button>
        </div>
      </div>
    </div>
  );
};

const PLAN_COLORS = ['blue', 'green', 'purple', 'amber', 'slate', 'rose', 'cyan', 'orange'];
const COLOR_MAP = {
  blue: { border: 'border-blue-200', text: 'text-blue-600', bg: 'bg-blue-50' },
  green: { border: 'border-green-200', text: 'text-green-600', bg: 'bg-green-50' },
  purple: { border: 'border-purple-200', text: 'text-purple-600', bg: 'bg-purple-50' },
  amber: { border: 'border-amber-200', text: 'text-amber-600', bg: 'bg-amber-50' },
  slate: { border: 'border-slate-300', text: 'text-slate-700', bg: 'bg-slate-100' },
  rose: { border: 'border-rose-200', text: 'text-rose-600', bg: 'bg-rose-50' },
  cyan: { border: 'border-cyan-200', text: 'text-cyan-600', bg: 'bg-cyan-50' },
  orange: { border: 'border-orange-200', text: 'text-orange-600', bg: 'bg-orange-50' },
};

const SORT_OPTIONS = [
  { value: 'sortOrder', label: 'Sort Order' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'monthlyPrice', label: 'Monthly Price' },
  { value: 'yearlyPrice', label: 'Yearly Price' },
  { value: 'createdAt', label: 'Created Date' },
];

export default function PlansManagement() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [view, setView] = useState('cards');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState('all'); // all | RESTAURANT | BASIC_POS | QUICK_BILLING
  const [sortBy, setSortBy] = useState('sortOrder');
  const [sortDir, setSortDir] = useState('asc');
  const [toast, setToast] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const plansResp = await superAdminApi.getPlans();
      if (plansResp.success) setPlans(plansResp.data || []);
    } catch (e) {
      console.error('Failed to load plans:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (plan) => {
    try {
      await superAdminApi.togglePlanActive(plan.id);
      showToast(plan.isActive ? `Plan "${plan.name}" deactivated` : `Plan "${plan.name}" activated`);
      load();
    } catch (e) {
      alert(e.message || 'Failed to toggle plan');
    }
  };

  const handleDuplicate = (plan) => {
    setConfirm({ type: 'duplicate', plan });
  };

  const handleDelete = (plan) => {
    const inUse = Number(plan.restaurantCount || 0);
    if (inUse > 0) {
      showToast(`This plan is currently assigned to ${inUse} restaurant(s). Reassign them before deleting.`);
      return;
    }
    setConfirm({ type: 'delete', plan });
  };

  const handleConfirm = async () => {
    if (!confirm || busy) return;
    setBusy(true);
    const { type, plan } = confirm;
    try {
      if (type === 'duplicate') {
        await superAdminApi.duplicatePlan(plan.id);
        showToast(`Plan "${plan.name}" duplicated`);
      } else {
        await superAdminApi.deletePlan(plan.id);
        showToast(`Plan "${plan.name}" deleted`);
      }
      setConfirm(null);
      load();
    } catch (e) {
      showToast(e.message || (type === 'duplicate' ? 'Failed to duplicate plan' : 'Failed to delete plan'));
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  const filteredPlans = useMemo(() => {
    let list = [...plans];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => (p.name || '').toLowerCase().includes(q) || (p.code || '').toLowerCase().includes(q));
    }
    if (statusFilter === 'active') list = list.filter((p) => p.isActive);
    if (statusFilter === 'inactive') list = list.filter((p) => !p.isActive);
    // Group/filter by Business (Plan) Mode: All / Restaurant / Basic.
    if (modeFilter !== 'all') list = list.filter((p) => (p.businessMode || 'RESTAURANT') === modeFilter);
    const dir = sortDir === 'desc' ? -1 : 1;
    list.sort((a, b) => {
      let av = a[sortBy];
      let bv = b[sortBy];
      if (sortBy === 'name' || sortBy === 'sortOrder' || sortBy === 'createdAt') {
        av = sortBy === 'createdAt' ? new Date(a.createdAt || 0).getTime() : a[sortBy];
        bv = sortBy === 'createdAt' ? new Date(b.createdAt || 0).getTime() : b[sortBy];
        return (av > bv ? 1 : av < bv ? -1 : 0) * dir;
      }
      return ((Number(av) || 0) - (Number(bv) || 0)) * dir;
    });
    return list;
  }, [plans, search, statusFilter, sortBy, sortDir]);

  const toggleSort = (key) => {
    if (sortBy === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(key); setSortDir('asc'); }
  };

  const SortIndicator = ({ col }) => (
    <span className="inline-flex ml-1 align-middle">
      {sortBy === col
        ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
        : <ArrowUpDown className="w-3 h-3 opacity-40" />}
    </span>
  );

  const formatLimit = (val) => (val === null || val === undefined || val === '' ? 'Unlimited' : val);
  const fmtPrice = (v) => `₹${(Number(v) || 0).toLocaleString('en-IN')}`;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800">Subscription Plans</h1>
          <p className="text-xs text-slate-500 mt-1">Fully database-driven — changes apply instantly to every assigned restaurant.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="h-9 w-9 flex items-center justify-center bg-white border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer" title="Refresh">
            <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
          </button>
          <button onClick={() => setModal({ plan: null })} className="h-9 px-4 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Create Plan
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plans by name or code..."
            className="w-full h-8 pl-8 pr-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 outline-none">
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select value={modeFilter} onChange={(e) => setModeFilter(e.target.value)} className="h-8 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 outline-none" title="Filter by Business / Plan Mode">
          <option value="all">All Modes</option>
          <option value="RESTAURANT">Restaurant Mode</option>
          <option value="BASIC_POS">Basic POS Mode</option>
          <option value="QUICK_BILLING">Basic / Quick Billing Mode</option>
        </select>
        <select value={sortBy} onChange={(e) => { setSortBy(e.target.value); }} className="h-8 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 outline-none">
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button
          onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          className="h-8 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
          title="Toggle sort direction"
        >
          {sortDir === 'asc' ? 'A → Z' : 'Z → A'}
        </button>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          <button onClick={() => setView('cards')} className={`h-8 px-3 text-[11px] font-bold cursor-pointer transition-colors ${view === 'cards' ? 'bg-[#16A34A] text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>Cards</button>
          <button onClick={() => setView('table')} className={`h-8 px-3 text-[11px] font-bold cursor-pointer transition-colors ${view === 'table' ? 'bg-[#16A34A] text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>Table</button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-[#16A34A]" />
        </div>
      ) : plans.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-500">No plans yet</p>
          <p className="text-xs text-slate-400 mt-1">Create your first subscription plan.</p>
        </div>
      ) : filteredPlans.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <Search className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-xs font-bold text-slate-500">No plans match your search</p>
        </div>
      ) : view === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {filteredPlans.map((plan, i) => {
            const c = COLOR_MAP[PLAN_COLORS[i % PLAN_COLORS.length]];
            const price = plan.billingCycle === 'YEARLY' ? plan.yearlyPrice : plan.monthlyPrice;
            const priceLabel = plan.billingCycle === 'YEARLY' ? `${fmtPrice(price)}/yr` : `${fmtPrice(price)}/mo`;
            const featureCount = Array.isArray(plan.features) ? plan.features.length : 0;
            const inUse = Number(plan.restaurantCount || 0);
            return (
              <div key={plan.id} className={`relative bg-white border-2 ${c.border} rounded-2xl p-5 flex flex-col transition-all hover:shadow-lg`}>
                <div className="absolute top-3 right-3 flex items-center gap-1">
                  {plan.isDefault && (
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-slate-900 text-white uppercase tracking-wider">Default</span>
                  )}
                  {!plan.isActive && (
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 uppercase tracking-wider">Inactive</span>
                  )}
                </div>
                <div className={`w-10 h-10 rounded-xl ${c.bg} ${c.text} flex items-center justify-center mb-3`}>
                  <Package className="w-5 h-5" />
                </div>
                <h3 className="text-base font-extrabold text-slate-800">{plan.name}</h3>
                <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">{plan.description || '—'}</p>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-xl font-extrabold text-slate-900">{priceLabel}</span>
                </div>

                <div className="mt-3 space-y-1.5 flex-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-semibold text-slate-400">Business Mode</span>
                    <span className={`font-extrabold text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      (plan.businessMode || 'RESTAURANT') === 'RESTAURANT'
                        ? 'bg-[#16A34A]/10 text-[#16A34A] border border-[#16A34A]/20'
                        : (plan.businessMode || 'RESTAURANT') === 'BASIC_POS'
                          ? 'bg-amber-50 text-amber-600 border border-amber-200'
                          : 'bg-cyan-50 text-cyan-600 border border-cyan-200'
                    }`}> {modeBadge(plan.businessMode || 'RESTAURANT')} </span>
                  </div>
                  {LIMIT_FIELDS.slice(0, 4).map((f) => (
                    <div key={f.key} className="flex items-center justify-between text-[10px]">
                      <span className="font-semibold text-slate-400 flex items-center gap-1.5"><f.icon className="w-3 h-3" />{f.label}</span>
                      <span className="font-extrabold text-slate-600">{formatLimit(plan[f.key])}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-50">
                    <span className="font-semibold text-slate-400">Modules</span>
                    <span className="font-extrabold text-slate-600">{featureCount} / {AVAILABLE_RESTAURANT_MODULE_KEYS.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-semibold text-slate-400 flex items-center gap-1.5"><Users className="w-3 h-3" />Restaurants</span>
                    <span className={`font-extrabold ${inUse > 0 ? 'text-[#16A34A]' : 'text-slate-400'}`}>{inUse}</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex gap-1.5">
                  <button onClick={() => setModal({ plan })} className="flex-1 h-7 flex items-center justify-center gap-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 cursor-pointer">
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                  <button onClick={() => handleDuplicate(plan)} title="Duplicate Plan" className="w-7 h-7 flex items-center justify-center bg-cyan-50 text-cyan-600 rounded-lg hover:bg-cyan-100 cursor-pointer">
                    <Copy className="w-3 h-3" />
                  </button>
                  <button onClick={() => handleToggle(plan)} title={plan.isActive ? 'Deactivate' : 'Activate'} className={`w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer ${plan.isActive ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
                    <Power className="w-3 h-3" />
                  </button>
                  <button onClick={() => handleDelete(plan)} title={inUse > 0 ? 'Assigned — cannot delete' : 'Delete'} className={`w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer ${inUse > 0 ? 'bg-slate-100 text-slate-400' : 'bg-red-50 text-red-500 hover:bg-red-100'}`}>
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left font-extrabold text-slate-500 py-3 px-4 cursor-pointer select-none hover:text-[#16A34A]" onClick={() => toggleSort('name')}>
                    Plan Name <SortIndicator col="name" />
                  </th>
                  <th className="text-left font-extrabold text-slate-500 py-3 px-4 cursor-pointer select-none hover:text-[#16A34A]" onClick={() => toggleSort('monthlyPrice')}>
                    Monthly <SortIndicator col="monthlyPrice" />
                  </th>
                  <th className="text-left font-extrabold text-slate-500 py-3 px-4 cursor-pointer select-none hover:text-[#16A34A]" onClick={() => toggleSort('yearlyPrice')}>
                    Yearly <SortIndicator col="yearlyPrice" />
                  </th>
                  <th className="text-left font-extrabold text-slate-500 py-3 px-4">Business Mode</th>
                  <th className="text-center font-extrabold text-slate-500 py-3 px-4">Restaurants</th>
                  <th className="text-left font-extrabold text-slate-500 py-3 px-4">Status</th>
                  <th className="text-left font-extrabold text-slate-500 py-3 px-4 cursor-pointer select-none hover:text-[#16A34A]" onClick={() => toggleSort('createdAt')}>
                    Created <SortIndicator col="createdAt" />
                  </th>
                  <th className="text-right font-extrabold text-slate-500 py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlans.map((plan) => {
                  const inUse = Number(plan.restaurantCount || 0);
                  return (
                    <tr key={plan.id} className="border-t border-slate-50 hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-lg ${COLOR_MAP[PLAN_COLORS[plans.indexOf(plan) % PLAN_COLORS.length]].bg} ${COLOR_MAP[PLAN_COLORS[plans.indexOf(plan) % PLAN_COLORS.length]].text} flex items-center justify-center`}>
                            <Package className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-extrabold text-slate-700 flex items-center gap-1.5">
                              {plan.name}
                              {plan.isDefault && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-slate-900 text-white uppercase tracking-wider">Default</span>}
                            </div>
                            <div className="text-[10px] text-slate-400 font-semibold">{plan.code}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-600">{fmtPrice(plan.monthlyPrice)}</td>
                      <td className="py-3 px-4 font-bold text-slate-600">{fmtPrice(plan.yearlyPrice)}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          (plan.businessMode || 'RESTAURANT') === 'RESTAURANT'
                            ? 'bg-[#16A34A]/10 text-[#16A34A] border border-[#16A34A]/20'
                            : (plan.businessMode || 'RESTAURANT') === 'BASIC_POS'
                              ? 'bg-amber-50 text-amber-600 border border-amber-200'
                              : 'bg-cyan-50 text-cyan-600 border border-cyan-200'
                        }`}>
                          {modeBadge(plan.businessMode || 'RESTAURANT')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center gap-1 font-extrabold ${inUse > 0 ? 'text-[#16A34A]' : 'text-slate-400'}`}>
                          <Users className="w-3 h-3" />{inUse}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {plan.isActive
                          ? <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-600"><CheckCircle2 className="w-3 h-3" />Active</span>
                          : <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-500"><XCircle className="w-3 h-3" />Inactive</span>}
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-semibold">{new Date(plan.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td className="py-3 px-4">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setModal({ plan })} title="Edit" className="w-7 h-7 flex items-center justify-center bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-slate-600 cursor-pointer"><Pencil className="w-3 h-3" /></button>
                          <button onClick={() => handleDuplicate(plan)} title="Duplicate" className="w-7 h-7 flex items-center justify-center bg-cyan-50 hover:bg-cyan-100 text-cyan-600 rounded-lg cursor-pointer"><Copy className="w-3 h-3" /></button>
                          <button onClick={() => handleToggle(plan)} title={plan.isActive ? 'Deactivate' : 'Activate'} className={`w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer ${plan.isActive ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}><Power className="w-3 h-3" /></button>
                          <button onClick={() => handleDelete(plan)} title={inUse > 0 ? 'Assigned — cannot delete' : 'Delete'} className={`w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer ${inUse > 0 ? 'bg-slate-100 text-slate-400' : 'bg-red-50 text-red-500 hover:bg-red-100'}`}><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && (
        <PlanFormModal
          plan={modal.plan}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); showToast(modal.plan ? 'Plan updated — changes applied to all assigned restaurants' : 'Plan created'); }}
        />
      )}

      {/* Confirm Duplicate / Delete Plan */}
      {confirm && (
        <ConfirmationDialog
          isOpen={!!confirm}
          onClose={() => { if (!busy) setConfirm(null); }}
          onConfirm={handleConfirm}
          title={confirm.type === 'duplicate' ? 'Duplicate Plan?' : 'Delete Plan?'}
          message={confirm.type === 'duplicate'
            ? `Duplicate plan "${confirm.plan?.name}"? A copy including its entitlements will be created.`
            : `Are you sure you want to delete plan "${confirm.plan?.name}"? This cannot be undone.`}
          confirmLabel={confirm.type === 'duplicate' ? 'Duplicate' : 'Delete'}
          cancelLabel="Cancel"
          variant={confirm.type === 'duplicate' ? 'info' : 'danger'}
          isLoading={busy}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 p-3.5 rounded-xl shadow-xl border text-xs font-bold bg-emerald-50 text-emerald-900 border-emerald-200 animate-slide-up">
          {toast}
        </div>
      )}
    </div>
  );
}
