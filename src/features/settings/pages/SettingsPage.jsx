import React, { useState, useEffect, useMemo } from 'react';
import {
  Save, RefreshCw, Search, X, Upload, Trash2, Image,
  Building2, Settings, Receipt, Percent, ChefHat, Printer,
  Globe, FileText, Shield, KeyRound, Lock,
  Check,
  AlertCircle, Loader2, Wifi, WifiOff,
  Monitor, Layout, Plus, Utensils, Leaf, Beef, ShoppingCart, ScanBarcode
} from 'lucide-react';
import { useSettingsStore, useUiStore, useAuthStore } from '../../../store';
import { getBusinessCapabilities, isBasicPosFoodBusiness } from '../../../utils/businessCapabilities';
import { FEATURE_FOR_SETTING, hasFeature } from '../../../utils/permissions';

// ─── Reusable UI Components ─────────────────────────────────────────────────

const ToggleSwitch = ({ checked, onChange, label, description, disabled }) => (
  <div className={`flex items-center justify-between py-2.5 px-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-slate-200 transition-all ${disabled ? 'opacity-60' : ''}`}>
    <div className="flex-1 min-w-0">
      <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
        {label}
        {disabled && <Lock className="w-3 h-3 text-amber-500 shrink-0" />}
      </p>
      {description && <p className="text-[10px] text-slate-400 mt-0.5">{description}</p>}
    </div>
    <button
      onClick={() => { if (!disabled) onChange(!checked); }}
      className={`relative w-10 h-[22px] rounded-full transition-all cursor-pointer shrink-0 ml-3 ${disabled ? 'cursor-not-allowed' : ''} ${
        checked ? 'bg-[#16A34A]' : 'bg-slate-300'
      }`}
      type="button"
      aria-disabled={disabled}
    >
      <span className={`absolute top-[2px] left-[2px] w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-all ${
        checked ? 'translate-x-[18px]' : ''
      }`} />
    </button>
  </div>
);

const FormField = ({ label, value, onChange, type = 'text', placeholder, options, prefix, suffix, disabled, className = '' }) => (
  <div className={`space-y-1 ${className}`}>
    <label className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">{label}</label>
    <div className="relative">
      {prefix && (
        <div className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none">
          <span className="text-xs text-slate-400 font-bold">{prefix}</span>
        </div>
      )}
      {options ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`w-full h-9 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-[#16A34A] focus:bg-white transition-all cursor-pointer ${
            disabled ? 'opacity-50 cursor-not-allowed' : ''
          } ${prefix ? 'pl-7' : ''}`}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          inputMode={type === 'number' ? 'decimal' : undefined}
          className={`w-full h-9 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-[#16A34A] focus:bg-white transition-all ${
            disabled ? 'opacity-50 cursor-not-allowed' : ''
          } ${prefix ? 'pl-7' : ''} ${type === 'number' ? 'font-mono' : ''}`}
        />
      )}
      {suffix && <div className="absolute inset-y-0 right-0 flex items-center pr-2.5"><span className="text-[10px] text-slate-400">{suffix}</span></div>}
    </div>
  </div>
);

const SectionCard = ({ title, description, icon: Icon, children, className = '' }) => (
  <div className={`bg-white rounded-[20px] border border-slate-200 p-5 shadow-xs space-y-4 ${className}`}>
    {(title || description) && (
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="w-8 h-8 rounded-xl bg-[#16A34A]/10 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-[#16A34A]" />
          </div>
        )}
        <div className="flex-1">
          {title && <h4 className="text-xs font-extrabold text-slate-800 uppercase">{title}</h4>}
          {description && <p className="text-[10px] text-slate-400 mt-0.5">{description}</p>}
        </div>
      </div>
    )}
    {children}
  </div>
);

const EmptyState = ({ icon: Icon, title, description, action }) => (
  <div className="text-center py-8">
    {Icon && (
      <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
        <Icon className="w-6 h-6 text-slate-400" />
      </div>
    )}
    <h3 className="text-sm font-extrabold text-slate-500">{title}</h3>
    {description && <p className="text-xs text-slate-400 mt-1">{description}</p>}
    {action && <div className="mt-3">{action}</div>}
  </div>
);

const LoadingSkeleton = ({ count = 3 }) => (
  <div className="space-y-3 animate-pulse">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="h-12 bg-slate-100 rounded-xl" />
    ))}
  </div>
);

const FormGrid = ({ children, cols = 2 }) => {
  // Mobile: 1 column · ≥sm (tablet portrait 768px+): 2 columns · md+: 3–4 columns.
  // Keeps long forms readable on narrow screens without touching field logic.
  const colClass = cols === 4 ? 'sm:grid-cols-2 md:grid-cols-4' : cols === 3 ? 'sm:grid-cols-2 md:grid-cols-3' : 'sm:grid-cols-2';
  return (
    <div className={`grid grid-cols-1 ${colClass} gap-3`}>
      {children}
    </div>
  );
};

// ─── Section Definitions ────────────────────────────────────────────────────

const SECTIONS = [
  { key: 'general', label: 'General', icon: Building2 },
  { key: 'pos', label: 'POS Config', icon: Settings },
  { key: 'pos_screen', label: 'POS Screen Settings', icon: Layout },
  { key: 'billing', label: 'Billing', icon: Receipt },
  { key: 'tax', label: 'Tax & GST', icon: Percent },
  { key: 'printer', label: 'Printer', icon: Printer },
  { key: 'security', label: 'Security', icon: Shield },
];

// ─── POS Screen Settings: real module toggles with business-mode scope ──────
// Every toggle here has a real consumer (sidebar / route guard / POS screen).
// `modes` controls which business modes expose the toggle — Restaurant mode
// never shows POS-Ordering-only controls.
const MODULE_TOGGLES = [
  // Part 10: "Enable POS Ordering Screen" is intentionally NOT a toggle.
  // POS Ordering is always enabled — orders can only be created through the
  // POS Ordering workflow, so a restaurant admin must never be able to hide it.
  {
    key: 'enableCounterSale',
    label: 'Enable Basic POS Quick Billing',
    description: "OFF: Orders are sent to the kitchen through KOT and remain in Active Orders until ready. No tables or floors. ON: Items go directly to payment. No KOT, kitchen preparation, or Active Orders.",
    modes: ['counter', 'hybrid'],
  },
  {
    key: 'enableKitchen',
    label: 'Enable Kitchen (KOT)',
    description: 'If OFF: Customer Order → Direct Billing → Payment → Complete (no KOT). If ON: Generate KOT → Kitchen → Ready → Billing',
    modes: ['restaurant', 'hybrid'],
  },
  {
    key: 'enableBilling',
    label: 'Enable Billing Module',
    description: 'If OFF: Hide Billing screen, Bill button, Payment screen, Billing reports, and Billing dialogs',
    modes: ['restaurant', 'counter', 'hybrid'],
  },
  {
    key: 'enableFloorManagement',
    label: 'Enable Floor Management',
    description: 'If OFF: Hide Floors, Tables, Transfer Table, Merge Table. POS works in Quick Order mode',
    modes: ['restaurant', 'hybrid'],
  },
  {
    key: 'enableReports',
    label: 'Enable Reports',
    description: 'Reports respect enabled modules: Kitchen OFF hides KOT/Kitchen reports. Billing OFF hides Sales/Payment reports. Floor OFF hides Table Occupancy reports',
    modes: ['restaurant', 'counter', 'hybrid'],
  },
  {
    key: 'enableMenu',
    label: 'Enable Menu',
    description: 'If OFF: Hide Menu & Stock sidebar item and related buttons',
    modes: ['restaurant', 'counter', 'hybrid'],
  },
  {
    key: 'enableActiveOrders',
    label: 'Enable Active Orders',
    description: 'If OFF: Hide Active Orders sidebar item',
    modes: ['restaurant', 'hybrid'],
  },
  {
    key: 'enableHoldOrders',
    label: 'Enable Hold Orders',
    description: 'If OFF: Hide Hold button in Order Wizard and Hold tab in Orders screen',
    modes: ['restaurant', 'hybrid'],
  },
  {
    key: 'enableAddItem',
    label: 'Enable Add Item',
    description: 'If OFF: Occupied tables cannot receive additional items. If ON: Open Existing Order → Add Items → Generate New KOT → Update Existing Bill',
    modes: ['restaurant', 'hybrid'],
  },
  {
    key: 'enableTransferTable',
    label: 'Enable Transfer Table',
    description: 'If OFF: Hide Transfer button. If ON: Allow table transfer',
    modes: ['restaurant', 'hybrid'],
  },
  {
    key: 'enableStaffRoster',
    label: 'Enable Staff Roster',
    description: 'If OFF: Hide Staff Roster from the sidebar and block staff-management screens. If ON: Staff Roster is visible according to plan and permissions.',
    modes: ['restaurant', 'counter', 'hybrid'],
  },
];

// ─── Main Component ─────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { settings, fetchSettings, saveSettings, updateSettings, loading, saving, error, clearError, uploadLogo, deleteLogo, barcodeScannerAvailable } = useSettingsStore();
  const { addToast, setScreen } = useUiStore();
  const { logout, changePassword, subscription } = useAuthStore();
  const [activeSection, setActiveSection] = useState('general');
  const [searchQuery, setSearchQuery] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);
  const [showPrinterModal, setShowPrinterModal] = useState(false);
  const [printerForm, setPrinterForm] = useState({ name: '', type: 'Kitchen', connection: 'Network (TCP/IP)', ipOrAddress: '', port: 9100 });
  // Change Password (self-service)
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' });
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Initial load - only fetch if settings haven't been loaded recently
  useEffect(() => {
    const state = useSettingsStore.getState();
    if (!state.lastFetched || Date.now() - state.lastFetched > 60000) {
      fetchSettings();
    }
  }, []);

  const businessMode = settings.businessMode || 'restaurant';
  // Centralized business capabilities (server-resolved businessType via the
  // settings API; mirrored locally per utils/businessCapabilities.js).
  const capabilities = settings.capabilities || getBusinessCapabilities(settings.businessType);
  const isFoodBusiness = capabilities.dietary === true;
  const isKitchenBusiness = capabilities.kitchen === true;
  // Veg Only is the SAVED restaurant configuration. Once the real value has
  // loaded, a Veg Only restaurant must never be offered the broader mode as a
  // selectable option — the persisted value drives what is offered.
  const vegOnlyLocked = !loading && settings.dietaryMode === 'VEG_ONLY';
  // §13: "Enable Basic POS Quick Billing" is a BASIC_POS food-business toggle
  // (café/bakery/bar/food-truck/cloud-kitchen) — never shown for QUICK_BILLING
  // retail businesses (those are quick billing by mode, with nothing to toggle).
  const isBasicPosFood = isBasicPosFoodBusiness(settings.businessType);

  // Plan module lock — a module excluded from the restaurant's subscription plan
  // cannot be enabled from Settings (backend authorization still blocks it).
  const planLocked = (settingKey) => {
    const featureKey = FEATURE_FOR_SETTING[settingKey];
    if (!featureKey) return false;
    return !hasFeature(subscription, featureKey);
  };

  // Module toggles visible for the current business mode AND the subscription plan
  const visibleModuleToggles = useMemo(() => {
    return MODULE_TOGGLES.filter((t) => {
      if (!t.modes.includes(businessMode)) return false;
      // Business-capability filter (§12): kitchen/KOT toggles never appear for
      // non-kitchen verticals regardless of plan/mode; dietary requires food.
      if (t.key === 'enableKitchen' && !isKitchenBusiness) return false;
      // §13: Quick Billing toggle is scoped to BASIC_POS food businesses only —
      // a QUICK_BILLING retail tenant never sees it (and the backend forces it
      // off so it can never mis-describe retail behavior).
      if (t.key === 'enableCounterSale' && !isBasicPosFood) return false;
      if (planLocked(t.key)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessMode, subscription, isKitchenBusiness, isBasicPosFood]);

  // ── Search: match the section label OR any VISIBLE setting label in it.
  // Hidden settings (wrong business mode / not in plan) are never searched.
  const visibleFieldLabels = (secKey) => {
    const labels = [];
    const mode = businessMode;
    switch (secKey) {
      case 'general':
        labels.push('Restaurant Name', 'Owner Name', 'Email', 'Phone', 'TAX Number', 'FSSAI Number', 'Website', 'Address', 'City', 'State', 'Country', 'Postal Code', 'Restaurant Logo', 'Receipt Footer Message');
        break;
      case 'pos':
        labels.push('Currency', 'Currency Symbol', 'Time Zone', 'Language');
        break;
      case 'pos_screen':
        labels.push('Business Mode');
        MODULE_TOGGLES.forEach((t) => {
          if (!t.modes.includes(mode)) return;
          if (t.key === 'enableKitchen' && !isKitchenBusiness) return;
          if (t.key === 'enableCounterSale' && !isBasicPosFood) return;
          if (planLocked(t.key)) return;
          labels.push(t.label);
        });
        labels.push('KOT Printing');
        break;
      case 'billing':
        labels.push('Invoice Prefix', 'KOT Prefix', 'Bill Prefix', 'Bill Number Start', 'Round Off', 'Split Bill', 'Auto Print Bill');
        break;
      case 'tax':
        labels.push('Tax Type', 'GST Rate', 'Service Charge');
        break;
      case 'printer':
        labels.push('Printer Configuration');
        break;
      case 'security':
        labels.push('Authentication Type', 'Change Password');
        break;
      default:
        break;
    }
    return labels;
  };

  const filteredSections = useMemo(() => {
    if (!searchQuery) return SECTIONS;
    const q = searchQuery.toLowerCase();
    return SECTIONS.filter((s) => {
      if (s.label.toLowerCase().includes(q)) return true;
      return visibleFieldLabels(s.key).some((l) => l.toLowerCase().includes(q));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, businessMode, subscription]);

  // Keep the active section valid while searching
  useEffect(() => {
    if (searchQuery && !filteredSections.some((s) => s.key === activeSection)) {
      if (filteredSections.length > 0) {
        setActiveSection(filteredSections[0].key);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, filteredSections]);

  // Simple handler - avoids stale closures by reading fresh state via updateSettings
  const handleFieldChange = (key, value, section) => {
    if (section === 'branding') {
      const currentBranding = useSettingsStore.getState().settings.branding;
      updateSettings({ branding: { ...currentBranding, [key]: value } });
    } else if (section === 'security') {
      const currentSecurity = useSettingsStore.getState().settings.security;
      updateSettings({ security: { ...currentSecurity, [key]: value } });
    } else {
      updateSettings({ [key]: value });
    }
  };

  const handleSave = async () => {
    const result = await saveSettings();
    if (result.success) {
      addToast('All settings saved successfully!', 'success');
    } else {
      addToast(result.error || 'Failed to save settings', 'error');
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      addToast('Logo must be under 5MB', 'error');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
      addToast('Only JPEG, PNG, GIF, WebP images allowed', 'error');
      return;
    }
    setLogoUploading(true);
    const result = await uploadLogo(file);
    if (result.success) {
      addToast('Logo uploaded successfully!', 'success');
    } else {
      addToast(result.error || 'Logo upload failed', 'error');
    }
    setLogoUploading(false);
  };

  const handleDeleteLogo = async () => {
    const result = await deleteLogo();
    if (result.success) {
      addToast('Logo deleted', 'success');
    } else {
      addToast(result.error || 'Failed to delete logo', 'error');
    }
  };

  const handleAddPrinter = () => {
    if (!printerForm.name || !printerForm.ipOrAddress) {
      addToast('Please fill in printer name and IP address', 'error');
      return;
    }
    const newPrinter = {
      id: `printer-${Date.now()}`,
      name: printerForm.name,
      type: printerForm.type,
      connection: printerForm.connection,
      ipOrAddress: printerForm.ipOrAddress,
      port: printerForm.port,
      status: 'Online',
      addedAt: new Date().toISOString(),
    };
    updateSettings({ printers: [...(settings.printers || []), newPrinter] });
    setShowPrinterModal(false);
    setPrinterForm({ name: '', type: 'Kitchen', connection: 'Network (TCP/IP)', ipOrAddress: '', port: 9100 });
    addToast(`Printer "${newPrinter.name}" added`, 'success');
  };

  const handleDeletePrinter = (id) => {
    const printer = (settings.printers || []).find(p => p.id === id);
    updateSettings({ printers: (settings.printers || []).filter(p => p.id !== id) });
    addToast(`Printer "${printer?.name}" removed`, 'success');
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    const { current, next, confirm } = passwordForm;
    if (!current || !next || !confirm) {
      addToast('Please fill in all password fields', 'error');
      return;
    }
    if (next.length < 8) {
      addToast('New password must be at least 8 characters', 'error');
      return;
    }
    if (next !== confirm) {
      addToast('New password and confirmation do not match', 'error');
      return;
    }
    if (next === current) {
      addToast('New password must be different from the current password', 'error');
      return;
    }
    setPasswordSaving(true);
    const result = await changePassword(current, next);
    setPasswordSaving(false);
    if (result.success) {
      addToast('Password changed successfully. Please sign in again.', 'success');
      // Force logout — the user must sign in with the new password
      logout();
      setScreen('login');
    } else {
      addToast(result.message || 'Failed to change password', 'error');
    }
  };

  // Render section content
  const renderSection = () => {
    if (loading) {
      return (
        <div className="space-y-4">
          <LoadingSkeleton count={8} />
        </div>
      );
    }

    switch (activeSection) {
      // ═══════════════════════════════════ POS SCREEN SETTINGS ═══════════════════════════════════
      case 'pos_screen':
        return (
          <div className="space-y-5">
            <SectionCard title="Business Mode" description="Your business mode is determined by your subscription plan." icon={Layout}>
              {(() => {
                const isRestaurant = businessMode === 'restaurant';
                // §2/§13: a BASIC_POS food business in Quick Billing mode shows
                // the quick-billing description; production mode (default) shows
                // the counter/KOT workflow. Retail never reaches this UI block
                // with kitchen toggles — modeDetails stays truthful per mode.
                const quickBillingOn = isBasicPosFood && settings.enableCounterSale === true;
                // §10: BUSINESS MODE vs SETTING are different concepts — a
                // QUICK_BILLING retail tenant must never read as "Basic POS".
                const isRetailQuickBilling = !isRestaurant && !isBasicPosFood;
                const modeLabel = isRestaurant ? 'Restaurant' : isRetailQuickBilling ? 'Quick Billing (Retail)' : 'Basic POS';
                const modeDesc = isRestaurant
                  ? 'Full dine-in restaurant operations'
                  : isRetailQuickBilling
                    ? 'Retail quick billing — items go directly to payment'
                    : quickBillingOn
                      ? 'Quick billing — items go directly to payment'
                      : 'Counter ordering with kitchen preparation';
                const modeDetails = isRestaurant
                  ? 'Tables • KOT • Kitchen • Active Orders'
                  : isRetailQuickBilling
                    ? 'Cart • Payment • No KOT/Kitchen/Tables'
                    : quickBillingOn
                      ? 'Cart • Payment • No KOT/Kitchen workflow'
                      : 'Counter Order • KOT • Kitchen • Active Orders • No tables';
                const emoji = isRestaurant ? '🍽️' : '🧾';
                return (
                  <div>
                    <div className={`p-4 rounded-2xl border-2 ${
                      isRestaurant ? 'border-[#16A34A] bg-[#16A34A]/5' : 'border-amber-300 bg-amber-50/50'
                    }`}> 
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{emoji}</span>
                        <div className="flex-1">
                          <p className="text-xs font-extrabold text-slate-800">{modeLabel}</p>
                          <p className="text-[9px] text-slate-500 mt-0.5">{modeDesc}</p>
                          <p className="text-[9px] text-slate-400 mt-0.5">{modeDetails}</p>
                        </div>
                        <div className="flex items-center gap-1 text-[9px] font-bold text-[#16A34A]">
                          <Check className="w-3 h-3" /> Included in your current plan
                        </div>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-3 bg-slate-50 rounded-xl p-3 border border-slate-100">
                      Business mode is managed by your subscription plan. Contact your administrator to change your plan.
                    </p>
                  </div>
                );
              })()}
            </SectionCard>

            <SectionCard title="POS Ordering Screen" description="The POS Ordering workflow is the entry point for every order." icon={Layout}>
              {/* Part 10: POS Ordering is ALWAYS enabled — permanently on.
                  There is intentionally no user-facing ON/OFF toggle. */}
              <div className="flex items-center gap-3 p-4 rounded-2xl border-2 border-[#16A34A] bg-[#16A34A]/5">
                <ShoppingCart className="w-5 h-5 text-[#16A34A] shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-extrabold text-slate-800 flex items-center gap-2">
                    POS Ordering Screen
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#16A34A] text-white text-[8px] font-bold rounded-full uppercase">
                      <Check className="w-2.5 h-2.5" /> Always enabled
                    </span>
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    All orders can be created through the POS Ordering workflow.
                  </p>
                </div>
              </div>
              {/* Part 11: Barcode Scanner — plan entitlement is the upper limit.
                  The card only appears when the plan includes barcode_scanner;
                  the tenant ADMIN toggle then decides whether scanners are active. */}
              {barcodeScannerAvailable ? (
                <div className="mt-3">
                  <ToggleSwitch checked={settings.barcodeScannerEnabled === true}
                    onChange={(v) => handleFieldChange('barcodeScannerEnabled', v)}
                    label="Enable Barcode Scanner"
                    description="If ON: USB/Bluetooth barcode scanners can add sellable items to the bill in POS Ordering and Basic POS. Items without a barcode are still added manually." />
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50">
                  <ScanBarcode className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="flex-1">
                    <p className="text-[10px] font-bold text-slate-600">Barcode Scanner</p>
                    <p className="text-[9px] text-slate-400 mt-0.5">Not included in your subscription plan. Contact your administrator to upgrade.</p>
                  </div>
                </div>
              )}
            </SectionCard>

            {/* Food Settings — only for dietary-capable (food) businesses.
                Non-food verticals see no Veg/Non-Veg UI at all. */}
            {isFoodBusiness && (
            <SectionCard title="Food Settings" description="Controls the maximum food type available in this business. Individual staff may have a more restrictive setting." icon={Utensils}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-700">Dietary Menu Mode</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {vegOnlyLocked
                      ? 'This restaurant is configured for Veg Only — every menu item and order is vegetarian. The mode is set in the restaurant configuration and cannot be broadened here.'
                      : 'Controls the maximum food type available in this restaurant. Individual staff may have a more restrictive setting.'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 shrink-0">
                  {/* The ACTIVE mode is the PERSISTED tenant value only. While
                      settings are still loading the store still holds its
                      default (Veg + Non-Veg), so nothing is marked active until
                      the real value arrives — the default can never present
                      itself as the saved configuration. */}
                  {vegOnlyLocked ? (
                    /* Veg Only is the SAVED configuration. The broader
                       Veg + Non-Veg option is deliberately NOT rendered — it is
                       never shown as the current or an allowed setting for a
                       Veg Only restaurant (broadening it could expose non-veg
                       items). The Super Admin changes the mode from the
                       restaurant configuration. */
                    <span
                      className="px-3 h-8 rounded-lg border text-[10px] font-bold flex items-center gap-1.5 bg-emerald-50 border-emerald-400 text-emerald-700"
                      aria-label="Active dietary menu mode: Veg Only (set in the restaurant configuration)"
                    >
                      <Leaf className="w-3 h-3" /> Veg Only
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-600 text-white text-[8px] font-bold rounded-full uppercase tracking-wide">
                        <Check className="w-2.5 h-2.5" /> Configured
                      </span>
                    </span>
                  ) : (
                    [['VEG_ONLY', 'Veg Only'], ['VEG_AND_NON_VEG', 'Veg + Non-Veg']].map(([value, label]) => (
                    <button key={value} type="button"
                      onClick={() => handleFieldChange('dietaryMode', value)}
                      disabled={loading}
                      aria-pressed={!loading && (settings.dietaryMode || 'VEG_AND_NON_VEG') === value}
                      className={`px-3 h-8 rounded-lg border text-[10px] font-bold flex items-center gap-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                        loading ? 'cursor-wait'
                          : !loading && (settings.dietaryMode || 'VEG_AND_NON_VEG') === value
                            ? (value === 'VEG_ONLY' ? 'bg-emerald-50 border-emerald-400 text-emerald-700 cursor-pointer' : 'bg-red-50 border-red-400 text-red-700 cursor-pointer')
                            : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100 cursor-pointer'
                      }`}>
                      {value === 'VEG_ONLY' ? <Leaf className="w-3 h-3" /> : <Beef className="w-3 h-3" />} {label}
                    </button>
                    ))
                  )}
                </div>
              </div>
            </SectionCard>
            )}

            <SectionCard title="Module Visibility" description="Enable or disable entire modules. Disabled modules are hidden from the sidebar and blocked from all workflows." icon={Monitor}>
              {visibleModuleToggles.length === 0 ? (
                <EmptyState icon={Monitor} title="No additional module settings" description="The selected business mode and your plan do not expose additional toggles here." />
              ) : (
                <div className="space-y-2">
                  {visibleModuleToggles.map((t) => (
                    <ToggleSwitch key={t.key} checked={settings[t.key] !== false} onChange={(v) => handleFieldChange(t.key, v)}
                      label={t.label} description={t.description} />
                  ))}
                </div>
              )}
              {MODULE_TOGGLES.some((t) => planLocked(t.key) && t.modes.includes(businessMode)) && (
                <p className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  Some settings are hidden because they are not included in your subscription plan.
                </p>
              )}
            </SectionCard>

            {/* Kitchen & KOT — only for kitchen-capable (food) businesses. */}
            {isKitchenBusiness && (
            <SectionCard title="Kitchen & KOT" description="Kitchen ticket configuration" icon={ChefHat}>
              <div className="flex items-center justify-between py-2.5 px-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-slate-700">KOT Printing</p>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#16A34A]/10 text-[#16A34A] text-[9px] font-bold rounded-full uppercase">
                      <Check className="w-2.5 h-2.5" /> Enabled
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-bold rounded-full uppercase">
                      Mandatory
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">KOT printing is required for kitchen operations and cannot be disabled</p>
                </div>
                <div className="relative w-10 h-[22px] rounded-full bg-[#16A34A] opacity-60 shrink-0 ml-3">
                  <span className="absolute top-[2px] left-[18px] w-[18px] h-[18px] bg-white rounded-full shadow-sm" />
                </div>
              </div>
              <p className="text-[10px] text-slate-400">
                Kitchen screen visibility is controlled by the <b>Enable Kitchen (KOT)</b> toggle above.
                KOTs are generated automatically when an order is placed (no extra setting required).
              </p>
            </SectionCard>
            )}
          </div>
        );

      // ═══════════════════════════════════════════ GENERAL ═══════════════════════════════════════════
      case 'general':
        return (
          <div className="space-y-5">
            <SectionCard title="Restaurant Information" description="Manage your restaurant profile and contact details" icon={Building2}>
              <FormGrid>
                <FormField label="Restaurant Name" value={settings.branding.restaurantName} onChange={(v) => handleFieldChange('restaurantName', v, 'branding')} />
                <FormField label="Owner Name" value={settings.branding.ownerName || ''} onChange={(v) => handleFieldChange('ownerName', v, 'branding')} />
                <FormField label="Email" type="email" value={settings.email} onChange={(v) => handleFieldChange('email', v)} />
                <FormField label="Phone" value={settings.contactNumber} onChange={(v) => handleFieldChange('contactNumber', v)} />
                <FormField label="TAX Number" value={settings.gstNumber} onChange={(v) => handleFieldChange('gstNumber', v)} />
                <FormField label="FSSAI Number" value={settings.fssaiNumber || ''} onChange={(v) => handleFieldChange('fssaiNumber', v)} />
                <FormField label="Website" value={settings.website || ''} onChange={(v) => handleFieldChange('website', v)} />
              </FormGrid>
              <FormField label="Address" value={settings.address} onChange={(v) => handleFieldChange('address', v)} className="mt-1" />
              <FormGrid cols={4}>
                <FormField label="City" value={settings.city || ''} onChange={(v) => handleFieldChange('city', v)} />
                <FormField label="State" value={settings.state || ''} onChange={(v) => handleFieldChange('state', v)} />
                <FormField label="Country" value={settings.country || 'India'} onChange={(v) => handleFieldChange('country', v)} />
                <FormField label="Postal Code" value={settings.postalCode || ''} onChange={(v) => handleFieldChange('postalCode', v)} />
              </FormGrid>
            </SectionCard>

            <SectionCard title="Restaurant Logo" description="Upload your restaurant logo for receipts, invoices, and displays" icon={Image}>
              <div className="flex items-start gap-4">
                <div className="relative shrink-0">
                  {settings.branding.logo ? (
                    <div className="relative group">
                      <img src={settings.branding.logo} alt="Logo" className="w-20 h-20 rounded-xl object-cover border border-slate-200" referrerPolicy="no-referrer" />
                      <button onClick={handleDeleteLogo} aria-label="Remove logo" className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center transition-all cursor-pointer hover:bg-red-600 shadow-sm">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center">
                      <Image className="w-8 h-8 text-slate-300" />
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="inline-flex items-center gap-2 px-4 h-8.5 bg-[#16A34A] hover:bg-[#15803D] text-white font-bold rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all shadow-sm">
                    {logoUploading ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...</>
                    ) : (
                      <><Upload className="w-3.5 h-3.5" /> Upload Logo</>
                    )}
                    <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={logoUploading} />
                  </label>
                  <p className="text-[9px] text-slate-400">Max 5MB. JPEG, PNG, GIF, WebP</p>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Receipt" description="Configure receipt display preferences" icon={Receipt}>
              <FormField label="Receipt Footer Message" value={settings.receiptFooterMessage} onChange={(v) => handleFieldChange('receiptFooterMessage', v)} />
            </SectionCard>
          </div>
        );

      // ═══════════════════════════════════════════ POS CONFIG ═══════════════════════════════════════════
      case 'pos':
        return (
          <SectionCard title="POS Configuration" description="Configure currency, time zone, and language" icon={Globe}>
            <FormGrid cols={3}>
              <FormField label="Currency" value={settings.currency} onChange={(v) => handleFieldChange('currency', v)} options={[
                { value: 'INR', label: '₹ INR (Indian Rupee)' },
                { value: 'USD', label: '$ USD (US Dollar)' },
                { value: 'EUR', label: '€ EUR (Euro)' },
                { value: 'GBP', label: '£ GBP (British Pound)' },
                { value: 'AED', label: 'د.إ AED (Dirham)' },
                { value: 'SAR', label: '﷼ SAR (Saudi Riyal)' },
                { value: 'SGD', label: 'S$ SGD (Singapore Dollar)' },
                { value: 'AUD', label: 'A$ AUD (Australian Dollar)' },
              ]} />
              <FormField label="Currency Symbol" value={settings.currencySymbol} disabled />
              <FormField label="Time Zone" value={settings.timezone} onChange={(v) => handleFieldChange('timezone', v)} options={[
                { value: 'Asia/Kolkata', label: 'Asia/Kolkata (UTC+5:30)' },
                { value: 'Asia/Dubai', label: 'Asia/Dubai (UTC+4:00)' },
                { value: 'Asia/Singapore', label: 'Asia/Singapore (UTC+8:00)' },
                { value: 'Asia/Riyadh', label: 'Asia/Riyadh (UTC+3:00)' },
                { value: 'America/New_York', label: 'America/New_York (UTC-5:00)' },
                { value: 'Europe/London', label: 'Europe/London (UTC+0:00)' },
              ]} />
              <FormField label="Language" value={settings.language} onChange={(v) => handleFieldChange('language', v)} options={[
                { value: 'English', label: 'English' },
              ]} disabled />
            </FormGrid>
          </SectionCard>
        );

      // ═══════════════════════════════════════════ BILLING ═══════════════════════════════════════════
      case 'billing':
        return (
          <SectionCard title="Billing Settings" description="Configure invoice, KOT, and bill prefixes and numbering" icon={FileText}>
            <FormGrid cols={3}>
              <FormField label="Invoice Prefix" value={settings.invoicePrefix} onChange={(v) => handleFieldChange('invoicePrefix', v)} />
              <FormField label="KOT Prefix" value={settings.kotPrefix} onChange={(v) => handleFieldChange('kotPrefix', v)} />
              <FormField label="Bill Prefix" value={settings.billPrefix} onChange={(v) => handleFieldChange('billPrefix', v)} />
              <FormField label="Bill Number Start" type="number" value={settings.billNumberStart} onChange={(v) => handleFieldChange('billNumberStart', v)} />
            </FormGrid>
            <div className="border-t border-slate-100 pt-4 mt-4 space-y-2">
              <h5 className="text-[9px] font-black uppercase text-slate-400 tracking-wider mb-2">Billing Behavior</h5>
              <ToggleSwitch checked={settings.roundOffEnabled !== false} onChange={(v) => handleFieldChange('roundOffEnabled', v)}
                label="Round Off"
                description="Round bill totals to the nearest rupee" />
              <ToggleSwitch checked={settings.enableSplitBill !== false} onChange={(v) => handleFieldChange('enableSplitBill', v)}
                label="Split Bill"
                description="Allow splitting a bill across multiple payment methods (Split tab in Billing)" />
              <ToggleSwitch checked={settings.autoPrintBill || false} onChange={(v) => handleFieldChange('autoPrintBill', v)}
                label="Auto Print Bill"
                description="Automatically open the print preview when a payment is completed" />
            </div>
          </SectionCard>
        );

      // ═══════════════════════════════════════════ TAX ═══════════════════════════════════════════
      case 'tax':
        return (
          <div className="space-y-5">
            <SectionCard title="Tax Configuration" description="Configure GST, tax rates, and service charges" icon={Percent}>
              <FormGrid cols={3}>
                <FormField label="Tax Type" value={settings.taxType} onChange={(v) => handleFieldChange('taxType', v)} options={[
                  { value: 'Inclusive', label: 'Inclusive (Tax in Price)' },
                  { value: 'Exclusive', label: 'Exclusive (Tax at Checkout)' },
                ]} />
                <FormField label="GST Rate (%)" type="number" value={settings.gstPercentage} onChange={(v) => handleFieldChange('gstPercentage', v)} suffix="%" />
                <FormField label="Service Charge (%)" type="number" value={settings.serviceCharge} onChange={(v) => handleFieldChange('serviceCharge', v)} suffix="%" />
              </FormGrid>
              <p className="text-[10px] text-slate-400 bg-slate-50 rounded-xl p-3 border border-slate-100">
                GST Rate is used as the default tax for new menu items. The final tax on each order is
                calculated from the item's own tax percentage at billing time.
              </p>
            </SectionCard>
          </div>
        );

      // ═══════════════════════════════════════════ PRINTER ═══════════════════════════════════════════
      case 'printer':
        return (
          <SectionCard title="Printer Configuration" description="Manage printers for receipts and kitchen tickets" icon={Printer}>
            {(settings.printers || []).length === 0 ? (
              <EmptyState icon={Printer} title="No Printers Configured" description="Add a printer to start printing receipts and kitchen tickets"
                action={
                  <button onClick={() => setShowPrinterModal(true)} className="h-8 px-4 bg-[#16A34A] hover:bg-[#15803D] text-white font-bold rounded-xl text-xs uppercase transition-all cursor-pointer shadow-sm" type="button">
                    <Plus className="w-3.5 h-3.5 inline mr-1" /> Add Printer
                  </button>
                } />
            ) : (
              <div className="space-y-2">
                {(settings.printers || []).map((printer) => (
                  <div key={printer.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-slate-200 transition-all group">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${printer.status === 'Online' ? 'bg-emerald-100' : 'bg-red-100'}`}>
                        {printer.status === 'Online' ? <Wifi className="w-4 h-4 text-emerald-600" /> : <WifiOff className="w-4 h-4 text-red-600" />}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">{printer.name}</p>
                        <p className="text-[10px] text-slate-500">{printer.type} · {printer.connection} · {printer.ipOrAddress}:{printer.port}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${printer.status === 'Online' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>{printer.status}</span>
                      <button onClick={() => handleDeletePrinter(printer.id)} aria-label={`Delete printer ${printer.name}`} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all cursor-pointer" type="button">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setShowPrinterModal(true)} className="h-8 px-4 bg-[#16A34A] hover:bg-[#15803D] text-white font-bold rounded-xl text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-sm" type="button">
              <Plus className="w-3.5 h-3.5" /> Add Printer
            </button>
          </SectionCard>
        );

      // ═══════════════════════════════════════════ SECURITY ═══════════════════════════════════════════
      case 'security':
        return (
          <div className="space-y-5">
            <SectionCard title="Terminal Security" description="Authentication for this terminal" icon={Lock}>
              <FormGrid cols={2}>
                <FormField label="Authentication Type" value="password" disabled options={[
                  { value: 'password', label: 'Password (Email + Password)' },
                ]} />
              </FormGrid>
            </SectionCard>

            <SectionCard title="Change Password" description="Securely update your own account password. You will be signed out after a successful change." icon={KeyRound}>
              <form onSubmit={handleChangePassword} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">Current Password</label>
                  <input
                    type="password"
                    value={passwordForm.current}
                    onChange={(e) => setPasswordForm(f => ({ ...f, current: e.target.value }))}
                    placeholder="Enter your current password"
                    autoComplete="current-password"
                    className="w-full h-9 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-[#16A34A] focus:bg-white transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">New Password</label>
                  <input
                    type="password"
                    value={passwordForm.next}
                    onChange={(e) => setPasswordForm(f => ({ ...f, next: e.target.value }))}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    className="w-full h-9 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-[#16A34A] focus:bg-white transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">Confirm New Password</label>
                  <input
                    type="password"
                    value={passwordForm.confirm}
                    onChange={(e) => setPasswordForm(f => ({ ...f, confirm: e.target.value }))}
                    placeholder="Re-enter the new password"
                    autoComplete="new-password"
                    className="w-full h-9 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-[#16A34A] focus:bg-white transition-all"
                  />
                </div>
                <button
                  type="submit"
                  disabled={passwordSaving}
                  className="h-9 px-5 bg-[#16A34A] hover:bg-[#15803D] disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-xl text-[10px] uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  {passwordSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                  {passwordSaving ? 'Changing...' : 'Change Password'}
                </button>
              </form>
            </SectionCard>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-0 animate-fade-in max-w-full pb-3 sm:pb-5">
      {/* Sticky Header with Search + Save/Reset */}
      <div className="sticky top-0 z-30 -mx-3 sm:-mx-5 px-3 sm:px-5 bg-[#F8FAFC]/95 backdrop-blur-md border-b border-slate-200 pt-1 pb-2">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="text-lg font-extrabold text-[#191c1e]">POS Settings</h3>
            <p className="text-[11px] text-slate-500 font-medium">Configure all restaurant, POS, and system preferences</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                fetchSettings();
                addToast('Settings reloaded from database', 'success');
              }}
              disabled={loading}
              className="h-9 px-4 bg-white hover:bg-slate-50 border border-slate-200 disabled:bg-slate-50 disabled:cursor-not-allowed text-slate-500 font-bold rounded-xl text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer"
              type="button"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Reset
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="h-9 px-5 bg-[#16A34A] hover:bg-[#15803D] disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-xl text-[10px] uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              type="button"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative max-w-xs mt-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search settings..."
            className="w-full h-8.5 pl-7.5 pr-8 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-[#16A34A] transition-all"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer" type="button">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Section Tabs */}
        <div className="flex gap-1 border-b border-slate-200 overflow-x-auto no-scrollbar pb-0.5 mt-2">
          {filteredSections.map((sec) => (
            <button
              key={sec.key}
              onClick={() => setActiveSection(sec.key)}
              className={`shrink-0 px-3 py-2 text-[10px] font-bold border-b-2 -mb-px transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeSection === sec.key ? 'border-[#16A34A] text-[#16A34A]' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
              type="button"
            >
              <sec.icon className="w-3.5 h-3.5" />
              {sec.label}
            </button>
          ))}
        </div>
      </div>

      {/* Section Content */}
      <div className="min-h-[300px] pt-4">
        {renderSection()}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-200 rounded-xl shadow-lg px-4 py-3 flex items-center gap-2 text-xs text-red-700 font-semibold max-w-lg animate-slide-down">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span className="flex-1">{error}</span>
          <button onClick={clearError} className="p-1 hover:bg-red-100 rounded text-red-500 cursor-pointer" type="button">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Add Printer Modal */}
      {showPrinterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs" onClick={() => setShowPrinterModal(false)}>
          <div className="bg-white w-full max-w-sm rounded-xl shadow-xl border border-slate-100 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center rounded-t-xl shrink-0">
              <h4 className="font-extrabold text-xs uppercase tracking-wider text-slate-800">Register Printer</h4>
              <button onClick={() => setShowPrinterModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer" type="button"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-3 text-xs overflow-y-auto">
              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase text-slate-400">Printer Name *</label>
                <input value={printerForm.name} onChange={(e) => setPrinterForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g., Kitchen Printer" className="w-full h-8 px-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#16A34A] transition-all" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase text-slate-400">Type</label>
                  <select value={printerForm.type} onChange={(e) => setPrinterForm(p => ({ ...p, type: e.target.value }))} className="w-full h-8 px-1 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#16A34A] transition-all cursor-pointer">
                    {capabilities.kitchen === true && <option value="Kitchen">Kitchen</option>}
                    {capabilities.kitchen === true && <option value="KOT">KOT</option>}
                    <option value="Billing">Billing</option>
                    <option value="Receipt">Receipt</option>
                    <option value="Barcode">Barcode</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase text-slate-400">Connection</label>
                  <select value={printerForm.connection} onChange={(e) => setPrinterForm(p => ({ ...p, connection: e.target.value }))} className="w-full h-8 px-1 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#16A34A] transition-all cursor-pointer">
                    <option value="Network (TCP/IP)">Network (TCP/IP)</option>
                    <option value="USB">USB</option>
                    <option value="Bluetooth">Bluetooth</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase text-slate-400">IP Address *</label>
                  <input value={printerForm.ipOrAddress} onChange={(e) => setPrinterForm(p => ({ ...p, ipOrAddress: e.target.value }))} placeholder="192.168.1.100" className="w-full h-8 px-2 bg-slate-50 border border-slate-200 rounded-lg outline-none font-mono focus:border-[#16A34A] transition-all" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase text-slate-400">Port</label>
                  <input type="number" inputMode="numeric" value={printerForm.port} onChange={(e) => setPrinterForm(p => ({ ...p, port: parseInt(e.target.value) || 9100 }))} className="w-full h-8 px-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#16A34A] transition-all" />
                </div>
              </div>
              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button onClick={() => setShowPrinterModal(false)} className="flex-1 h-9 bg-white hover:bg-slate-50 border border-slate-200 text-slate-500 font-bold rounded-lg text-xs uppercase cursor-pointer transition-all" type="button">Cancel</button>
                <button onClick={handleAddPrinter} className="flex-[2] h-9 bg-[#16A34A] hover:bg-[#15803D] text-white font-bold rounded-lg text-xs uppercase transition-all cursor-pointer shadow-sm" type="button">Register Printer</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
