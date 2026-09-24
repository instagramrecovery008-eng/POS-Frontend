import React, { useState, useEffect } from 'react';
import { superAdminApi } from '../../../api/superAdmin.api';
import { FEATURE_LABELS } from '../../../utils/permissions';
import {
  ArrowLeft,
  Loader2,
  Building2,
  Mail,
  Phone,
  MapPin,
  FileText,
  CreditCard,
  TrendingUp,
  TrendingDown,
  RotateCcw,
  PlayCircle,
  XCircle,
  CheckCircle2,
  History,
  Users,
  Layers,
  Utensils,
  Printer,
  Network,
  ShoppingCart,
  HardDrive,
  Upload,
  Trash2,
  File,
  Check,
  AlertTriangle,
  ShieldCheck,
  Eye,
  RefreshCw,
} from 'lucide-react';
import API_BASE_URL from '../../../config/apiConfig';
import PlanChangeDialog from '../components/PlanChangeDialog';

// Derive backend base URL from the API config (e.g. http://localhost:5001/api → http://localhost:5001)
const BACKEND_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '');

const TABS = [
  { id: 'general', label: 'General', icon: Building2 },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'subscription', label: 'Subscription', icon: CreditCard },
];

const CHANGE_TYPE_BADGES = {
  CREATION: 'bg-blue-50 text-blue-600',
  UPGRADE: 'bg-green-50 text-green-600',
  DOWNGRADE: 'bg-amber-50 text-amber-600',
  RENEWAL: 'bg-blue-50 text-blue-600',
  SUSPENSION: 'bg-amber-50 text-amber-600',
  REACTIVATION: 'bg-green-50 text-green-600',
  CANCELLATION: 'bg-red-50 text-red-600',
  EXPIRATION: 'bg-red-50 text-red-600',
};

const LIMIT_ITEMS = [
  { key: 'maxUsers', label: 'Max Users', icon: Users },
  { key: 'maxTables', label: 'Max Tables', icon: Layers },
  { key: 'maxFloors', label: 'Max Floors', icon: Building2 },
  { key: 'maxMenuItems', label: 'Max Menu Items', icon: Utensils },
  { key: 'maxPrinters', label: 'Max Printers', icon: Printer },
  { key: 'maxBranches', label: 'Max Branches', icon: Network },
  { key: 'maxOrdersPerMonth', label: 'Max Orders/Month', icon: ShoppingCart },
  { key: 'storageLimitMB', label: 'Storage (MB)', icon: HardDrive },
];

const DOC_TYPE_LABELS = {
  GST_CERTIFICATE: 'GST Certificate',
  FSSAI_LICENSE: 'FSSAI License',
  BUSINESS_REGISTRATION: 'Business Registration',
  PAN: 'PAN / Business PAN',
  OWNER_ID: 'Owner Identity',
  ADDRESS_PROOF: 'Address Proof',
  OTHER: 'Other Document',
};

const DOC_STATUS_STYLES = {
  PENDING: 'bg-amber-50 text-amber-600 border-amber-200',
  UNDER_REVIEW: 'bg-blue-50 text-blue-600 border-blue-200',
  VERIFIED: 'bg-green-50 text-green-600 border-green-200',
  REJECTED: 'bg-red-50 text-red-600 border-red-200',
};

export default function RestaurantDetail({ restaurantId, onBack, onPlanChanged }) {
  const [restaurant, setRestaurant] = useState(null);
  const [plans, setPlans] = useState([]);
  const [history, setHistory] = useState([]);
  const [payments, setPayments] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [policyAgreements, setPolicyAgreements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('general');
  const [planDialog, setPlanDialog] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busyAction, setBusyAction] = useState(null);

  useEffect(() => {
    loadDetails();
    loadPlans();
  }, [restaurantId]);

  const loadDetails = async () => {
    try {
      setLoading(true);
      const [restResp, histResp, payResp, docsResp, paResp] = await Promise.all([
        superAdminApi.getRestaurant(restaurantId),
        superAdminApi.getSubscriptionHistory(restaurantId).catch(() => null),
        superAdminApi.getSubscriptionPayments(restaurantId).catch(() => null),
        superAdminApi.getDocuments(restaurantId).catch(() => null),
        superAdminApi.getPolicyAgreements(restaurantId).catch(() => null),
      ]);
      if (restResp.success) setRestaurant(restResp.data);
      if (histResp && histResp.success) setHistory(histResp.data || []);
      if (payResp && payResp.success) setPayments(payResp.data || []);
      if (docsResp && docsResp.success) setDocuments(docsResp.data || []);
      if (paResp && paResp.success) setPolicyAgreements(paResp.data || []);
    } catch (e) {
      console.error('Failed to load restaurant details:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadPlans = async () => {
    try {
      const resp = await superAdminApi.getPlans();
      if (resp.success) setPlans(resp.data || []);
    } catch (e) {
      console.error('Failed to load plans:', e);
    }
  };

  const refresh = async () => {
    await loadDetails();
    if (onPlanChanged) onPlanChanged();
  };

  const handleVerifyDocument = async (docId) => {
    setBusyAction(docId);
    try {
      await superAdminApi.verifyDocument(restaurantId, docId);
      await refresh();
    } catch (e) {
      console.error('Verify failed:', e);
    } finally {
      setBusyAction(null);
    }
  };

  const handleRejectDocument = async () => {
    if (!rejectModal || !rejectReason.trim()) return;
    setBusyAction(rejectModal.id);
    try {
      await superAdminApi.rejectDocument(restaurantId, rejectModal.id, rejectReason.trim());
      setRejectModal(null);
      setRejectReason('');
      await refresh();
    } catch (e) {
      console.error('Reject failed:', e);
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteDocument = async (docId) => {
    if (!confirm('Delete this document?')) return;
    setBusyAction(docId);
    try {
      await superAdminApi.deleteDocument(restaurantId, docId);
      await refresh();
    } catch (e) {
      console.error('Delete failed:', e);
    } finally {
      setBusyAction(null);
    }
  };

  const sub = restaurant?.subscription;
  const features = Array.isArray(sub?.features) ? sub.features : [];
  const daysRemaining = sub?.expiryDate
    ? Math.max(0, Math.ceil((new Date(sub.expiryDate) - new Date()) / 86400000))
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[#16A34A]" />
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-400 font-medium">Restaurant not found</p>
        <button onClick={onBack} className="mt-4 text-sm text-[#16A34A] font-bold cursor-pointer">Go back</button>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Back button & header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 hover:bg-slate-100 rounded-lg transition-all cursor-pointer">
          <ArrowLeft className="w-4 h-4 text-slate-500" />
        </button>
        <div>
          <h1 className="text-xl font-extrabold text-slate-800">{restaurant.name}</h1>
          <p className="text-xs text-slate-500">{restaurant.ownerName} • {restaurant.city || 'No city'}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex border-b border-slate-100">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer shrink-0 ${
                activeTab === tab.id
                  ? 'border-[#16A34A] text-[#16A34A]'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {activeTab === 'general' && (
            <div className="space-y-6">
              {/* General Information */}
              <div>
                <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-3">General Information</h3>
                {/* Onboarding Status */}
                {restaurant.onboardingStatus && (
                  <div className="mb-3">
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                      restaurant.onboardingStatus === 'ACTIVE' ? 'bg-green-50 text-green-600 border-green-200' :
                      restaurant.onboardingStatus === 'PENDING_DOCUMENT_REVIEW' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                      restaurant.onboardingStatus === 'REJECTED' ? 'bg-red-50 text-red-600 border-red-200' :
                      'bg-slate-50 text-slate-500 border-slate-200'
                    }`}>Onboarding: {restaurant.onboardingStatus.replace(/_/g, ' ')}</span>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                      <Building2 className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Restaurant Name</p>
                        <p className="text-sm font-bold text-slate-700 mt-0.5">{restaurant.name || '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                      <Users className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Owner / Contact Person</p>
                        <p className="text-sm font-bold text-slate-700 mt-0.5">{restaurant.ownerName || '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                      <Mail className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Email</p>
                        <p className="text-sm font-bold text-slate-700 mt-0.5">{restaurant.email || '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                      <Phone className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Phone</p>
                        <p className="text-sm font-bold text-slate-700 mt-0.5">{restaurant.phone || '—'}</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                      <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Address</p>
                        <p className="text-sm font-bold text-slate-700 mt-0.5">{restaurant.address || '—'}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {[restaurant.city, restaurant.state, restaurant.country].filter(Boolean).join(', ')}
                        </p>
                        {restaurant.pincode && <p className="text-xs text-slate-500">{restaurant.pincode}</p>}
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                      <FileText className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Business Details</p>
                        <div className="space-y-1 mt-1">
                          <p className="text-xs text-slate-600"><span className="font-bold text-slate-500">GST:</span> {restaurant.gstNumber || '—'}</p>
                          <p className="text-xs text-slate-600"><span className="font-bold text-slate-500">FSSAI:</span> {restaurant.fssaiNumber || '—'}</p>
                          <p className="text-xs text-slate-600"><span className="font-bold text-slate-500">Timezone:</span> {restaurant.timezone}</p>
                          <p className="text-xs text-slate-600"><span className="font-bold text-slate-500">Currency:</span> {restaurant.currency}</p>
                          <p className="text-xs text-slate-600"><span className="font-bold text-slate-500">Language:</span> {restaurant.language}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'documents' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Business Documents</h3>
                <button onClick={refresh} className="h-7 px-2.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 flex items-center gap-1 hover:bg-slate-50 cursor-pointer">
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              </div>

              {documents.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-500">No documents uploaded</p>
                  <p className="text-[10px] text-slate-400 mt-1">Documents are uploaded during restaurant onboarding</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div key={doc.id} className="border border-slate-200 rounded-xl p-3 bg-white flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-[10px] font-bold text-slate-700">{DOC_TYPE_LABELS[doc.documentType] || doc.documentType}</p>
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${DOC_STATUS_STYLES[doc.status] || 'bg-slate-50 text-slate-500 border-slate-200'}`}>{doc.status}</span>
                          </div>
                          <p className="text-[9px] text-slate-400 mt-0.5">
                            {doc.originalFileName} {doc.fileSize ? `• ${(doc.fileSize / 1024).toFixed(1)} KB` : ''}
                          </p>
                          <p className="text-[9px] text-slate-400">Uploaded {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : '—'}{doc.uploader ? ` by ${doc.uploader.name}` : ''}</p>
                          {doc.status === 'REJECTED' && doc.rejectionReason && (
                            <p className="text-[9px] text-red-500 font-semibold mt-0.5">Reason: {doc.rejectionReason}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {doc.fileReference && (
                          <button
                            onClick={() => {
                              // Documents are private — download through the
                              // authorized SUPER_ADMIN endpoint (never public /uploads).
                              const token = encodeURIComponent(localStorage.getItem('pos_token') || '');
                              const docUrl = `${BACKEND_BASE_URL}/api/super-admin/restaurants/${restaurant.id}/documents/${doc.id}/download?token=${token}`;
                              window.open(docUrl, '_blank', 'noopener,noreferrer');
                            }}
                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 cursor-pointer"
                            title="View"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {doc.status !== 'VERIFIED' && (
                          <button onClick={() => handleVerifyDocument(doc.id)} disabled={busyAction === doc.id} className="p-1.5 hover:bg-green-50 rounded-lg text-green-600 cursor-pointer disabled:opacity-50" title="Verify">
                            {busyAction === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        {doc.status !== 'REJECTED' && (
                          <button onClick={() => { setRejectModal(doc); setRejectReason(''); }} className="p-1.5 hover:bg-red-50 rounded-lg text-red-600 cursor-pointer" title="Reject">
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={() => handleDeleteDocument(doc.id)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 cursor-pointer" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Policy Agreements */}
              {policyAgreements.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-3">Policy Agreements</h3>
                  <div className="space-y-2">
                    {policyAgreements.map((pa) => (
                      <div key={pa.id} className="border border-slate-200 rounded-xl p-3 bg-white flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <ShieldCheck className="w-4 h-4 text-[#16A34A]" />
                          <div>
                            <p className="text-[10px] font-bold text-slate-700">{pa.policyType?.replace(/_/g, ' ')}</p>
                            <p className="text-[9px] text-slate-400">Version {pa.policyVersion} • Accepted {pa.acceptedAt ? new Date(pa.acceptedAt).toLocaleString() : '—'}{pa.accepter ? ` by ${pa.accepter.name}` : ''}</p>
                          </div>
                        </div>
                        <CheckCircle2 className="w-4 h-4 text-[#16A34A]" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'subscription' && (
            <div className="space-y-4">
              {!sub ? (
                <p className="text-xs text-slate-400 text-center py-8">No subscription found for this restaurant.</p>
              ) : (
                <>
                  {/* Status banner */}
                  <div className={`p-4 rounded-xl border flex items-center justify-between flex-wrap gap-3 ${
                    sub.status === 'ACTIVE' ? 'bg-green-50/60 border-green-200' :
                    sub.status === 'TRIAL' ? 'bg-blue-50/60 border-blue-200' :
                    sub.status === 'EXPIRED' ? 'bg-red-50/60 border-red-200' :
                    sub.status === 'CANCELLED' ? 'bg-slate-50 border-slate-200' : 'bg-amber-50/60 border-amber-200'
                  }`}>
                    <div className="flex items-center gap-3">
                      <CreditCard className="w-5 h-5 text-slate-500" />
                      <div>
                        <p className="text-sm font-extrabold text-slate-800">
                          {sub.plan} {sub.status === 'ACTIVE' && daysRemaining !== null ? `· ${daysRemaining} days left` : `· ${sub.status}`}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {sub.billingCycle} billing {sub.amount ? `· ₹${sub.amount}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      <button onClick={() => setPlanDialog({ mode: 'upgrade' })} className="h-7 px-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer"><TrendingUp className="w-3 h-3" /> Upgrade</button>
                      <button onClick={() => setPlanDialog({ mode: 'downgrade' })} className="h-7 px-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer"><TrendingDown className="w-3 h-3" /> Downgrade</button>
                      <button onClick={() => setPlanDialog({ mode: 'renew' })} className="h-7 px-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer"><RotateCcw className="w-3 h-3" /> Renew</button>
                      {sub.status !== 'ACTIVE' && sub.status !== 'TRIAL' && (
                        <button onClick={() => setPlanDialog({ mode: 'activate' })} className="h-7 px-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer"><PlayCircle className="w-3 h-3" /> Activate</button>
                      )}
                      {sub.status !== 'CANCELLED' && (
                        <button onClick={() => setPlanDialog({ mode: 'cancel' })} className="h-7 px-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer"><XCircle className="w-3 h-3" /> Cancel</button>
                      )}
                    </div>
                  </div>

                  {/* Key dates */}
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-2">Subscription Dates</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="bg-slate-50 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-slate-500 uppercase">Start Date</p>
                        <p className="text-sm font-extrabold text-slate-800 mt-1">{sub.startDate ? new Date(sub.startDate).toLocaleDateString() : '—'}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-slate-500 uppercase">Expiry Date</p>
                        <p className="text-sm font-extrabold text-slate-800 mt-1">{sub.expiryDate ? new Date(sub.expiryDate).toLocaleDateString() : '—'}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-slate-500 uppercase">Next Renewal</p>
                        <p className="text-sm font-extrabold text-slate-800 mt-1">{sub.nextRenewalDate ? new Date(sub.nextRenewalDate).toLocaleDateString() : '—'}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-slate-500 uppercase">Days Remaining</p>
                        <p className={`text-sm font-extrabold mt-1 ${daysRemaining !== null && daysRemaining <= 10 ? 'text-red-600' : 'text-slate-800'}`}>
                          {daysRemaining !== null ? `${daysRemaining} days` : '—'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Limits */}
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-2">Plan Limits</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                      {LIMIT_ITEMS.map((item) => (
                        <div key={item.key} className="bg-white border border-slate-100 rounded-xl p-2.5 flex items-center gap-2">
                          <item.icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">{item.label}</p>
                            <p className="text-sm font-extrabold text-slate-800 mt-0.5">
                              {sub[item.key] === null || sub[item.key] === undefined ? 'Unlimited' : sub[item.key]}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Features */}
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-2">Enabled Features ({features.length})</p>
                    <div className="flex flex-wrap gap-1.5">
                      {features.length === 0 && <span className="text-[10px] text-slate-400">No features snapshot</span>}
                      {features.map((f) => (
                        <span key={f} className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg bg-[#16A34A]/10 text-[#16A34A] border border-[#16A34A]/20">
                          <CheckCircle2 className="w-3 h-3" /> {FEATURE_LABELS[f] || f}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* History */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <History className="w-3.5 h-3.5 text-slate-400" />
                      <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Plan History</p>
                    </div>
                    {history.length === 0 ? (
                      <p className="text-[10px] text-slate-400">No plan changes recorded yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {history.map((h) => (
                          <div key={h.id} className="flex items-start gap-3 p-2.5 bg-slate-50/60 rounded-xl">
                            <div className="flex flex-col items-center mt-0.5">
                              <div className="w-2 h-2 rounded-full bg-[#16A34A] shrink-0" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${CHANGE_TYPE_BADGES[h.changeType] || 'bg-slate-100 text-slate-600'}`}>{h.changeType}</span>
                                <span className="text-[10px] font-bold text-slate-600">
                                  {h.previousPlan || '—'} → {h.newPlan || '—'}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                {h.createdAt ? new Date(h.createdAt).toLocaleString() : ''}
                                {h.changedBy ? ' · by Super Admin' : ' · system'}
                                {h.notes ? ` · ${h.notes}` : ''}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Payments */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-2 mt-4">
                      <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                      <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Payment History</p>
                    </div>
                    {payments.length === 0 ? (
                      <p className="text-[10px] text-slate-400">No gateway payments recorded yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {payments.map((p) => (
                          <div key={p.id} className="flex items-start gap-3 p-2.5 bg-slate-50/60 rounded-xl">
                            <div className="flex flex-col items-center mt-0.5">
                              <div className={`w-2 h-2 rounded-full shrink-0 ${p.status === 'PAID' ? 'bg-[#16A34A]' : p.status === 'FAILED' ? 'bg-red-500' : 'bg-slate-300'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${p.status === 'PAID' ? 'bg-[#16A34A]/10 text-[#16A34A]' : p.status === 'FAILED' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'}`}>{p.status}</span>
                                <span className="text-[10px] font-bold text-slate-600">
                                  {p.planName || p.planCode} · {p.action || '—'}
                                </span>
                                <span className="text-[10px] font-mono font-bold text-slate-500">₹{Number(p.amount || 0).toFixed(2)}</span>
                              </div>
                              <p className="text-[10px] text-slate-400 mt-0.5 font-mono truncate">
                                {p.createdAt ? new Date(p.createdAt).toLocaleString() : ''}
                                {p.paymentMethod ? ` · ${p.paymentMethod}` : ''}
                                {p.razorpayPaymentId ? ` · ${p.razorpayPaymentId}` : ''}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Plan change dialog */}
      {planDialog && (
        <PlanChangeDialog
          restaurant={{ id: restaurant.id, name: restaurant.name }}
          subscription={sub}
          plans={plans}
          mode={planDialog.mode}
          onClose={() => setPlanDialog(null)}
          onDone={() => { setPlanDialog(null); refresh(); }}
        />
      )}

      {/* Reject Document Modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setRejectModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-sm p-6 animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex flex-col items-center text-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-base font-extrabold text-slate-800">Reject Document</h3>
              <p className="text-xs text-slate-500">{DOC_TYPE_LABELS[rejectModal.documentType] || rejectModal.documentType}</p>
            </div>
            <div className="space-y-1 mb-4">
              <label className="text-[10px] font-bold text-slate-600">Rejection Reason *</label>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-red-400 resize-none"
                placeholder="Provide a reason for rejection..."
              />
            </div>
            <div className="flex gap-2.5">
              <button onClick={() => setRejectModal(null)} className="flex-1 h-10 border-2 border-slate-200 hover:border-slate-300 rounded-xl text-sm font-bold text-slate-600 cursor-pointer">Cancel</button>
              <button
                onClick={handleRejectDocument}
                disabled={!rejectReason.trim() || busyAction === rejectModal.id}
                className="flex-1 h-10 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {busyAction === rejectModal.id ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Reject Document
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
