import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, RefreshCw, Loader2, ChevronLeft, ChevronRight, ArrowLeft,
  Building2, FileText, CreditCard, ShieldCheck,
  CheckCircle2, XCircle, AlertTriangle, Eye, Download, File, Check, X,
} from 'lucide-react';
import { superAdminApi } from '../../../api/superAdmin.api';
import { onboardingApi } from '../../../api/onboarding.api';
import { useUiStore } from '../../../store';
import API_BASE_URL from '../../../config/apiConfig';

const BACKEND_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '');

const STATUS_STYLE = {
  UNDER_REVIEW: { label: 'Under Review', cls: 'bg-amber-50 text-amber-600 border-amber-200' },
  MANUAL_PENDING: { label: 'Application Submitted', cls: 'bg-amber-50 text-amber-600 border-amber-200' },
  MANUAL_PAYMENT_PENDING: { label: 'Payment Pending', cls: 'bg-blue-50 text-blue-600 border-blue-200' },
  MANUAL_PAYMENT_RECEIVED: { label: 'Payment Received', cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  MANUAL_APPROVED: { label: 'Approved', cls: 'bg-green-50 text-green-600 border-green-200' },
  MANUAL_REJECTED: { label: 'Rejected', cls: 'bg-red-50 text-red-600 border-red-200' },
  PAYMENT_PENDING: { label: 'Payment Pending', cls: 'bg-blue-50 text-blue-600 border-blue-200' },
  PLAN_SELECTED: { label: 'Plan Selected', cls: 'bg-blue-50 text-blue-600 border-blue-200' },
  DOCUMENTS_PENDING: { label: 'Documents Pending', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  LEGAL_PENDING: { label: 'Legal Pending', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  PLAN_PENDING: { label: 'Plan Pending', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  REJECTED: { label: 'Rejected', cls: 'bg-red-50 text-red-600 border-red-200' },
  ACTIVE: { label: 'Active', cls: 'bg-green-50 text-green-600 border-green-200' },
  SUSPENDED: { label: 'Suspended', cls: 'bg-red-50 text-red-600 border-red-200' },
  EXPIRED: { label: 'Expired', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

// Manual-review statuses whose payment verification actions are shown.
// (QR generation was removed from the approval workflow.)
const MANUAL_STATUSES = ['MANUAL_PENDING', 'MANUAL_PAYMENT_PENDING', 'MANUAL_PAYMENT_RECEIVED'];

const DOC_STATUS_STYLE = {
  PENDING: 'bg-amber-50 text-amber-600',
  UNDER_REVIEW: 'bg-blue-50 text-blue-600',
  VERIFIED: 'bg-green-50 text-green-600',
  REJECTED: 'bg-red-50 text-red-600',
};

/**
 * Super Admin — Self-serve Business Applications review.
 *
 * Reads only the existing backend APIs (list/detail/approve/reject + restaurant
 * document verify/reject/download). Approving calls the backend approval
 * endpoint — the frontend never provisions tenants itself; it only displays
 * the resulting status.
 */
export default function BusinessApplications() {
  return <ApplicationsList />;
}

/* ───────────────────────────── List ───────────────────────────── */
function ApplicationsList() {
  const [applications, setApplications] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [viewId, setViewId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 15 };
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.status = statusFilter;
      const resp = await superAdminApi.getBusinessApplications(params);
      if (resp.success) {
        setApplications(resp.data.applications || []);
        setPagination(resp.data.pagination);
      }
    } catch (e) {
      console.error('Failed to load business applications:', e);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); load(); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  if (viewId) {
    return <ApplicationDetail applicationId={viewId} onBack={() => setViewId(null)} onChanged={() => load()} />;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800">Business Applications</h1>
          <p className="text-xs text-slate-500 mt-1">Self-serve onboarding applications — review documents, payments and approvals</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search applications…"
            className="w-full h-9 pl-9 pr-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-[#16A34A] transition-all"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-[#16A34A]"
        >
          <option value="">All Statuses</option>
          <option value="MANUAL_PENDING">Application Submitted</option>
          <option value="MANUAL_PAYMENT_PENDING">Payment Pending</option>
          <option value="MANUAL_PAYMENT_RECEIVED">Payment Received</option>
          <option value="UNDER_REVIEW">Under Review</option>
          <option value="in_progress">In Progress</option>
          <option value="PAYMENT_PENDING">Payment Pending</option>
          <option value="REJECTED">Rejected</option>
          <option value="ACTIVE">Active</option>
        </select>
        <button
          onClick={load}
          className="h-9 w-9 flex items-center justify-center bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all cursor-pointer"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[860px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left font-extrabold text-slate-600 uppercase tracking-wider py-3 px-4">Business</th>
                <th className="text-left font-extrabold text-slate-600 uppercase tracking-wider py-3 px-4">Owner / Contact</th>
                <th className="text-left font-extrabold text-slate-600 uppercase tracking-wider py-3 px-4">Type</th>
                <th className="text-left font-extrabold text-slate-600 uppercase tracking-wider py-3 px-4">Docs</th>
                <th className="text-left font-extrabold text-slate-600 uppercase tracking-wider py-3 px-4">Status</th>
                <th className="text-left font-extrabold text-slate-600 uppercase tracking-wider py-3 px-4">Submitted</th>
                <th className="text-right font-extrabold text-slate-600 uppercase tracking-wider py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-[#16A34A] mx-auto" />
                  </td>
                </tr>
              ) : applications.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <ClipboardIcon />
                    <p className="text-sm font-bold text-slate-500 mt-2">No business applications found</p>
                    <p className="text-xs text-slate-400 mt-1">New self-serve sign-ups will appear here</p>
                  </td>
                </tr>
              ) : (
                applications.map((a) => {
                  const style = STATUS_STYLE[a.status] || { label: a.displayStatus || a.status, cls: 'bg-slate-100 text-slate-500 border-slate-200' };
                  return (
                    <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-all">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#16A34A]/10 to-[#15803D]/10 border border-[#16A34A]/20 flex items-center justify-center text-xs font-extrabold text-[#16A34A] shrink-0">
                            {String(a.name || 'A').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-slate-700">{a.name || '—'}</p>
                            {a.city && <p className="text-[10px] text-slate-400">{a.city}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-600">{a.ownerName || '—'}</p>
                        <p className="text-[10px] text-slate-400">{a.email}</p>
                      </td>
                      <td className="py-3 px-4 text-slate-500">{String(a.businessType || '').replace(/_/g, ' ')}</td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                          <FileText className="w-3 h-3" /> {a.documentCount}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${style.cls}`}>{style.label}</span>
                      </td>
                      <td className="py-3 px-4 text-[10px] text-slate-400">{formatDate(a.createdAt)}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setViewId(a.id)}
                          className="inline-flex items-center gap-1.5 h-8 px-3 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:border-[#16A34A] hover:text-[#16A34A] transition-all cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" /> Review
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <p className="text-[10px] text-slate-400">
              Showing {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </p>
            <div className="flex gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 cursor-pointer">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))} disabled={page >= pagination.totalPages} className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 cursor-pointer">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ClipboardIcon() {
  return <FileText className="w-8 h-8 text-slate-300 mx-auto" />;
}

/* ───────────────────────── Detail ───────────────────────── */
function ApplicationDetail({ applicationId, onBack, onChanged }) {
  const { addToast } = useUiStore();
  const [app, setApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [docTypes, setDocTypes] = useState([]);
  const [busyAction, setBusyAction] = useState('');
  const [rejectModal, setRejectModal] = useState(false);
  const [approveModal, setApproveModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [detail, config] = await Promise.all([
        superAdminApi.getBusinessApplication(applicationId),
        onboardingApi.getConfig().catch(() => null),
      ]);
      if (detail.success) setApp(detail.data);
      const cfg = config && config.data ? config.data : config;
      if (cfg && Array.isArray(cfg.documentTypes)) {
        setDocTypes(cfg.documentTypes);
      } else {
        setDocTypes([]);
      }
    } catch (e) {
      setError(e.message || 'Failed to load application');
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => { load(); }, [load]);

  if (loading && !app) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-[#16A34A]" />
      </div>
    );
  }

  if (!app) {
    return (
      <div className="py-16 text-center space-y-3">
        <AlertTriangle className="w-10 h-10 text-red-400 mx-auto" />
        <p className="text-sm font-bold text-slate-600">{error || 'Application not found'}</p>
        <button onClick={onBack} className="h-9 px-4 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 cursor-pointer">
          Back to Applications
        </button>
      </div>
    );
  }

  const statusMeta = STATUS_STYLE[app.onboardingStatus] || { label: app.onboardingStatus, cls: 'bg-slate-100 text-slate-500 border-slate-200' };
  const canDecide = !['ACTIVE', 'REJECTED', 'SUSPENDED', 'EXPIRED'].includes(app.onboardingStatus);

  const downloadUrl = (docId) => {
    const token = localStorage.getItem('pos_token') || '';
    return `${BACKEND_BASE_URL}/api/super-admin/restaurants/${app.id}/documents/${docId}/download?token=${encodeURIComponent(token)}`;
  };

  const verifyDoc = async (doc) => {
    if (busyAction) return;
    setBusyAction(`v${doc.id}`);
    try {
      await superAdminApi.verifyDocument(app.id, doc.id);
      addToast('Document verified', 'success');
      await load();
    } catch (e) {
      addToast(e.message || 'Could not verify document', 'error');
    } finally {
      setBusyAction('');
    }
  };

  const submitRejectDoc = async () => {
    if (!rejectModal || !rejectReason.trim() || actionBusy) return;
    setActionBusy(true);
    try {
      await superAdminApi.rejectDocument(app.id, rejectModal.id, rejectReason.trim());
      addToast('Document rejected', 'success');
      setRejectModal(null);
      setRejectReason('');
      await load();
    } catch (e) {
      addToast(e.message || 'Could not reject document', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const approve = async () => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const resp = await superAdminApi.approveBusinessApplication(app.id);
      addToast((resp && resp.message) || 'Application approved and activated', 'success');
      setApproveModal(false);
      await load();
      onChanged();
    } catch (e) {
      addToast(e.message || 'Approval failed', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const reject = async () => {
    if (actionBusy || !rejectReason.trim()) return;
    setActionBusy(true);
    try {
      const resp = await superAdminApi.rejectBusinessApplication(app.id, rejectReason.trim());
      addToast((resp && resp.message) || 'Application rejected', 'success');
      setRejectModal(false);
      setRejectReason('');
      await load();
      onChanged();
    } catch (e) {
      addToast(e.message || 'Rejection failed', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const isManualApp = MANUAL_STATUSES.includes(app?.onboardingStatus);

  // generateQR removed — payment is verified manually via "Mark Payment
  // Received"; no QR/checkout is ever generated in the approval workflow.

  const markPaymentReceived = async () => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const resp = await superAdminApi.markManualPaymentReceived(app.id, {
        amount: app?.subscription?.amount || 0,
        transactionRef: `MANUAL-${app.id}-${Date.now()}`,
      });
      if (resp.success) {
        addToast('Payment verified successfully — the application still awaits approval', 'success');
        await load();
        onChanged();
      } else {
        addToast(resp.message || 'Failed to verify payment', 'error');
      }
    } catch (e) {
      addToast(e.message || 'Failed to verify payment', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  // Docs grouped by type — submitted + not-submitted (never styled as errors).
  const submittedByType = {};
  (app.documents || []).forEach((d) => {
    if (!submittedByType[d.documentType]) submittedByType[d.documentType] = [];
    submittedByType[d.documentType].push(d);
  });

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <button onClick={onBack} className="h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer">
          <ArrowLeft className="w-3.5 h-3.5" /> Applications
        </button>
        <div className="flex items-center gap-2">
          <span className={`text-[9px] font-bold px-2 py-1 rounded-full border ${statusMeta.cls}`}>{statusMeta.label}</span>
          {app.reviewMode === 'auto' && (
            <span className="text-[9px] font-bold px-2 py-1 rounded-full bg-purple-50 text-purple-600 border border-purple-200">Auto review</span>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs font-semibold text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}
      {app.onboardingNote && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs font-semibold text-amber-700 leading-relaxed">Note: {app.onboardingNote}</p>
        </div>
      )}

      {/* Business information */}
      <Section icon={Building2} title="Business Information">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
          <Info label="Business Name" value={app.name} />
          <Info label="Legal Name" value={app.legalName} />
          <Info label="Business Type" value={String(app.businessType || '').replace(/_/g, ' ')} />
          <Info label="Owner" value={app.ownerName} />
          <Info label="Owner Account" value={app.owner ? `${app.owner.name} (${app.owner.email})` : null} />
          <Info label="Email" value={app.email} />
          <Info label="Phone" value={app.phone} />
          <Info label="GST / Tax" value={app.gstNumber} />
          <Info label="Registration No." value={app.registrationNumber} />
          <Info label="Website" value={app.website} />
          <div className="col-span-2 md:col-span-3">
            <Info label="Address" value={[app.address, app.city, app.state, app.country, app.pincode].filter(Boolean).join(', ')} />
          </div>
        </div>
      </Section>

      {/* Documents */}
      <Section icon={FileText} title="Business Documents" sub={`${(app.documents || []).length} submitted — at least one valid document is required, no type is mandatory`}>
        <div className="space-y-2.5">
          {docTypes.length > 0 ? (
            docTypes.map((dt) => {
              const docs = submittedByType[dt.value] || [];
              return (
                <div key={dt.value} className="border border-slate-100 rounded-xl p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-[11px] font-extrabold text-slate-700">{dt.label}</p>
                    {docs.length === 0 && (
                      <span className="text-[9px] font-bold text-slate-400 px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200">Not Submitted</span>
                    )}
                  </div>
                  {docs.length === 0 ? (
                    <p className="text-[9px] text-slate-400">Optional — the applicant did not upload this document.</p>
                  ) : (
                    <div className="space-y-1.5 mt-1">
                      {docs.map((doc) => {
                        const dStyle = DOC_STATUS_STYLE[doc.status] || 'bg-slate-100 text-slate-500';
                        return (
                          <div key={doc.id} className="flex items-center gap-2.5 bg-slate-50/70 rounded-lg px-3 py-2 flex-wrap">
                            <File className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <p className="text-[10px] font-bold text-slate-700 truncate max-w-[240px]">{doc.originalFileName}</p>
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${dStyle}`}>{doc.status}</span>
                            {doc.rejectionReason && (
                              <span className="text-[9px] text-red-600 font-semibold truncate">Reason: {doc.rejectionReason}</span>
                            )}
                            <div className="ml-auto flex items-center gap-1 shrink-0">
                              <a
                                href={downloadUrl(doc.id)}
                                target="_blank"
                                rel="noreferrer"
                                className="h-7 px-2.5 inline-flex items-center gap-1 text-[9px] font-bold text-slate-600 hover:text-[#16A34A] rounded-lg hover:bg-white border border-transparent hover:border-slate-200 transition-all"
                                title="View / Download (authenticated)"
                              >
                                <Download className="w-3 h-3" /> View / Download
                              </a>
                              {doc.status !== 'VERIFIED' && doc.status !== 'REJECTED' && (
                                <button
                                  onClick={() => verifyDoc(doc)}
                                  disabled={busyAction === `v${doc.id}`}
                                  className="h-7 px-2.5 inline-flex items-center gap-1 text-[9px] font-bold text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                                >
                                  {busyAction === `v${doc.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Approve
                                </button>
                              )}
                              {doc.status !== 'VERIFIED' && (
                                <button
                                  onClick={() => { setRejectReason(''); setRejectModal(doc); }}
                                  disabled={busyAction === `v${doc.id}`}
                                  className="h-7 px-2.5 inline-flex items-center gap-1 text-[9px] font-bold text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                                >
                                  <XCircle className="w-3 h-3" /> Reject
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            (app.documents || []).map((doc) => {
              const dStyle = DOC_STATUS_STYLE[doc.status] || 'bg-slate-100 text-slate-500';
              return (
                <div key={doc.id} className="flex items-center gap-2.5 bg-slate-50/70 rounded-lg px-3 py-2">
                  <File className="w-3.5 h-3.5 text-slate-400" />
                  <p className="text-[10px] font-bold text-slate-700">{doc.originalFileName}</p>
                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${dStyle}`}>{doc.status}</span>
                  <a href={downloadUrl(doc.id)} target="_blank" rel="noreferrer" className="ml-auto text-[9px] font-bold text-[#16A34A] inline-flex items-center gap-1">
                    <Download className="w-3 h-3" /> View
                  </a>
                </div>
              );
            })
          )}
        </div>
      </Section>

      {/* Plan & Payment */}
      <Section icon={CreditCard} title="Plan & Payment">
        {app.subscription ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Info label="Plan" value={app.subscription.planDef?.name || app.subscription.plan} />
            <Info label="Billing Cycle" value={app.subscription.billingCycle} />
            <Info label="Amount" value={`₹${Number(app.subscription.amount || 0).toLocaleString('en-IN')}`} />
            <Info label="Subscription Status" value={app.subscription.status} />
          </div>
        ) : (
          <p className="text-xs text-slate-400">No plan selected yet.</p>
        )}
        {(app.payments || []).length > 0 && (
          <div className="mt-3 space-y-1.5">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">Payment Attempts</p>
            {(app.payments || []).map((p) => (
              <div key={p.id} className="flex items-center gap-2.5 bg-slate-50/70 rounded-lg px-3 py-2 flex-wrap">
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${p.status === 'PAID' ? 'bg-green-50 text-green-600' : p.status === 'FAILED' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>{p.status}</span>
                <span className="text-[10px] font-bold text-slate-700">{p.planName || p.planCode}</span>
                <span className="text-[10px] text-slate-500 font-mono">₹{Number(p.amount || 0).toLocaleString('en-IN')}</span>
                {p.razorpayPaymentId && <span className="text-[9px] font-mono text-slate-400">Ref: {p.razorpayPaymentId}</span>}
                <span className="text-[9px] text-slate-400 ml-auto">{formatDate(p.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Payment actions — manual-review applications only (manual verification;
          Generate QR was removed: payment is verified manually, never via a checkout) */}
      {isManualApp && (
        <Section icon={CreditCard} title="Payment Verification (Manual)">
          <p className="text-[10px] text-slate-500 leading-relaxed mb-3">
            The applicant submitted without paying. Review their payment reference, then mark the payment as received
            once it is verified. Payment received does NOT activate the restaurant — you must approve the application
            afterwards.
          </p>
          <div className="flex flex-wrap gap-2">
            {app.onboardingStatus !== 'MANUAL_PAYMENT_RECEIVED' && (
              <button
                onClick={markPaymentReceived}
                disabled={actionBusy}
                className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {actionBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Mark Payment Received
              </button>
            )}
            {app.onboardingStatus === 'MANUAL_PAYMENT_RECEIVED' && (
              <span className="h-9 px-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Payment verified — awaiting approval
              </span>
            )}
          </div>
        </Section>
      )}

      {/* Legal acceptance */}
      <Section icon={ShieldCheck} title="Legal Acceptance">
        {(app.policyAgreements || []).length === 0 ? (
          <p className="text-xs text-slate-400">No policy agreements recorded.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {(app.policyAgreements || []).map((pa) => (
              <div key={pa.id} className="border border-slate-100 rounded-xl p-3 bg-slate-50/50">
                <p className="text-[10px] font-extrabold text-slate-700">{String(pa.policyType || '').replace(/_/g, ' ')}</p>
                <p className="text-[9px] text-slate-400 mt-0.5">
                  v{pa.policyVersion} • {pa.acceptedAt ? formatDate(pa.acceptedAt) : '—'}
                  {pa.accepter ? ` by ${pa.accepter.name}` : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Decision actions */}
      <div className="bg-white rounded-[20px] border border-slate-200 shadow-sm p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-extrabold text-slate-800">Review Decision</h3>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {app.reviewMode === 'auto'
              ? 'Auto review is enabled — approved applications provision automatically.'
              : 'Manual review — approving provisions the tenant and activates the subscription (backend-managed).'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setRejectReason(''); setRejectModal({ application: true }); }}
            disabled={!canDecide || actionBusy}
            className="h-10 px-4 bg-white border border-red-200 text-red-600 rounded-xl text-xs font-bold hover:bg-red-50 transition-all cursor-pointer disabled:opacity-40 inline-flex items-center gap-1.5"
          >
            <XCircle className="w-3.5 h-3.5" /> Reject Application
          </button>
          <button
            onClick={() => setApproveModal(true)}
            disabled={!canDecide || actionBusy || (isManualApp && app.onboardingStatus !== 'MANUAL_PAYMENT_RECEIVED')}
            title={isManualApp && app.onboardingStatus !== 'MANUAL_PAYMENT_RECEIVED' ? 'Mark the payment as received before approving' : undefined}
            className="h-10 px-4 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40 inline-flex items-center gap-1.5 shadow-sm"
          >
            {actionBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Approve Application
          </button>
        </div>
      </div>

      {/* ── Reject / Approve modals ── */}
      {(rejectModal || approveModal) && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 p-6 animate-slide-up">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-base font-extrabold text-slate-800">
                  {rejectModal && rejectModal.application ? 'Reject Application?' : rejectModal ? 'Reject Document?' : 'Approve Application?'}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {rejectModal && rejectModal.application
                    ? `Reject "${app.name}"? The applicant will see the reason.`
                    : rejectModal
                      ? `Reject "${rejectModal.originalFileName}"? The applicant can upload a replacement.`
                      : `Approve "${app.name}"? Backend provisions the tenant, activates the ${app.subscription?.plan || 'selected'} plan and grants the owner access.`}
                </p>
              </div>
              <button onClick={() => { if (!actionBusy) { setRejectModal(false); setApproveModal(false); setRejectReason(''); } }} className="p-1.5 hover:bg-slate-100 rounded-lg cursor-pointer" aria-label="Close">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {approveModal && !rejectModal && (
              <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-[10px] font-semibold text-emerald-700 leading-relaxed">
                  Approval requires at least one valid document and a verified payment — the backend validates both before activating.
                </p>
              </div>
            )}

            {rejectModal && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-slate-500">Rejection reason *</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={4}
                  placeholder="Explain why this is being rejected (required)"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-red-400 focus:bg-white resize-none"
                />
              </div>
            )}

            <div className="flex gap-2.5 mt-6">
              <button
                onClick={() => { setRejectModal(false); setApproveModal(false); setRejectReason(''); }}
                disabled={actionBusy}
                className="flex-1 h-11 border-2 border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-800 transition-all disabled:opacity-50 cursor-pointer uppercase tracking-wider"
              >
                Cancel
              </button>
              <button
                onClick={rejectModal && rejectModal.application ? reject : rejectModal ? submitRejectDoc : approve}
                disabled={actionBusy || (rejectModal && !rejectReason.trim())}
                className={`flex-1 h-11 rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer inline-flex items-center justify-center gap-1.5 ${
                  approveModal && !rejectModal
                    ? 'bg-[#16A34A] hover:bg-[#15803D] text-white shadow-sm'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                {actionBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {rejectModal && rejectModal.application ? 'Reject Application' : rejectModal ? 'Reject Document' : 'Approve & Activate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ icon: Icon, title, sub, children }) {
  return (
    <section className="bg-white rounded-[20px] border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-xl bg-[#16A34A]/10 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-[#16A34A]" />
        </div>
        <div>
          <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700">{title}</h3>
          {sub && <p className="text-[9px] text-slate-400 mt-0.5">{sub}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-[11px] font-bold text-slate-700 mt-0.5 break-words">{value || '—'}</p>
    </div>
  );
}

function formatDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
