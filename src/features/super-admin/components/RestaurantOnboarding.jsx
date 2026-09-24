import React, { useState, useEffect, useRef, useCallback } from 'react';
import { superAdminApi } from '../../../api/superAdmin.api';
import { emailError as emailFieldError, emailOptionalError, normalizeEmail } from '../../../utils/email';
import {
  X, Loader2, CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight,
  Building2, Users, FileText, CreditCard, Eye, EyeOff,
  Upload, Trash2, File, Check, ExternalLink, Info,
} from 'lucide-react';
import { BUSINESS_TYPES, filterPlansForBusinessType, modeLabel } from '../../../utils/businessTypes';
import { getBusinessCapabilities, catalogNaming } from '../../../utils/businessCapabilities';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED'];
const COUNTRIES = ['India', 'USA', 'UAE', 'UK', 'Singapore', 'Canada', 'Australia'];

const DOCUMENT_TYPES = [
  { key: 'GST_CERTIFICATE', label: 'GST Certificate', required: true },
  { key: 'FSSAI_LICENSE', label: 'FSSAI License', required: true },
  { key: 'BUSINESS_REGISTRATION', label: 'Business Registration Certificate', required: false },
  { key: 'PAN', label: 'PAN / Business PAN', required: false },
  { key: 'OWNER_ID', label: 'Owner Identity Document', required: false },
  { key: 'ADDRESS_PROOF', label: 'Address Proof', required: false },
  { key: 'OTHER', label: 'Other Supporting Document', required: false },
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

// 5-step platform administrative wizard — NO Agreement step. Super Admin
// creates a tenant on behalf of the platform; mandatory Terms & Privacy
// acceptance belongs to the NEW-USER self-serve registration flow (its Legal
// step), not here.
const STEPS = [
  { id: 1, label: 'Restaurant', icon: Building2 },
  { id: 2, label: 'Owner', icon: Users },
  { id: 3, label: 'Documents', icon: FileText },
  { id: 4, label: 'Plan', icon: CreditCard },
  { id: 5, label: 'Review', icon: Eye },
];
const FINAL_STEP = 5;

export default function RestaurantOnboarding({ onClose, onSaved }) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [plans, setPlans] = useState([]);
  const [completedSteps, setCompletedSteps] = useState(new Set());
  const contentRef = useRef(null);

  // Step 1: Restaurant Info
  const [restaurant, setRestaurant] = useState({
    name: '', businessName: '', businessType: 'RESTAURANT',
    address: '', city: '', state: '', country: 'India', pincode: '',
    phone: '', email: '', website: '', gstNumber: '', fssaiNumber: '',
    timezone: 'Asia/Kolkata', currency: 'INR', language: 'en',
    dietaryMode: 'VEG_AND_NON_VEG', // Food/Dietary Configuration (Part 1)
  });

  // Step 2: Owner Info
  const [owner, setOwner] = useState({
    ownerName: '', ownerEmail: '', ownerPhone: '', alternatePhone: '',
    designation: '', useRestaurantContact: false,
    adminName: '', adminEmail: '', adminPassword: '',
  });

  // Step 3: Documents
  const [documents, setDocuments] = useState({});
  const [uploadingDoc, setUploadingDoc] = useState(null);

  // Step 4: Plan
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [billingCycle, setBillingCycle] = useState('MONTHLY');
  const [trialDays, setTrialDays] = useState(15);

  // Step 6: Result
  const [result, setResult] = useState(null);

  useEffect(() => {
    superAdminApi.getPlans()
      .then((resp) => { if (resp.success) setPlans(resp.data || []); })
      .catch(() => {});
  }, []);

  // Auto-populate owner from restaurant contact
  useEffect(() => {
    if (owner.useRestaurantContact) {
      setOwner(prev => ({
        ...prev,
        ownerEmail: restaurant.email || '',
        ownerPhone: restaurant.phone || '',
        alternatePhone: prev.alternatePhone,
      }));
    }
  }, [owner.useRestaurantContact, restaurant.email, restaurant.phone]);

  const updateRestaurant = (field, value) => {
    setRestaurant(prev => ({ ...prev, [field]: value }));
  };

  const updateOwner = (field, value) => {
    setOwner(prev => ({ ...prev, [field]: value }));
  };

  const scrollToTop = useCallback(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, []);

  const validateStep = (stepNum) => {
    switch (stepNum) {
      case 1:
        if (!restaurant.name.trim()) return 'Restaurant name is required';
        if (!restaurant.address.trim()) return 'Address is required';
        if (!restaurant.city.trim()) return 'City is required';
        if (!restaurant.state.trim()) return 'State is required';
        if (!restaurant.country.trim()) return 'Country is required';
        if (!restaurant.pincode.trim()) return 'Pincode is required';
        if (!restaurant.phone.trim()) return 'Phone number is required';
        return null;
      case 2: {
        if (!owner.ownerName.trim()) return 'Owner name is required';
        const ownerEmailMsg = owner.ownerEmail.trim() ? emailOptionalError(owner.ownerEmail) : 'Owner email is required';
        if (ownerEmailMsg) return ownerEmailMsg;
        if (!owner.ownerPhone.trim()) return 'Owner phone is required';
        if (!owner.adminName.trim()) return 'Admin name is required';
        const adminEmailMsg = emailFieldError(owner.adminEmail);
        if (adminEmailMsg) return adminEmailMsg;
        if (!owner.adminPassword.trim()) return 'Admin password is required';
        if (owner.adminPassword.length < 6) return 'Admin password must be at least 6 characters';
        return null;
      }
      case 3:
        // Documents are optional, but we validate uploaded ones
        return null;
      case 4:
        if (!selectedPlan) return 'Please select a subscription plan';
        return null;
      default:
        return null;
    }
  };

  const goNext = () => {
    const validationError = validateStep(step);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setCompletedSteps(prev => new Set([...prev, step]));
    setStep(prev => Math.min(prev + 1, FINAL_STEP));
    scrollToTop();
  };

  const goBack = () => {
    setError('');
    setStep(prev => Math.max(prev - 1, 1));
    scrollToTop();
  };

  const handleDocumentUpload = async (docType, file) => {
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Only PDF, JPG, JPEG, and PNG files are allowed');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('File size must be less than 10MB');
      return;
    }
    setError('');
    setUploadingDoc(docType);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', docType);
      // We'll store uploads temporarily — they'll be associated after restaurant creation
      setDocuments(prev => ({
        ...prev,
        [docType]: {
          file,
          fileName: file.name,
          fileSize: file.size,
          uploading: true,
        },
      }));
      // Simulate upload progress (actual upload happens on submit)
      setTimeout(() => {
        setDocuments(prev => ({
          ...prev,
          [docType]: {
            ...prev[docType],
            uploading: false,
            uploaded: true,
          },
        }));
        setUploadingDoc(null);
      }, 500);
    } catch (e) {
      setError(e.message || 'Upload failed');
      setUploadingDoc(null);
    }
  };

  const removeDocument = (docType) => {
    setDocuments(prev => {
      const next = { ...prev };
      delete next[docType];
      return next;
    });
  };

  const handleSubmit = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      // Build the onboarding payload
      const payload = {
        // Restaurant info
        name: restaurant.name,
        ownerName: owner.ownerName,
        mobile: restaurant.phone,
        email: restaurant.email || undefined,
        gstNumber: restaurant.gstNumber || undefined,
        fssaiNumber: restaurant.fssaiNumber || undefined,
        address: restaurant.address || undefined,
        country: restaurant.country,
        state: restaurant.state || undefined,
        city: restaurant.city || undefined,
        pincode: restaurant.pincode || undefined,
        timezone: restaurant.timezone,
        currency: restaurant.currency,
        language: restaurant.language,
        businessType: restaurant.businessType || 'RESTAURANT',
        website: restaurant.website || undefined,
        // Food/Dietary Configuration — persisted to tenant RestaurantSetting.
        // Only sent for dietary-capable verticals (server also enforces this).
        dietaryMode: getBusinessCapabilities(restaurant.businessType).dietary
          ? (restaurant.dietaryMode || 'VEG_AND_NON_VEG')
          : undefined,
        // Admin
        adminName: owner.adminName,
        adminEmail: normalizeEmail(owner.adminEmail),
        adminPassword: owner.adminPassword,
        // Plan
        planId: selectedPlan?.id || undefined,
        subscriptionPlan: selectedPlan?.code || undefined,
        trialDays: selectedPlan?.code === 'TRIAL' ? trialDays : undefined,
        // No agreement/policy payload — this wizard is a platform
        // administrative operation with NO Agreement step. Policy consents
        // are recorded only in the new-user self-serve registration flow.
      };

      const resp = await superAdminApi.createRestaurantOnboarding(payload);
      const restaurantId = resp.data?.id;

      // Upload documents if any (after restaurant is created)
      if (restaurantId) {
        const docEntries = Object.entries(documents);
        for (const [docType, docData] of docEntries) {
          if (docData.file) {
            try {
              const formData = new FormData();
              formData.append('file', docData.file);
              formData.append('documentType', docType);
              await superAdminApi.uploadDocument(restaurantId, formData);
            } catch (docErr) {
              console.error('Document upload failed:', docErr);
              // Continue — restaurant is created, document upload failure is non-fatal
            }
          }
        }
      }

      setResult(resp.data);
      setStep(6); // success screen (outside the 5 wizard steps)
      scrollToTop();
    } catch (e) {
      setError(e.message || 'Failed to create restaurant');
    } finally {
      setSaving(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // ── Progress Indicator ──
  const renderProgress = () => (
    <div className="flex items-center justify-center gap-1 mb-6 px-2">
      {STEPS.map((s, i) => {
        const isActive = step === s.id;
        const isCompleted = completedSteps.has(s.id) || step > s.id;
        return (
          <React.Fragment key={s.id}>
            {i > 0 && (
              <div className={`h-px flex-1 max-w-6 ${isCompleted ? 'bg-[#16A34A]' : 'bg-slate-200'}`} />
            )}
            <div className="flex flex-col items-center gap-0.5 min-w-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-extrabold transition-all ${
                isActive
                  ? 'bg-[#16A34A] text-white shadow-md'
                  : isCompleted
                    ? 'bg-[#16A34A]/10 text-[#16A34A] border border-[#16A34A]/30'
                    : 'bg-slate-100 text-slate-400 border border-slate-200'
              }`}>
                {isCompleted && !isActive ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  s.id
                )}
              </div>
              <span className={`text-[8px] font-bold uppercase tracking-wider ${isActive ? 'text-[#16A34A]' : 'text-slate-400'}`}>
                {s.label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );

  // ── Step 1: Restaurant Information ──
  const renderStep1 = () => (
    <div className="space-y-4">
      <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Restaurant Information</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-600">Restaurant Name *</label>
          <input value={restaurant.name} onChange={e => updateRestaurant('name', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" placeholder="e.g. The Food Corner" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-600">Business/Legal Name</label>
          <input value={restaurant.businessName} onChange={e => updateRestaurant('businessName', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" placeholder="Optional" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-600">Business Type</label>
          <select value={restaurant.businessType} onChange={e => {
            updateRestaurant('businessType', e.target.value);
            // Dynamic capability switch (§4): changing the type immediately
            // hides/shows food configuration and drops stale food state for
            // non-food verticals so dietaryMode is never submitted for them.
            const caps = getBusinessCapabilities(e.target.value);
            if (!caps.dietary) updateRestaurant('dietaryMode', null);
            // Mode changes with the type — drop a now-incompatible plan choice.
            if (selectedPlan && !filterPlansForBusinessType(plans, e.target.value).some(p => p.id === selectedPlan.id)) {
              setSelectedPlan(null);
            }
          }} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]">
            {BUSINESS_TYPES.map(bt => <option key={bt.value} value={bt.value}>{bt.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-600">Phone *</label>
          <input value={restaurant.phone} onChange={e => updateRestaurant('phone', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" placeholder="+91 98765 43210" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-600">Email</label>
          <input type="email" value={restaurant.email} onChange={e => updateRestaurant('email', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" placeholder="restaurant@example.com" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-600">Website</label>
          <input value={restaurant.website} onChange={e => updateRestaurant('website', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" placeholder="https://example.com" />
        </div>
      </div>

      <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 pt-2">Address</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1 col-span-2">
          <label className="text-[10px] font-bold text-slate-600">Address *</label>
          <input value={restaurant.address} onChange={e => updateRestaurant('address', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" placeholder="Street address" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-600">City *</label>
          <input value={restaurant.city} onChange={e => updateRestaurant('city', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-600">State *</label>
          <input value={restaurant.state} onChange={e => updateRestaurant('state', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-600">Country *</label>
          <select value={restaurant.country} onChange={e => updateRestaurant('country', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]">
            {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-600">Pincode *</label>
          <input value={restaurant.pincode} onChange={e => updateRestaurant('pincode', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" />
        </div>
      </div>

      <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 pt-2">Legal & Configuration</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-600">GST Number</label>
          <input value={restaurant.gstNumber} onChange={e => updateRestaurant('gstNumber', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-600">FSSAI Number</label>
          <input value={restaurant.fssaiNumber} onChange={e => updateRestaurant('fssaiNumber', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-600">Timezone</label>
          <input value={restaurant.timezone} onChange={e => updateRestaurant('timezone', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-600">Currency</label>
          <select value={restaurant.currency} onChange={e => updateRestaurant('currency', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]">
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {/* Language field removed from this wizard (default 'en' is still
            submitted to the backend; language support itself is untouched). */}
      </div>

      {/* Food / Dietary vs Product / Inventory configuration — driven by the
          centralized capability map. Food verticals configure dietary mode;
          non-food verticals get a product/inventory summary instead (no empty
          gap, no food terminology). Updates immediately on type change (§4). */}
      {getBusinessCapabilities(restaurant.businessType).dietary ? (
        <>
          <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 pt-2">Food / Dietary Configuration</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => updateRestaurant('dietaryMode', 'VEG_ONLY')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${restaurant.dietaryMode === 'VEG_ONLY' ? 'bg-[#16A34A] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Veg Only
            </button>
            <button
              type="button"
              onClick={() => updateRestaurant('dietaryMode', 'VEG_AND_NON_VEG')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${restaurant.dietaryMode !== 'VEG_ONLY' ? 'bg-[#16A34A] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Veg + Non-Veg
            </button>
            <span className="text-[10px] text-slate-400">Maximum food type this business can sell</span>
          </div>
        </>
      ) : (
        <>
          <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 pt-2">Product / Inventory Configuration</h3>
          <div className="flex flex-wrap items-center gap-2">
            {[
              ['Barcode', getBusinessCapabilities(restaurant.businessType).barcode],
              ['Inventory Tracking', getBusinessCapabilities(restaurant.businessType).inventory],
              ['Stock Tracking', getBusinessCapabilities(restaurant.businessType).stock],
              ['Variants', getBusinessCapabilities(restaurant.businessType).variants],
            ].map(([label, enabled]) => (
              <span key={label} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${enabled ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                {enabled ? '✓' : '—'} {label}
              </span>
            ))}
            <span className="text-[10px] text-slate-400">Standard capabilities for this business type — no food/dietary controls</span>
          </div>
        </>
      )}
    </div>
  );

  // ── Step 2: Owner / Contact Information ──
  const renderStep2 = () => (
    <div className="space-y-4">
      <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Owner / Contact Information</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-600">Owner Name *</label>
          <input value={owner.ownerName} onChange={e => updateOwner('ownerName', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-600">Designation / Role</label>
          <input value={owner.designation} onChange={e => updateOwner('designation', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" placeholder="e.g. Owner, Director" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-600">Owner Email *</label>
          <input type="email" value={owner.ownerEmail} onChange={e => updateOwner('ownerEmail', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" disabled={owner.useRestaurantContact} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-600">Owner Phone *</label>
          <input value={owner.ownerPhone} onChange={e => updateOwner('ownerPhone', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" disabled={owner.useRestaurantContact} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-600">Alternate Phone</label>
          <input value={owner.alternatePhone} onChange={e => updateOwner('alternatePhone', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" />
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer mt-2">
        <input
          type="checkbox"
          checked={owner.useRestaurantContact}
          onChange={e => updateOwner('useRestaurantContact', e.target.checked)}
          className="w-4 h-4 rounded border-slate-300 text-[#16A34A] accent-[#16A34A]"
        />
        <span className="text-[10px] font-bold text-slate-600">Use restaurant email/phone as owner contact</span>
      </label>

      <div className="border-t border-slate-100 pt-4 mt-4">
        <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Auto-Create Restaurant Admin</h3>
        <p className="text-[10px] text-slate-400 mt-1 mb-3">An admin user will be created for this restaurant with the specified credentials.</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-600">Admin Name *</label>
            <input value={owner.adminName} onChange={e => updateOwner('adminName', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-600">Admin Email *</label>
            <input type="email" value={owner.adminEmail} onChange={e => updateOwner('adminEmail', e.target.value)} className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-600">Admin Password *</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={owner.adminPassword} onChange={e => updateOwner('adminPassword', e.target.value)} className="w-full h-9 pl-3 pr-9 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A]" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer">
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Step 3: Business Documents ──
  const renderStep3 = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Business Documents</h3>
        <span className="text-[9px] text-slate-400 font-semibold">(For verification during onboarding)</span>
      </div>
      <div className="space-y-3">
        {DOCUMENT_TYPES.map(doc => {
          const docData = documents[doc.key];
          return (
            <div key={doc.key} className="border border-slate-200 rounded-xl p-3 bg-white">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[10px] font-bold text-slate-700">{doc.label}</span>
                  {doc.required ? (
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-600">Required</span>
                  ) : (
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">Optional</span>
                  )}
                </div>
                {docData && (
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-[#16A34A]/10 text-[#16A34A] flex items-center gap-1">
                    <Check className="w-2.5 h-2.5" /> Uploaded
                  </span>
                )}
              </div>

              {docData ? (
                <div className="flex items-center justify-between bg-slate-50 rounded-lg p-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <File className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-slate-700 truncate">{docData.fileName}</p>
                      <p className="text-[9px] text-slate-400">{formatFileSize(docData.fileSize)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {docData.uploading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#16A34A]" />
                    ) : (
                      <button onClick={() => removeDocument(doc.key)} className="p-1 hover:bg-red-50 rounded text-red-500 cursor-pointer" title="Remove">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 h-16 border-2 border-dashed border-slate-200 rounded-lg hover:border-[#16A34A]/50 hover:bg-[#16A34A]/5 transition-all cursor-pointer">
                  <Upload className="w-4 h-4 text-slate-400" />
                  <span className="text-[10px] font-semibold text-slate-500">
                    {uploadingDoc === doc.key ? 'Uploading...' : 'Click to upload'}
                  </span>
                  <span className="text-[9px] text-slate-400">(PDF, JPG, PNG — max 10MB)</span>
                  <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={e => handleDocumentUpload(doc.key, e.target.files[0])} />
                </label>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Step 4: Plan & Subscription ──
  const renderStep4 = () => (
    <div className="space-y-4">
      <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Select Subscription Plan</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Only plans compatible with the business type's mode are shown —
            the backend rejects mismatches at creation with a 400. */}
        {filterPlansForBusinessType(plans.filter(p => p.isActive), restaurant.businessType).map(plan => {
          const isSelected = selectedPlan?.id === plan.id;
          return (
            <button
              key={plan.id}
              onClick={() => { setSelectedPlan(plan); setBillingCycle(plan.billingCycle || 'MONTHLY'); }}
              className={`text-left p-4 rounded-xl border-2 transition-all cursor-pointer ${
                isSelected
                  ? 'border-[#16A34A] bg-[#16A34A]/5 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-extrabold text-slate-800">{plan.name}</span>
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider bg-slate-100 text-slate-500">{modeLabel(plan.businessMode)}</span>
                {isSelected && <CheckCircle2 className="w-4 h-4 text-[#16A34A]" />}
              </div>
              <p className="text-[10px] text-slate-500 mb-2">{plan.description || plan.code}</p>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-extrabold text-slate-800">
                  ₹{billingCycle === 'YEARLY' ? (plan.yearlyPrice || 0) : (plan.monthlyPrice || 0)}
                </span>
                <span className="text-[9px] text-slate-400">/{billingCycle === 'YEARLY' ? 'year' : 'month'}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {(plan.features || []).slice(0, 4).map(f => (
                  <span key={f} className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-[#16A34A]/10 text-[#16A34A]">{f}</span>
                ))}
                {plan.features && plan.features.length > 4 && (
                  <span className="text-[8px] text-slate-400">+{plan.features.length - 4} more</span>
                )}
              </div>
              {plan.trialDays > 0 && (
                <p className="text-[9px] text-blue-600 font-bold mt-2">Trial: {plan.trialDays} days</p>
              )}
            </button>
          );
        })}
      </div>
      {plans.filter(p => p.isActive).length === 0 && (
        <p className="text-[10px] text-slate-400 text-center py-4">No active plans available. Create a plan in Plans Management first.</p>
      )}

      {selectedPlan && (
        <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
          <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-2">Selected Plan Details</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase">Plan</p>
              <p className="text-sm font-extrabold text-slate-800">{selectedPlan.name}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase">Billing Cycle</p>
              <select value={billingCycle} onChange={e => setBillingCycle(e.target.value)} className="mt-1 w-full h-8 px-2 bg-white border border-slate-200 rounded-lg text-[10px] font-semibold outline-none focus:border-[#16A34A]">
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
              </select>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {selectedPlan.maxUsers != null && <div className="bg-white rounded-lg p-2"><p className="text-[8px] font-bold text-slate-400">Users</p><p className="text-xs font-extrabold">{selectedPlan.maxUsers}</p></div>}
            {selectedPlan.maxTables != null && <div className="bg-white rounded-lg p-2"><p className="text-[8px] font-bold text-slate-400">Tables</p><p className="text-xs font-extrabold">{selectedPlan.maxTables}</p></div>}
            {selectedPlan.maxMenuItems != null && <div className="bg-white rounded-lg p-2"><p className="text-[8px] font-bold text-slate-400">Menu Items</p><p className="text-xs font-extrabold">{selectedPlan.maxMenuItems}</p></div>}
            {selectedPlan.maxOrdersPerMonth != null && <div className="bg-white rounded-lg p-2"><p className="text-[8px] font-bold text-slate-400">Orders/Month</p><p className="text-xs font-extrabold">{selectedPlan.maxOrdersPerMonth}</p></div>}
          </div>
        </div>
      )}
    </div>
  );

  // ── Step 5: Review & Confirm ──
  const renderStep5 = () => (
    <div className="space-y-4">
      <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Review & Confirm</h3>

      {/* Restaurant Info */}
      <div className="border border-slate-200 rounded-xl p-4 bg-white">
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="w-3.5 h-3.5 text-slate-400" />
          <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Restaurant</h4>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div><span className="font-bold text-slate-400">Name:</span> <span className="font-semibold text-slate-700">{restaurant.name}</span></div>
          <div><span className="font-bold text-slate-400">Phone:</span> <span className="font-semibold text-slate-700">{restaurant.phone}</span></div>
          <div><span className="font-bold text-slate-400">Email:</span> <span className="font-semibold text-slate-700">{restaurant.email || '—'}</span></div>
          <div><span className="font-bold text-slate-400">Type:</span> <span className="font-semibold text-slate-700">{restaurant.businessType?.replace(/_/g, ' ')}</span></div>
          <div className="col-span-2"><span className="font-bold text-slate-400">Address:</span> <span className="font-semibold text-slate-700">{restaurant.address}, {restaurant.city}, {restaurant.state}, {restaurant.country} {restaurant.pincode}</span></div>
          {restaurant.gstNumber && <div><span className="font-bold text-slate-400">GST:</span> <span className="font-semibold text-slate-700">{restaurant.gstNumber}</span></div>}
          {restaurant.fssaiNumber && <div><span className="font-bold text-slate-400">FSSAI:</span> <span className="font-semibold text-slate-700">{restaurant.fssaiNumber}</span></div>}
        </div>
      </div>

      {/* Owner Info */}
      <div className="border border-slate-200 rounded-xl p-4 bg-white">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-3.5 h-3.5 text-slate-400" />
          <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Owner</h4>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div><span className="font-bold text-slate-400">Name:</span> <span className="font-semibold text-slate-700">{owner.ownerName}</span></div>
          <div><span className="font-bold text-slate-400">Phone:</span> <span className="font-semibold text-slate-700">{owner.ownerPhone}</span></div>
          <div><span className="font-bold text-slate-400">Email:</span> <span className="font-semibold text-slate-700">{owner.ownerEmail}</span></div>
          {owner.designation && <div><span className="font-bold text-slate-400">Designation:</span> <span className="font-semibold text-slate-700">{owner.designation}</span></div>}
          <div><span className="font-bold text-slate-400">Admin:</span> <span className="font-semibold text-slate-700">{owner.adminName} ({owner.adminEmail})</span></div>
        </div>
      </div>

      {/* Documents */}
      <div className="border border-slate-200 rounded-xl p-4 bg-white">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-3.5 h-3.5 text-slate-400" />
          <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Documents</h4>
        </div>
        {Object.keys(documents).length === 0 ? (
          <p className="text-[10px] text-slate-400">No documents uploaded</p>
        ) : (
          <div className="space-y-1.5">
            {Object.entries(documents).map(([key, doc]) => (
              <div key={key} className="flex items-center gap-2 text-[10px]">
                <Check className="w-3 h-3 text-[#16A34A]" />
                <span className="font-semibold text-slate-700">{DOCUMENT_TYPES.find(d => d.key === key)?.label || key}</span>
                <span className="text-slate-400">— {doc.fileName}</span>
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">Pending</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Subscription */}
      <div className="border border-slate-200 rounded-xl p-4 bg-white">
        <div className="flex items-center gap-2 mb-3">
          <CreditCard className="w-3.5 h-3.5 text-slate-400" />
          <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Subscription</h4>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div><span className="font-bold text-slate-400">Plan:</span> <span className="font-semibold text-slate-700">{selectedPlan?.name || '—'}</span></div>
          <div><span className="font-bold text-slate-400">Billing:</span> <span className="font-semibold text-slate-700">{billingCycle}</span></div>
          {selectedPlan?.trialDays > 0 && <div><span className="font-bold text-slate-400">Trial:</span> <span className="font-semibold text-slate-700">{selectedPlan.trialDays} days</span></div>}
        </div>
      </div>

      {/* Agreements section removed — Super Admin creation is a platform
          administrative operation with no consent step. */}

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
        <p className="text-[10px] font-semibold text-amber-700">Once created, the restaurant will be added as a tenant on the platform with its own isolated data, settings, and subscription.</p>
      </div>
    </div>
  );

  // ── Success screen (after the 5 wizard steps) ──
  const renderSuccess = () => (
    <div className="text-center py-8">
      <div className="w-16 h-16 rounded-full bg-[#16A34A]/10 border border-[#16A34A]/20 flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 className="w-8 h-8 text-[#16A34A]" />
      </div>
      <h2 className="text-lg font-extrabold text-slate-800 mb-2">Restaurant Created!</h2>
      <p className="text-xs text-slate-500 mb-6 max-w-sm mx-auto">
        <span className="font-bold">{result?.name}</span> has been successfully created and added as a tenant on the platform.
      </p>
      <div className="bg-slate-50 rounded-xl p-4 max-w-sm mx-auto mb-6 text-left">
        <div className="space-y-2 text-[10px]">
          <div className="flex justify-between"><span className="font-bold text-slate-400">Restaurant ID:</span><span className="font-semibold text-slate-700">#{result?.id}</span></div>
          <div className="flex justify-between"><span className="font-bold text-slate-400">Plan:</span><span className="font-semibold text-slate-700">{result?.plan || selectedPlan?.code}</span></div>
          {result?.admin && (
            <div className="flex justify-between"><span className="font-bold text-slate-400">Admin:</span><span className="font-semibold text-slate-700">{result.admin.email}</span></div>
          )}
        </div>
      </div>
      <button
        onClick={() => { onSaved(); onClose(); }}
        className="h-9 px-6 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
      >
        Done
      </button>
    </div>
  );

  const renderContent = () => {
    switch (step) {
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      case 4: return renderStep4();
      case 5: return renderStep5();
      case 6: return renderSuccess();
      default: return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto py-8" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl mx-4 animate-slide-up" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-extrabold text-slate-800">
              {step === 6 ? 'Onboarding Complete' : 'Add Restaurant — Onboarding'}
            </h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {step === 6 ? 'Restaurant successfully created' : `Step ${step} of ${FINAL_STEP}`}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-all cursor-pointer">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Progress */}
        {step <= FINAL_STEP && renderProgress()}

        {/* Error */}
        {error && (
          <div className="mx-6 mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs font-semibold text-red-600 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        )}

        {/* Content */}
        <div ref={contentRef} className="px-6 pb-4 max-h-[60vh] overflow-y-auto">
          {renderContent()}
        </div>

        {/* Actions */}
        {step <= FINAL_STEP && (
          <div className="flex justify-between items-center px-6 py-4 border-t border-slate-100">
            <div>
              {step > 1 && (
                <button
                  onClick={goBack}
                  className="h-9 px-4 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Back
                </button>
              )}
            </div>
            <div className="flex gap-2">
              {step < FINAL_STEP ? (
                <button
                  onClick={goNext}
                  className="h-9 px-5 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="h-9 px-5 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  {saving ? 'Creating...' : 'Confirm & Create Restaurant'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
