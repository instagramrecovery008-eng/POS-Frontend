import React, { useState, useEffect, useRef } from 'react';
import { superAdminApi } from '../../../api/superAdmin.api';
import { X, Loader2, Eye, EyeOff } from 'lucide-react';
import { emailError as emailFieldError, emailOptionalError, normalizeEmail } from '../../../utils/email';
import { getBusinessCapabilities } from '../../../utils/businessCapabilities';
import { BUSINESS_TYPES, filterPlansForBusinessType } from '../../../utils/businessTypes';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED'];
const LANGUAGES = ['en', 'hi', 'gu', 'fr', 'ar'];
const COUNTRIES = ['India', 'USA', 'UAE', 'UK', 'Singapore', 'Canada', 'Australia'];

export default function RestaurantForm({ restaurant, onClose, onSaved }) {
  const isEdit = !!restaurant;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [plans, setPlans] = useState([]);

  useEffect(() => {
    superAdminApi.getPlans()
      .then((resp) => { if (resp.success) setPlans(resp.data || []); })
      .catch(() => {});
  }, []);

  const [form, setForm] = useState({
    name: restaurant?.name || '',
    ownerName: restaurant?.ownerName || '',
    email: restaurant?.email || '',
    mobile: restaurant?.phone || '',
    gstNumber: restaurant?.gstNumber || '',
    fssaiNumber: restaurant?.fssaiNumber || '',
    address: restaurant?.address || '',
    country: restaurant?.country || 'India',
    state: restaurant?.state || '',
    city: restaurant?.city || '',
    pincode: restaurant?.pincode || '',
    timezone: restaurant?.timezone || 'Asia/Kolkata',
    currency: restaurant?.currency || 'INR',
    language: restaurant?.language || 'en',
    // Food/Dietary Configuration — current tenant value (restaurantDetails)
    dietaryMode: restaurant?.dietaryMode || 'VEG_AND_NON_VEG',
    subscriptionPlan: restaurant?.plan || '',
    planId: restaurant?.planId || '',
    businessType: restaurant?.businessType || 'RESTAURANT',
    trialDays: 15,
    logo: restaurant?.logo || '',
    // Admin fields (for create only)
    adminName: '',
    adminEmail: '',
    adminPassword: '',
  });

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const savingRef = useRef(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (savingRef.current) return; // double-click guard
    setError('');

    if (!form.name.trim()) { setError('Restaurant name is required'); return; }
    if (!form.ownerName.trim()) { setError('Owner name is required'); return; }
    if (!form.mobile.trim()) { setError('Mobile number is required'); return; }

    // For creation, validate admin fields. NO legal-acceptance gating —
    // Super Admin → Add Restaurant is a PLATFORM ADMINISTRATIVE operation;
    // mandatory Terms/Privacy acceptance belongs to the new-user
    // self-serve registration flow only.
    if (!isEdit) {
      if (!form.adminName.trim()) { setError('Admin name is required'); return; }
      const adminEmailMsg = emailFieldError(form.adminEmail);
      if (adminEmailMsg) { setError(adminEmailMsg); return; }
      if (!form.adminPassword.trim()) { setError('Admin password is required'); return; }
      if (form.adminPassword.length < 6) { setError('Admin password must be at least 6 characters'); return; }
    }

    savingRef.current = true;
    setSaving(true);
    try {
      if (isEdit) {
        await superAdminApi.updateRestaurant(restaurant.id, {
          name: form.name,
          ownerName: form.ownerName,
          email: form.email || undefined,
          mobile: form.mobile,
          gstNumber: form.gstNumber || undefined,
          fssaiNumber: form.fssaiNumber || undefined,
          address: form.address || undefined,
          country: form.country,
          state: form.state || undefined,
          city: form.city || undefined,
          pincode: form.pincode || undefined,
          timezone: form.timezone,
          currency: form.currency,
          language: form.language,
          logo: form.logo || undefined,
          // Dietary mode change updates tenant RestaurantSetting; existing
          // menu items are never silently modified.
          dietaryMode: form.dietaryMode || undefined,
        });
      } else {
        // Plan eligibility mirrors onboarding: only plans whose businessMode
        // matches the SELECTED business type are offered, and the chosen plan
        // is re-validated server-side on createRestaurant.
        const eligiblePlans = filterPlansForBusinessType(plans, form.businessType);
        const selectedPlan = eligiblePlans.find((p) => p.code === form.subscriptionPlan);
        await superAdminApi.createRestaurant({
          ...form,
          email: form.email ? normalizeEmail(form.email) : '',
          adminEmail: normalizeEmail(form.adminEmail),
          planId: selectedPlan?.id || undefined,
        });
      }
      onSaved();
    } catch (e) {
      setError(e.message || 'Failed to save restaurant');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto py-8" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl mx-4 animate-slide-up" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-extrabold text-slate-800">{isEdit ? 'Edit Restaurant' : 'Create Restaurant'}</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">{isEdit ? 'Update restaurant details' : 'Add a new restaurant to the platform'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-all cursor-pointer">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs font-semibold text-red-600">
              {error}
            </div>
          )}

          {/* Basic Info */}
          <div className="space-y-3">
            <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Basic Information</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600">Restaurant Name *</label>
                <input value={form.name} onChange={e => handleChange('name', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600">Owner Name *</label>
                <input value={form.ownerName} onChange={e => handleChange('ownerName', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600">Email</label>
                <input type="email" value={form.email} onChange={e => handleChange('email', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600">Mobile *</label>
                <input value={form.mobile} onChange={e => handleChange('mobile', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" />
              </div>
            </div>
          </div>

          {/* Legal */}
          <div className="space-y-3">
            <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Legal & Address</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600">GST Number</label>
                <input value={form.gstNumber} onChange={e => handleChange('gstNumber', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600">FSSAI Number</label>
                <input value={form.fssaiNumber} onChange={e => handleChange('fssaiNumber', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" />
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-[10px] font-bold text-slate-600">Address</label>
                <input value={form.address} onChange={e => handleChange('address', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600">Country</label>
                <select value={form.country} onChange={e => handleChange('country', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]">
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600">State</label>
                <input value={form.state} onChange={e => handleChange('state', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600">City</label>
                <input value={form.city} onChange={e => handleChange('city', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600">Pincode</label>
                <input value={form.pincode} onChange={e => handleChange('pincode', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" />
              </div>
            </div>
          </div>

          {/* Configuration */}
          <div className="space-y-3">
            <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Configuration</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600">Timezone</label>
                <input value={form.timezone} onChange={e => handleChange('timezone', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600">Currency</label>
                <select value={form.currency} onChange={e => handleChange('currency', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]">
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600">Language</label>
                <select value={form.language} onChange={e => handleChange('language', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]">
                  {LANGUAGES.map(l => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                </select>
              </div>
            </div>

            {/* Food / Dietary Configuration (Part 1) — same control as the
                wizard; hidden for non-food business types (capability map). */}
            {getBusinessCapabilities(restaurant?.businessType).dietary && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-600">Food / Dietary Configuration</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleChange('dietaryMode', 'VEG_ONLY')}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${form.dietaryMode === 'VEG_ONLY' ? 'bg-[#16A34A] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  Veg Only
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('dietaryMode', 'VEG_AND_NON_VEG')}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${form.dietaryMode === 'VEG_AND_NON_VEG' ? 'bg-[#16A34A] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  Veg + Non-Veg
                </button>
                <span className="text-[10px] text-slate-400">Maximum food type this restaurant can sell</span>
              </div>
            </div>
            )}
          </div>

          {/* Subscription */}
          <div className="space-y-3">
            <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Subscription</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600">Business Type</label>
                <select value={form.businessType} onChange={e => {
                  handleChange('businessType', e.target.value);
                  // Type changed → drop a now-ineligible plan choice.
                  if (!filterPlansForBusinessType(plans, e.target.value).some(p => p.code === form.subscriptionPlan)) {
                    handleChange('subscriptionPlan', '');
                  }
                }} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" disabled={isEdit}>
                  {BUSINESS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600">Plan</label>
                <select value={form.subscriptionPlan} onChange={e => handleChange('subscriptionPlan', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" disabled={isEdit}>
                  <option value="">Select a plan…</option>
                  {filterPlansForBusinessType(plans, form.businessType).filter(p => p.isActive).map(p => (
                    <option key={p.id} value={p.code}>{p.name} ({p.code})</option>
                  ))}
                </select>
                {isEdit && (
                  <p className="text-[9px] text-slate-400 mt-1">Plan changes are made from the Upgrade / Downgrade actions.</p>
                )}
              </div>
              {!isEdit && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600">Trial Days</label>
                  <input type="number" inputMode="numeric" value={form.trialDays} onChange={e => handleChange('trialDays', parseInt(e.target.value) || 15)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" />
                </div>
              )}
            </div>
          </div>

          {/* Admin Creation (only for new) */}
          {!isEdit && (
            <>
              <div className="space-y-3">
                <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Auto-Create Restaurant Admin</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-600">Admin Name *</label>
                    <input value={form.adminName} onChange={e => handleChange('adminName', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-600">Admin Email *</label>
                    <input type="email" value={form.adminEmail} onChange={e => handleChange('adminEmail', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-600">Admin Password *</label>
                    <div className="relative">
                      <input type={showPassword ? 'text' : 'password'} value={form.adminPassword} onChange={e => handleChange('adminPassword', e.target.value)} className="w-full h-9 pl-3 pr-9 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer">
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400">An admin user will be automatically created for this restaurant with the specified credentials.</p>
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className="h-9 px-5 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="h-9 px-5 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {isEdit ? 'Save Changes' : 'Create Restaurant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
