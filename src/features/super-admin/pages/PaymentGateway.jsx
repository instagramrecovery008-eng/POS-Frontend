import React, { useState, useEffect, useCallback, useRef } from 'react';
import { superAdminApi } from '../../../api/superAdmin.api';
import {
  Wallet, Loader2, Save, RefreshCw, ShieldCheck, ShieldAlert, Plug,
  Copy, Check, Eye, EyeOff, Power, AlertTriangle, Globe, Search,
  X, CreditCard, TrendingUp, CalendarClock, IndianRupee, Activity,
} from 'lucide-react';

// ── Status badge — text + icon, never color-only ───────────────────────────
function StatusBadge({ status }) {
  if (status === 'PAID') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 border border-green-200 text-[10px] font-bold text-green-700">
        <Check className="w-3 h-3" /> PAID
      </span>
    );
  }
  if (status === 'FAILED') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-[10px] font-bold text-red-700">
        <X className="w-3 h-3" /> FAILED
      </span>
    );
  }
  if (status === 'CREATED') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-[10px] font-bold text-amber-700">
        <Loader2 className="w-3 h-3 animate-spin" /> PENDING
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200 text-[10px] font-bold text-slate-600">
      {status || '—'}
    </span>
  );
}

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null);

export default function PaymentGateway() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  // Config form — secrets never pre-filled; empty/masked fields preserve server value.
  const [form, setForm] = useState({ environment: 'TEST', keyId: '', keySecret: '', webhookSecret: '' });
  const [showSecret, setShowSecret] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [liveConfirm, setLiveConfirm] = useState(false);
  const [toggleConfirm, setToggleConfirm] = useState(null); // true = enable, false = disable

  // Metrics + payment history
  const [metrics, setMetrics] = useState(null);
  const [payments, setPayments] = useState({ payments: [], total: 0 });
  const [filters, setFilters] = useState({ search: '', status: '', action: '', cycle: '', from: '', to: '' });
  const [copied, setCopied] = useState(false);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const [statusResp, metricsResp, paymentsResp] = await Promise.all([
        superAdminApi.getGatewayStatus(),
        superAdminApi.getPaymentMetrics(),
        superAdminApi.listPayments({ limit: 15 }),
      ]);
      if (statusResp.success) {
        setStatus(statusResp.data);
        setForm((f) => ({
          environment: statusResp.data.environment || 'TEST',
          keyId: statusResp.data.keyId || '',
          keySecret: '',
          webhookSecret: '',
        }));
      }
      if (metricsResp.success) setMetrics(metricsResp.data);
      if (paymentsResp.success) setPayments(paymentsResp.data);
    } catch (e) {
      showToast(e.message || 'Failed to load gateway configuration', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadAll(); return () => clearTimeout(toastTimer.current); }, [loadAll]);

  const applyFilters = useCallback(async (overrides = {}) => {
    const f = { ...filters, ...overrides };
    setFilters(f);
    try {
      const resp = await superAdminApi.listPayments({
        limit: 50,
        search: f.search || undefined,
        status: f.status || undefined,
        action: f.action || undefined,
        cycle: f.cycle || undefined,
        from: f.from || undefined,
        to: f.to || undefined,
      });
      if (resp.success) setPayments(resp.data);
    } catch (e) {
      showToast(e.message || 'Failed to load payment history', 'error');
    }
  }, [filters, showToast]);

  const handleSave = async () => {
    if (!form.keyId || String(form.keyId).includes('*')) {
      showToast('Key ID is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const resp = await superAdminApi.saveGatewayConfig({
        environment: form.environment,
        enabled: status?.enabled !== false,
        keyId: form.keyId,
        keySecret: form.keySecret || undefined,
        webhookSecret: form.webhookSecret || undefined,
      });
      if (resp.success) {
        showToast('Gateway configuration saved');
        setForm((f) => ({ ...f, keySecret: '', webhookSecret: '' }));
        await loadAll();
      }
    } catch (e) {
      showToast(e.message || 'Failed to save configuration', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const resp = await superAdminApi.testGateway();
      if (resp.success) {
        showToast('Razorpay connection successful');
        await loadAll();
      }
    } catch (e) {
      showToast(e.message || 'Unable to connect to Razorpay', 'error');
    } finally {
      setTesting(false);
    }
  };

  const handleToggle = async () => {
    setToggling(true);
    try {
      const resp = await superAdminApi.toggleGateway(toggleConfirm);
      if (resp.success) {
        showToast(toggleConfirm ? 'Online payments enabled' : 'Online payments disabled');
        setToggleConfirm(null);
        await loadAll();
      }
    } catch (e) {
      showToast(e.message || 'Failed to update online payments', 'error');
    } finally {
      setToggling(false);
    }
  };

  const handleEnvironmentChange = (env) => {
    if (env === form.environment) return;
    if (env === 'LIVE' && form.environment === 'TEST') {
      setLiveConfirm(true); // explicit confirmation required before LIVE
      return;
    }
    setForm((f) => ({ ...f, environment: env }));
  };

  const webhookUrl = `${window.location.origin}/api/subscriptions/webhook`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) { /* clipboard unavailable */ }
  };

  const statusConfig = status?.status === 'CONFIGURED';
  const statusPartial = status?.status === 'PARTIAL';

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[#16A34A]" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in max-w-5xl mx-auto pb-10">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-[#16A34A]" /> Payment Gateway
          </h1>
          <p className="text-xs text-slate-500 mt-1">Platform-level Razorpay configuration — secrets are encrypted and never shown</p>
        </div>
        <button onClick={loadAll} aria-label="Refresh gateway status" className="h-11 w-11 flex items-center justify-center bg-white border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer">
          <RefreshCw className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      {/* ═══ Status card ═══ */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#16A34A]/10 flex items-center justify-center shrink-0">
            {statusConfig ? <ShieldCheck className="w-6 h-6 text-[#16A34A]" /> : <ShieldAlert className="w-6 h-6 text-amber-500" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-base font-extrabold text-slate-800">RAZORPAY</p>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${form.environment === 'LIVE' ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-sky-50 text-sky-600 border border-sky-200'}`}>
                {form.environment === 'LIVE' ? '● LIVE MODE' : '● TEST MODE'}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {statusConfig ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-green-700">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Connected
                </span>
              ) : statusPartial ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600">
                  <AlertTriangle className="w-3.5 h-3.5" /> Configuration Required
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500">
                  <AlertTriangle className="w-3.5 h-3.5" /> Not Configured
                </span>
              )}
              <span className="text-slate-300">•</span>
              <span className="text-xs font-semibold text-slate-600">Online Payments: <span className={status?.enabled ? 'text-green-600' : 'text-red-500'}>{status?.enabled ? 'Enabled' : 'Disabled'}</span></span>
              <span className="text-slate-300">•</span>
              <span className="text-xs font-semibold text-slate-600">Webhook: <span className={status?.webhookConfigured ? 'text-green-600' : 'text-red-500'}>{status?.webhookConfigured ? 'Configured' : 'Not Configured'}</span></span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">Last checked: {fmtDateTime(status?.lastCheckedAt) || 'Never'}</p>
          </div>
          <div className="flex gap-2 flex-wrap sm:flex-nowrap">
            <button
              onClick={handleTest}
              disabled={testing || !status?.keyIdConfigured}
              className="h-11 px-4 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
              Test Connection
            </button>
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="h-11 px-4 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <SettingsIcon /> Edit Configuration
            </button>
          </div>
        </div>
        {/* Missing items */}
        {!statusConfig && (
          <div className="px-4 sm:px-5 pb-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center gap-2 flex-wrap">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <p className="text-[11px] font-semibold text-amber-700">
                Missing: {[!status?.keyIdConfigured && 'Key ID', !status?.secretConfigured && 'Key Secret', !status?.webhookConfigured && 'Webhook Secret'].filter(Boolean).join(', ') || 'Configuration'}
                {' '}— complete the form below to enable online subscription payments.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        {/* ═══ Configuration form ═══ */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-800">Gateway Configuration</h2>
            {status?.enabled === false && (
              <span className="px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-[9px] font-bold text-red-600 uppercase tracking-wider">Payments Off</span>
            )}
          </div>

          {/* Environment */}
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1.5">Environment</label>
            <div className="flex gap-2">
              <button
                onClick={() => handleEnvironmentChange('TEST')}
                className={`flex-1 h-11 rounded-xl text-xs font-bold border-2 transition-all cursor-pointer ${form.environment === 'TEST' ? 'border-[#16A34A] bg-[#16A34A]/5 text-[#15803D]' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
              >
                Test
              </button>
              <button
                onClick={() => handleEnvironmentChange('LIVE')}
                className={`flex-1 h-11 rounded-xl text-xs font-bold border-2 transition-all cursor-pointer ${form.environment === 'LIVE' ? 'border-red-500 bg-red-50 text-red-600' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
              >
                Live
              </button>
            </div>
            {form.environment === 'LIVE' && (
              <p className="text-[10px] font-semibold text-red-500 mt-1.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Live mode processes real payments.</p>
            )}
          </div>

          {/* Key ID */}
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1.5">Key ID</label>
            <input
              type="text"
              value={form.keyId}
              onChange={(e) => setForm((f) => ({ ...f, keyId: e.target.value }))}
              placeholder={status?.keyId ? `Current: ${status.keyId}` : 'rzp_test_xxxxxxxxxxxxxxxx'}
              className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold outline-none focus:border-[#16A34A]"
            />
            {status?.keyId && <p className="text-[9px] text-slate-400 mt-1">Configured key shown masked. Type a new key to replace it.</p>}
          </div>

          {/* Key Secret */}
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1.5">Key Secret</label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={form.keySecret}
                onChange={(e) => setForm((f) => ({ ...f, keySecret: e.target.value }))}
                placeholder={status?.secretConfigured ? '•••••••••••••••• (preserved)' : 'Enter key secret'}
                autoComplete="new-password"
                className="w-full h-11 px-3 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none focus:border-[#16A34A]"
              />
              <button
                onClick={() => setShowSecret((s) => !s)}
                aria-label={showSecret ? 'Hide key secret' : 'Show key secret'}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Webhook Secret */}
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1.5">Webhook Secret</label>
            <div className="relative">
              <input
                type={showWebhookSecret ? 'text' : 'password'}
                value={form.webhookSecret}
                onChange={(e) => setForm((f) => ({ ...f, webhookSecret: e.target.value }))}
                placeholder={status?.webhookConfigured ? '•••••••••••••••• (preserved)' : 'Enter webhook secret'}
                autoComplete="new-password"
                className="w-full h-11 px-3 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none focus:border-[#16A34A]"
              />
              <button
                onClick={() => setShowWebhookSecret((s) => !s)}
                aria-label={showWebhookSecret ? 'Hide webhook secret' : 'Show webhook secret'}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showWebhookSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-12 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-xs font-extrabold uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Configuration
          </button>

          {/* Online payments toggle */}
          <div className="border-t border-slate-100 pt-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5"><Power className="w-3.5 h-3.5" /> Online Payments</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Restaurant admins can purchase subscriptions when enabled</p>
            </div>
            <button
              onClick={() => setToggleConfirm(!status?.enabled)}
              disabled={toggling}
              aria-label={status?.enabled ? 'Disable online payments' : 'Enable online payments'}
              className={`relative w-14 h-8 rounded-full transition-colors cursor-pointer disabled:opacity-50 shrink-0 ${status?.enabled ? 'bg-[#16A34A]' : 'bg-slate-300'}`}
            >
              <span className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all ${status?.enabled ? 'left-7' : 'left-1'}`} />
            </button>
          </div>
        </div>

        {/* ═══ Webhook panel ═══ */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-800">Webhook</h2>
            {status?.webhookConfigured ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 border border-green-200 text-[9px] font-bold text-green-700">
                <Check className="w-3 h-3" /> Configured
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[9px] font-bold text-amber-700">
                <AlertTriangle className="w-3 h-3" /> Not Configured
              </span>
            )}
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1.5">Endpoint</label>
            <div className="flex gap-2">
              <input
                readOnly
                value={webhookUrl}
                className="flex-1 min-w-0 h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-mono text-slate-600 outline-none"
              />
              <button
                onClick={handleCopy}
                aria-label="Copy webhook URL"
                className="h-11 px-3.5 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
              >
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1.5">Required Events</label>
            <div className="flex flex-wrap gap-1.5">
              {['payment.captured', 'payment.failed'].map((ev) => (
                <span key={ev} className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-mono font-bold text-slate-600">{ev}</span>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">Configure in Razorpay dashboard → Settings → Webhooks. The secret must match the Webhook Secret above.</p>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> Last Webhook Activity</p>
            {status?.lastWebhook ? (
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 space-y-1">
                <p className="text-[11px] font-mono font-bold text-slate-700">{status.lastWebhook.event}</p>
                <p className="text-[10px] text-slate-500">
                  {fmtDateTime(status.lastWebhook.receivedAt)} — <span className="text-green-600 font-bold">Processed</span>
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3">No webhook events received yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Platform metrics ═══ */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-4 sm:p-5">
        <h2 className="text-sm font-extrabold text-slate-800 mb-3">Platform Subscription Metrics</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1"><CreditCard className="w-3 h-3" /> Active Subscriptions</p>
            <p className="text-xl font-extrabold text-slate-800 mt-1">{metrics?.activeSubscriptions ?? '—'}</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1"><CalendarClock className="w-3 h-3" /> Expiring (30d)</p>
            <p className="text-xl font-extrabold text-amber-600 mt-1">{metrics?.expiringSubscriptions ?? '—'}</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1"><IndianRupee className="w-3 h-3" /> Monthly Revenue</p>
            <p className="text-xl font-extrabold text-slate-800 mt-1">₹{(metrics?.monthlyRevenue ?? 0).toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Yearly Revenue</p>
            <p className="text-xl font-extrabold text-slate-800 mt-1">₹{(metrics?.yearlyRevenue ?? 0).toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1"><Activity className="w-3 h-3" /> Payments</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(metrics?.paymentStats || []).map((s) => (
                <span key={s.status} className="text-[10px] font-bold text-slate-600">
                  {s.status}: {s.count}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Payment history ═══ */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-4 sm:p-5">
        <h2 className="text-sm font-extrabold text-slate-800 mb-3">Payment History</h2>

        {/* Filters */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
          <div className="col-span-2 relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={filters.search}
              onChange={(e) => applyFilters({ search: e.target.value })}
              placeholder="Search restaurant / plan / ref"
              className="w-full h-11 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-[#16A34A]"
            />
          </div>
          <select value={filters.status} onChange={(e) => applyFilters({ status: e.target.value })} className="h-11 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none">
            <option value="">All Status</option>
            <option value="PAID">PAID</option>
            <option value="FAILED">FAILED</option>
            <option value="CREATED">CREATED</option>
          </select>
          <select value={filters.action} onChange={(e) => applyFilters({ action: e.target.value })} className="h-11 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none">
            <option value="">All Actions</option>
            <option value="UPGRADE">UPGRADE</option>
            <option value="RENEWAL">RENEWAL</option>
            <option value="SWITCH">SWITCH</option>
          </select>
          <select value={filters.cycle} onChange={(e) => applyFilters({ cycle: e.target.value })} className="h-11 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none">
            <option value="">All Cycles</option>
            <option value="MONTHLY">MONTHLY</option>
            <option value="YEARLY">YEARLY</option>
          </select>
          <input type="date" value={filters.from} onChange={(e) => applyFilters({ from: e.target.value })} className="h-11 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none" aria-label="From date" />
        </div>

        {payments.payments.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">No payments found.</p>
        ) : (
          <>
            {/* Desktop/tablet landscape table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    {['Restaurant', 'Plan', 'Action', 'Cycle', 'Amount', 'Status', 'Payment ID', 'Date'].map((h) => (
                      <th key={h} className="text-left px-3 py-2.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payments.payments.map((p) => (
                    <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="px-3 py-3 font-bold text-slate-700 whitespace-nowrap">{p.restaurantName || '—'}</td>
                      <td className="px-3 py-3 font-semibold text-slate-600 whitespace-nowrap">{p.planName || p.planCode}</td>
                      <td className="px-3 py-3">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[9px] font-bold text-slate-600 uppercase">{p.action}</span>
                      </td>
                      <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{p.billingCycle}</td>
                      <td className="px-3 py-3 font-mono font-bold text-slate-800 whitespace-nowrap">₹{Number(p.amount || 0).toLocaleString('en-IN')}</td>
                      <td className="px-3 py-3"><StatusBadge status={p.status} /></td>
                      <td className="px-3 py-3 font-mono text-[10px] text-slate-400 whitespace-nowrap">{p.razorpayPaymentId || p.razorpayOrderId || '—'}</td>
                      <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{fmtDate(p.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile / tablet portrait cards */}
            <div className="md:hidden space-y-2.5">
              {payments.payments.map((p) => (
                <div key={p.id} className="border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-extrabold text-slate-800 truncate">{p.restaurantName || '—'}</p>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-slate-600">{p.planName || p.planCode} <span className="text-slate-400">• {p.action}</span></p>
                    <p className="text-sm font-mono font-extrabold text-slate-800">₹{Number(p.amount || 0).toLocaleString('en-IN')}</p>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>{p.billingCycle}</span>
                    <span className="font-mono truncate ml-2">{p.razorpayPaymentId || p.razorpayOrderId || '—'}</span>
                    <span>{fmtDate(p.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ═══ TEST → LIVE confirmation ═══ */}
      {liveConfirm && (
        <div className="fixed inset-0 z-[120] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-red-200 w-full max-w-sm p-5 animate-fade-in">
            <div className="w-11 h-11 rounded-full bg-red-50 border border-red-200 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <h3 className="text-base font-extrabold text-slate-800 text-center mt-3">Switch Razorpay to LIVE mode?</h3>
            <p className="text-xs text-slate-500 text-center mt-1.5 leading-relaxed">
              Live mode processes <span className="font-bold text-red-600">real payments</span>. Test credentials will not work in LIVE mode.
            </p>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setLiveConfirm(false)} className="flex-1 h-11 border-2 border-slate-200 rounded-xl text-xs font-bold text-slate-600 cursor-pointer">
                Cancel
              </button>
              <button
                onClick={() => { setForm((f) => ({ ...f, environment: 'LIVE' })); setLiveConfirm(false); }}
                className="flex-1 h-11 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-extrabold cursor-pointer"
              >
                Switch to LIVE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Enable/disable confirmation ═══ */}
      {toggleConfirm !== null && (
        <div className="fixed inset-0 z-[120] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm p-5 animate-fade-in">
            <div className="w-11 h-11 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto">
              <Power className="w-5 h-5 text-amber-500" />
            </div>
            <h3 className="text-base font-extrabold text-slate-800 text-center mt-3">
              {toggleConfirm ? 'Enable Online Payments?' : 'Disable Online Payments?'}
            </h3>
            <p className="text-xs text-slate-500 text-center mt-1.5 leading-relaxed">
              {toggleConfirm
                ? 'Restaurant admins will be able to purchase subscriptions through Razorpay.'
                : 'Checkout will be blocked for all restaurants until re-enabled.'}
            </p>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setToggleConfirm(null)} className="flex-1 h-11 border-2 border-slate-200 rounded-xl text-xs font-bold text-slate-600 cursor-pointer">
                Cancel
              </button>
              <button
                onClick={handleToggle}
                disabled={toggling}
                className={`flex-1 h-11 text-white rounded-xl text-xs font-extrabold cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 ${toggleConfirm ? 'bg-[#16A34A] hover:bg-[#15803D]' : 'bg-red-600 hover:bg-red-700'}`}
              >
                {toggling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {toggleConfirm ? 'Enable' : 'Disable'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[130] rounded-xl px-4 py-3 text-xs font-bold shadow-lg animate-slide-up max-w-sm ${toast.type === 'error' ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-green-50 border border-green-200 text-green-700'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// Inline settings icon (avoids importing a second Settings name collision)
function SettingsIcon() {
  return <Globe className="w-4 h-4" />;
}
