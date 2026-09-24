import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, RefreshCw, Loader2, ChevronLeft, ChevronRight,
  Building2, CreditCard, CheckCircle2, XCircle, AlertTriangle, Eye,
  Check, X, Clock
} from 'lucide-react';
import { superAdminApi } from '../../../api/superAdmin.api';
import { useUiStore } from '../../../store';

const STATUS_STYLE = {
  MANUAL_PENDING: { label: 'Application Submitted', cls: 'bg-amber-50 text-amber-600 border-amber-200' },
  MANUAL_PAYMENT_PENDING: { label: 'Payment Pending', cls: 'bg-blue-50 text-blue-600 border-blue-200' },
  MANUAL_PAYMENT_RECEIVED: { label: 'Payment Received', cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  MANUAL_APPROVED: { label: 'Approved', cls: 'bg-green-50 text-green-600 border-green-200' },
  MANUAL_REJECTED: { label: 'Rejected', cls: 'bg-red-50 text-red-600 border-red-200' },
};

const STATUS_ORDER = [
  'MANUAL_PENDING',
  'MANUAL_PAYMENT_PENDING',
  'MANUAL_PAYMENT_RECEIVED',
  'MANUAL_APPROVED',
  'MANUAL_REJECTED',
];

export default function ManualApplications() {
  return <ApplicationsList />;
}

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
      const resp = await superAdminApi.getManualApplications(params);
      if (resp.success) {
        setApplications(resp.data.applications || []);
        setPagination(resp.data.pagination);
      }
    } catch (e) {
      console.error('Failed to load manual applications:', e);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setTimeout(() => { setPage(1); load(); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  if (viewId) {
    return <ApplicationDetail applicationId={viewId} onBack={() => setViewId(null)} onChanged={() => load()} />;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800">Manual Payment Applications</h1>
          <p className="text-xs text-slate-500 mt-1">New restaurant applications — verify payment manually, then approve</p>
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
          <option value="MANUAL_APPROVED">Approved</option>
          <option value="MANUAL_REJECTED">Rejected</option>
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
                <th className="text-left font-extrabold text-slate-600 uppercase tracking-wider py-3 px-4">Plan</th>
                <th className="text-left font-extrabold text-slate-600 uppercase tracking-wider py-3 px-4">Amount</th>
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
                    <p className="text-sm font-bold text-slate-500 mt-2">No manual payment applications found</p>
                    <p className="text-xs text-slate-400 mt-1">New manual payment sign-ups will appear here</p>
                  </td>
                </tr>
              ) : (
                applications.map((a) => {
                  const style = STATUS_STYLE[a.onboardingStatus] || { label: a.displayStatus || a.onboardingStatus, cls: 'bg-slate-100 text-slate-500 border-slate-200' };
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
                      <td className="py-3 px-4">
                        <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                          {a.subscription?.planName || '—'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-mono">
                        ₹{(a.subscription?.amount || 0).toLocaleString('en-IN')}
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

function ApplicationDetail({ applicationId, onBack, onChanged }) {
  const { addToast } = useUiStore();
  const [app, setApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await superAdminApi.getManualApplication(applicationId);
      if (resp.success) setApp(resp.data);
    } catch (e) {
      setError(e.message || 'Failed to load application');
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => { load(); }, [load]);

  // generateQR removed — payment is verified manually via "Mark Payment
  // Received"; no QR/checkout is ever generated in the approval workflow.

  const markPaymentReceived = async () => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const resp = await superAdminApi.markManualPaymentReceived(applicationId, {
        amount: app?.subscription?.amount || 0,
        transactionRef: `MANUAL-${applicationId}-${Date.now()}`,
      });
      if (resp.success) {
        addToast('Payment verified successfully', 'success');
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

  const approve = async () => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const resp = await superAdminApi.approveManualApplication(applicationId);
      if (resp.success) {
        addToast((resp.data && resp.data.message) || 'Application approved and activated', 'success');
        await load();
        onChanged();
      } else {
        addToast(resp.message || 'Approval failed', 'error');
      }
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
      const resp = await superAdminApi.rejectManualApplication(applicationId, rejectReason.trim());
      if (resp.success) {
        addToast((resp.data && resp.data.message) || 'Application rejected', 'success');
        setRejectReason('');
        await load();
        onChanged();
      } else {
        addToast(resp.message || 'Rejection failed', 'error');
      }
    } catch (e) {
      addToast(e.message || 'Rejection failed', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const canTakeAction = app?.onboardingStatus && 
    ['MANUAL_PENDING', 'MANUAL_PAYMENT_PENDING', 'MANUAL_PAYMENT_RECEIVED'].includes(app.onboardingStatus);

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

  const statusStyle = STATUS_STYLE[app.onboardingStatus] || { label: app.onboardingStatus, cls: 'bg-slate-100 text-slate-500 border-slate-200' };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <button onClick={onBack} className="h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer">
          <ChevronLeft className="w-3.5 h-3.5" /> Manual Applications
        </button>
        <span className={`text-[9px] font-bold px-2 py-1 rounded-full border ${statusStyle.cls}`}>{statusStyle.label}</span>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs font-semibold text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}
      {app.onboardingNote && app.onboardingStatus === 'MANUAL_REJECTED' && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-xs font-semibold text-red-700 leading-relaxed">Rejection Reason: {app.onboardingNote}</p>
        </div>
      )}

      {/* Business Information */}
      <Section icon={Building2} title="Business Information">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
          <Info label="Business Name" value={app.name} />
          <Info label="Business Type" value={String(app.businessType || '').replace(/_/g, ' ')} />
          <Info label="Owner" value={app.ownerName} />
          <Info label="Email" value={app.email} />
          <Info label="Phone" value={app.phone} />
          <Info label="GST / Tax" value={app.gstNumber} />
          <Info label="Registration No." value={app.registrationNumber} />
          <div className="col-span-2 md:col-span-3">
            <Info label="Address" value={[app.address, app.city, app.state, app.country, app.pincode].filter(Boolean).join(', ')} />
          </div>
        </div>
      </Section>

      {/* Plan & Payment */}
      {app.subscription && (
        <Section icon={CreditCard} title="Plan & Payment">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Info label="Plan" value={app.subscription.planName} />
            <Info label="Billing Cycle" value={app.subscription.billingCycle} />
            <Info label="Amount" value={`₹${Number(app.subscription.amount || 0).toLocaleString('en-IN')}`} />
            <Info label="Subscription Status" value={app.subscription.status} />
          </div>
          
          {/* Payment Actions — QR generation removed; manual verification only */}
          {canTakeAction && (
            <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <h4 className="text-xs font-bold text-slate-700 mb-3">Payment Actions</h4>
              <div className="flex flex-wrap gap-2">
                {app.onboardingStatus !== 'MANUAL_PAYMENT_RECEIVED' && (
                  <button
                    onClick={markPaymentReceived}
                    disabled={actionBusy}
                    className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    {actionBusy === 'mark-payment' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Mark Payment Received
                  </button>
                )}
                {app.onboardingStatus === 'MANUAL_PAYMENT_RECEIVED' && (
                  <span className="h-9 px-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold inline-flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Payment verified — awaiting approval
                  </span>
                )}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Decision Actions */}
      <div className="bg-white rounded-[20px] border border-slate-200 shadow-sm p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-extrabold text-slate-800">Review Decision</h3>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {app.onboardingStatus === 'MANUAL_PAYMENT_RECEIVED'
              ? 'Payment has been verified. You can now approve this application.'
              : app.onboardingStatus === 'MANUAL_APPROVED'
                ? 'Application has been approved and activated.'
                : app.onboardingStatus === 'MANUAL_REJECTED'
                  ? 'Application has been rejected.'
                  : 'Verify the payment manually (Mark Payment Received) before approving.'}
          </p>
        </div>
        <div className="flex gap-2">
          {app.onboardingStatus !== 'MANUAL_APPROVED' && app.onboardingStatus !== 'MANUAL_REJECTED' && (
            <>
              <button
                onClick={() => document.getElementById('reject-modal').classList.remove('hidden')}
                disabled={!canTakeAction || actionBusy}
                className="h-10 px-4 bg-white border border-red-200 text-red-600 rounded-xl text-xs font-bold hover:bg-red-50 transition-all cursor-pointer disabled:opacity-40 inline-flex items-center gap-1.5"
              >
                <XCircle className="w-3.5 h-3.5" /> Reject Application
              </button>
              <button
                onClick={approve}
                disabled={!canTakeAction || actionBusy || app.onboardingStatus !== 'MANUAL_PAYMENT_RECEIVED'}
                className="h-10 px-4 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40 inline-flex items-center gap-1.5 shadow-sm"
              >
                {actionBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                {app.onboardingStatus === 'MANUAL_PAYMENT_RECEIVED' ? 'Approve Application' : 'Approve (after payment)'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Reject Modal */}
      {app.onboardingStatus !== 'MANUAL_APPROVED' && app.onboardingStatus !== 'MANUAL_REJECTED' && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm hidden items-center justify-center p-4" id="reject-modal">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 p-6 animate-slide-up">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-base font-extrabold text-slate-800">Reject Application?</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Reject "{app.name}"? The applicant will see the reason.</p>
              </div>
              <button onClick={() => document.getElementById('reject-modal').classList.add('hidden')} className="p-1.5 hover:bg-slate-100 rounded-lg cursor-pointer">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
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
            <div className="flex gap-2.5 mt-6">
              <button
                onClick={() => document.getElementById('reject-modal').classList.add('hidden')}
                className="flex-1 h-11 border-2 border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-800 transition-all cursor-pointer uppercase tracking-wider"
              >
                Cancel
              </button>
              <button
                onClick={reject}
                disabled={actionBusy || !rejectReason.trim()}
                className="flex-1 h-11 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer"
              >
                {actionBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                Reject Application
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <section className="bg-white rounded-[20px] border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-xl bg-[#16A34A]/10 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-[#16A34A]" />
        </div>
        <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700">{title}</h3>
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
