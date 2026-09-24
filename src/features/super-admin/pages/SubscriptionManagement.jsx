import React, { useState, useEffect, useCallback, useRef } from 'react';
import { superAdminApi } from '../../../api/superAdmin.api';
import { Search, RefreshCw, Loader2, XCircle, AlertTriangle, ChevronLeft, ChevronRight, RotateCcw, Ban, TrendingUp, TrendingDown, PlayCircle } from 'lucide-react';
import PlanChangeDialog from '../components/PlanChangeDialog';

export default function SubscriptionManagement() {
  const [subscriptions, setSubscriptions] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [planFilter, setPlanFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expiryFilter, setExpiryFilter] = useState('');
  const [cycleFilter, setCycleFilter] = useState('');
  const [search, setSearch] = useState('');
  const [planDialog, setPlanDialog] = useState(null);
  const busyRef = useRef(false);

  const loadPlans = useCallback(async () => {
    try {
      const resp = await superAdminApi.getPlans();
      if (resp.success) setPlans(resp.data || []);
    } catch (e) { console.error(e); }
  }, []);

  const load = useCallback(async (pageNum) => {
    try {
      setLoading(true);
      const currentPage = pageNum || page;
      const params = {
        page: currentPage, limit: 20,
        plan: planFilter || undefined,
        status: statusFilter || undefined,
        expiry: expiryFilter || undefined,
        billingCycle: cycleFilter || undefined,
        search: search || undefined,
      };
      const resp = await superAdminApi.getSubscriptions(params);
      if (resp.success) {
        setSubscriptions(resp.data.subscriptions || []);
        setPagination(resp.data.pagination);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [planFilter, statusFilter, expiryFilter, cycleFilter, search, page]);

  useEffect(() => { loadPlans(); }, [loadPlans]);
  useEffect(() => { load(1); }, [load]);
  useEffect(() => {
    if (page > 1) load(page);
  }, [page]);

  const handleAction = async (restaurantId, action) => {
    if (busyRef.current) return; // double-click guard
    busyRef.current = true;
    try {
      if (action === 'renew') await superAdminApi.renewSubscription(restaurantId);
      else if (action === 'cancel') await superAdminApi.cancelSubscription(restaurantId);
      else if (action === 'suspend') await superAdminApi.suspendSubscription(restaurantId);
      else if (action === 'activate') await superAdminApi.activateSubscription(restaurantId);
      load();
    } catch (e) {
      alert(e.message || `Failed to ${action} subscription`);
    } finally {
      busyRef.current = false;
    }
  };

  const getStatusColor = (status) => {
    const map = { ACTIVE: 'bg-green-50 text-green-600', TRIAL: 'bg-blue-50 text-blue-600', EXPIRED: 'bg-red-50 text-red-600', CANCELLED: 'bg-slate-50 text-slate-500', SUSPENDED: 'bg-amber-50 text-amber-600', 'EXPIRING SOON': 'bg-amber-50 text-amber-700' };
    return map[status] || 'bg-slate-50 text-slate-500';
  };

  // Backend-derived display status: an active subscription within 7 days of
  // expiry shows as EXPIRING SOON; everything else uses the stored status.
  const displayStatus = (s) => {
    if (s.lifecycle === 'EXPIRING_SOON' && s.status === 'ACTIVE') return 'EXPIRING SOON';
    if (s.lifecycle === 'EXPIRED' && (s.status === 'ACTIVE' || s.status === 'TRIAL')) return 'EXPIRED';
    return s.status || '—';
  };

  const displayDays = (s) => {
    if (s.daysRemaining === null || s.daysRemaining === undefined) return '—';
    if (s.lifecycle === 'EXPIRED') return 'Expired';
    return `${s.daysRemaining}d`;
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-xl font-extrabold text-slate-800">Subscription Management</h1>
        <p className="text-xs text-slate-500 mt-1">Manage subscriptions across all restaurants</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search restaurant..." className="w-full h-9 pl-9 pr-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-[#16A34A]" />
        </div>
        <select value={planFilter} onChange={e => setPlanFilter(e.target.value)} className="h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none">
          <option value="">All Plans</option>
          {plans.map(p => <option key={p.id} value={p.code}>{p.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none">
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="EXPIRING_SOON">Expiring Soon</option>
          <option value="TRIAL">Trial</option>
          <option value="EXPIRED">Expired</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
        <select value={expiryFilter} onChange={e => { setExpiryFilter(e.target.value); setPage(1); }} className="h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none">
          <option value="">All Expiry</option>
          <option value="next7">Next 7 Days</option>
          <option value="next30">Next 30 Days</option>
          <option value="expired">Already Expired</option>
        </select>
        <select value={cycleFilter} onChange={e => { setCycleFilter(e.target.value); setPage(1); }} className="h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none" aria-label="Billing cycle">
          <option value="">All Cycles</option>
          <option value="MONTHLY">Monthly</option>
          <option value="YEARLY">Yearly</option>
        </select>
        <button onClick={load} className="h-9 w-9 flex items-center justify-center bg-white border border-slate-200 rounded-xl hover:bg-slate-50"><RefreshCw className="w-3.5 h-3.5 text-slate-500" /></button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[900px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left font-extrabold text-slate-600 uppercase py-3 px-4">Restaurant</th>
                <th className="text-left font-extrabold text-slate-600 uppercase py-3 px-4">Current Plan</th>
                <th className="text-left font-extrabold text-slate-600 uppercase py-3 px-4">Billing Cycle</th>
                <th className="text-left font-extrabold text-slate-600 uppercase py-3 px-4">Status</th>
                <th className="text-left font-extrabold text-slate-600 uppercase py-3 px-4">Start Date</th>
                <th className="text-left font-extrabold text-slate-600 uppercase py-3 px-4">Expiry Date</th>
                <th className="text-left font-extrabold text-slate-600 uppercase py-3 px-4">Days Remaining</th>
                <th className="text-left font-extrabold text-slate-600 uppercase py-3 px-4">Auto Renew</th>
                <th className="text-left font-extrabold text-slate-600 uppercase py-3 px-4">Amount</th>
                <th className="text-right font-extrabold text-slate-600 uppercase py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#16A34A] mx-auto" /></td></tr>
              ) : subscriptions.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-12 text-slate-400">No subscriptions found</td></tr>
              ) : subscriptions.map(s => (
                <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600">{s.restaurant?.name?.charAt(0)}</div>
                      <div>
                        <p className="font-bold text-slate-700">{s.restaurant?.name}</p>
                        <p className="text-[10px] text-slate-400">{s.restaurant?.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 w-fit">{s.planName || s.plan}</span>
                  </td>
                  <td className="py-3 px-4 text-slate-500 text-[10px] uppercase">{s.billingCycle || '—'}</td>
                  <td className="py-3 px-4">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${getStatusColor(displayStatus(s))}`}>{displayStatus(s)}</span>
                  </td>
                  <td className="py-3 px-4 text-slate-500 text-[10px]">{s.startDate ? new Date(s.startDate).toLocaleDateString() : '—'}</td>
                  <td className="py-3 px-4 text-slate-500 text-[10px]">{s.expiryDate ? new Date(s.expiryDate).toLocaleDateString() : '—'}</td>
                  <td className="py-3 px-4">
                    {s.daysRemaining !== null && s.daysRemaining !== undefined ? (
                      <span className={`text-[11px] font-bold ${s.lifecycle === 'EXPIRED' ? 'text-red-600' : s.daysRemaining <= 7 ? 'text-amber-600' : 'text-green-600'}`}>{displayDays(s)}</span>
                    ) : '—'}
                  </td>
                  <td className="py-3 px-4">
                    {s.autoRenew ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-600">Preference</span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-400">Off</span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-600">₹{s.amount || 0}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex gap-1 justify-end flex-wrap">
                      <button onClick={() => setPlanDialog({ subscription: s, mode: 'upgrade' })} className="p-1.5 hover:bg-green-50 rounded-lg text-green-600 cursor-pointer" title="Upgrade Plan"><TrendingUp className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setPlanDialog({ subscription: s, mode: 'downgrade' })} className="p-1.5 hover:bg-amber-50 rounded-lg text-amber-600 cursor-pointer" title="Downgrade Plan"><TrendingDown className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleAction(s.restaurantId, 'renew')} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-600 cursor-pointer" title="Renew"><RotateCcw className="w-3.5 h-3.5" /></button>
                      {(s.status === 'ACTIVE' || s.status === 'TRIAL') && (
                        <button onClick={() => handleAction(s.restaurantId, 'suspend')} className="p-1.5 hover:bg-amber-50 rounded-lg text-amber-600 cursor-pointer" title="Suspend"><Ban className="w-3.5 h-3.5" /></button>
                      )}
                      {(s.status === 'SUSPENDED' || s.status === 'CANCELLED' || s.status === 'EXPIRED') && (
                        <button onClick={() => handleAction(s.restaurantId, 'activate')} className="p-1.5 hover:bg-green-50 rounded-lg text-green-600 cursor-pointer" title="Activate"><PlayCircle className="w-3.5 h-3.5" /></button>
                      )}
                      {s.status !== 'CANCELLED' && s.status !== 'EXPIRED' && (
                        <button onClick={() => handleAction(s.restaurantId, 'cancel')} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500 cursor-pointer" title="Cancel"><XCircle className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagination?.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <span className="text-[10px] text-slate-400">Page {pagination.page} of {pagination.totalPages}</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page <= 1} className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 cursor-pointer"><ChevronLeft className="w-3.5 h-3.5" /></button>
              <button onClick={() => setPage(p => p+1)} disabled={page >= (pagination?.totalPages || 1)} className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 cursor-pointer"><ChevronRight className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        )}
      </div>

      {planDialog && (
        <PlanChangeDialog
          restaurant={{ id: planDialog.subscription.restaurantId, name: planDialog.subscription.restaurant?.name || '' }}
          subscription={planDialog.subscription}
          plans={plans}
          mode={planDialog.mode}
          onClose={() => setPlanDialog(null)}
          onDone={() => { setPlanDialog(null); load(); }}
        />
      )}
    </div>
  );
}
