import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { superAdminApi } from '../../../api/superAdmin.api';
import {
  Search, RefreshCw, Loader2, ChevronLeft, ChevronRight,
  MoreVertical, TrendingUp, TrendingDown, RotateCcw, Ban, PlayCircle, XCircle,
} from 'lucide-react';
import PlanChangeDialog from '../components/PlanChangeDialog';

/**
 * Compact row actions for the subscription list.
 *
 * The previous layout rendered every action as an inline icon inside a
 * `flex-wrap` group; with 4–6 actions the group wrapped onto multiple lines and
 * inflated each row's height inconsistently. A single three-dot trigger plus a
 * labelled dropdown keeps every row exactly one line tall and makes each action
 * self-describing. Every entry opens the existing PlanChangeDialog, which is the
 * confirmation + notes step for financially significant / destructive actions.
 */
function getRowActions(s) {
  const actions = [
    { key: 'upgrade', label: 'Upgrade Plan', icon: TrendingUp, className: 'text-green-600 hover:bg-green-50' },
    { key: 'downgrade', label: 'Downgrade Plan', icon: TrendingDown, className: 'text-amber-600 hover:bg-amber-50' },
    { key: 'renew', label: 'Renew Subscription', icon: RotateCcw, className: 'text-blue-600 hover:bg-blue-50' },
  ];
  if (s.status === 'ACTIVE' || s.status === 'TRIAL') {
    actions.push({ key: 'suspend', label: 'Suspend Subscription', icon: Ban, className: 'text-amber-600 hover:bg-amber-50' });
  }
  if (s.status === 'SUSPENDED' || s.status === 'CANCELLED' || s.status === 'EXPIRED') {
    actions.push({ key: 'activate', label: 'Activate Subscription', icon: PlayCircle, className: 'text-green-600 hover:bg-green-50' });
  }
  if (s.status !== 'CANCELLED' && s.status !== 'EXPIRED') {
    actions.push({ key: 'cancel', label: 'Cancel Subscription', icon: XCircle, className: 'text-red-500 hover:bg-red-50' });
  }
  return actions;
}

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

  // ── Portal-based row action menu (escapes the table's horizontal-scroll
  // clipping, same pattern as RestaurantList) ──
  const [actionMenu, setActionMenu] = useState(null); // subscription id
  const [menuPosition, setMenuPosition] = useState(null); // { top, left }
  const menuButtonRefs = useRef({});
  const MENU_WIDTH = 220;

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

  // ── Action menu positioning (below trigger, clamped to viewport; flips above
  // when there is no room below so the menu never leaves the screen) ──
  const calcMenuPosition = useCallback((subscriptionId) => {
    const btn = menuButtonRefs.current[subscriptionId];
    if (!btn) return null;
    const rect = btn.getBoundingClientRect();
    const menuHeight = 268; // approximate (6 labelled rows)
    const gap = 6;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    let top;
    const spaceBelow = viewportH - rect.bottom;
    const spaceAbove = rect.top;
    if (spaceBelow >= menuHeight + gap) top = rect.bottom + gap;
    else if (spaceAbove >= menuHeight + gap) top = rect.top - gap - menuHeight;
    else top = Math.max(gap, Math.min(rect.bottom + gap, viewportH - menuHeight - gap));

    let left = rect.right - MENU_WIDTH;
    if (left < gap) left = gap;
    if (left + MENU_WIDTH > viewportW - gap) left = viewportW - MENU_WIDTH - gap;

    return { top, left };
  }, []);

  const openMenu = useCallback((subscriptionId) => {
    setActionMenu(subscriptionId);
    requestAnimationFrame(() => setMenuPosition(calcMenuPosition(subscriptionId)));
  }, [calcMenuPosition]);

  const closeMenu = useCallback(() => {
    setActionMenu(null);
    setMenuPosition(null);
  }, []);

  useEffect(() => {
    if (!actionMenu) return;
    const reposition = () => setMenuPosition(calcMenuPosition(actionMenu));
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [actionMenu, calcMenuPosition]);

  useEffect(() => {
    if (!actionMenu) return;
    const handleClickOutside = (e) => {
      const dropdown = document.getElementById('sa-subscription-action-dropdown');
      if (dropdown && dropdown.contains(e.target)) return;
      const btn = menuButtonRefs.current[actionMenu];
      if (btn && btn.contains(e.target)) return;
      closeMenu();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [actionMenu, closeMenu]);

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape' && actionMenu) closeMenu(); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [actionMenu, closeMenu]);

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

  const activeSub = actionMenu != null ? subscriptions.find((s) => s.id === actionMenu) : null;

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-xl font-extrabold text-slate-800">Subscription Management</h1>
        <p className="text-xs text-slate-500 mt-1">Manage subscriptions across all restaurants</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search restaurant..." aria-label="Search restaurant" className="w-full h-9 pl-9 pr-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-[#16A34A]" />
        </div>
        <select value={planFilter} onChange={e => setPlanFilter(e.target.value)} aria-label="Filter by plan" className="h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none">
          <option value="">All Plans</option>
          {plans.map(p => <option key={p.id} value={p.code}>{p.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} aria-label="Filter by status" className="h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none">
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="EXPIRING_SOON">Expiring Soon</option>
          <option value="TRIAL">Trial</option>
          <option value="EXPIRED">Expired</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
        <select value={expiryFilter} onChange={e => { setExpiryFilter(e.target.value); setPage(1); }} aria-label="Filter by expiry" className="h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none">
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
        <button onClick={() => load()} aria-label="Refresh subscriptions" title="Refresh" className="h-9 w-9 flex items-center justify-center bg-white border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer"><RefreshCw className="w-3.5 h-3.5 text-slate-500" /></button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[920px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left font-extrabold text-slate-600 uppercase py-2.5 px-3 whitespace-nowrap">Restaurant</th>
                <th className="text-left font-extrabold text-slate-600 uppercase py-2.5 px-3 whitespace-nowrap">Current Plan</th>
                <th className="text-left font-extrabold text-slate-600 uppercase py-2.5 px-3 whitespace-nowrap">Billing Cycle</th>
                <th className="text-left font-extrabold text-slate-600 uppercase py-2.5 px-3 whitespace-nowrap">Status</th>
                <th className="text-left font-extrabold text-slate-600 uppercase py-2.5 px-3 whitespace-nowrap">Start Date</th>
                <th className="text-left font-extrabold text-slate-600 uppercase py-2.5 px-3 whitespace-nowrap">Expiry Date</th>
                <th className="text-left font-extrabold text-slate-600 uppercase py-2.5 px-3 whitespace-nowrap">Days Remaining</th>
                <th className="text-left font-extrabold text-slate-600 uppercase py-2.5 px-3 whitespace-nowrap">Auto Renew</th>
                <th className="text-left font-extrabold text-slate-600 uppercase py-2.5 px-3 whitespace-nowrap">Amount</th>
                <th className="text-right font-extrabold text-slate-600 uppercase py-2.5 px-3 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#16A34A] mx-auto" /></td></tr>
              ) : subscriptions.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-12 text-slate-400">No subscriptions found</td></tr>
              ) : subscriptions.map(s => (
                <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0">{s.restaurant?.name?.charAt(0)}</div>
                      <div className="leading-tight min-w-0">
                        <p className="font-bold text-slate-700 truncate">{s.restaurant?.name}</p>
                        <p className="text-[10px] text-slate-400 truncate">{s.restaurant?.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">{s.planName || s.plan}</span>
                  </td>
                  <td className="py-2 px-3 text-slate-500 text-[10px] uppercase whitespace-nowrap">{s.billingCycle || '—'}</td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${getStatusColor(displayStatus(s))}`}>{displayStatus(s)}</span>
                  </td>
                  <td className="py-2 px-3 text-slate-500 text-[10px] whitespace-nowrap">{s.startDate ? new Date(s.startDate).toLocaleDateString() : '—'}</td>
                  <td className="py-2 px-3 text-slate-500 text-[10px] whitespace-nowrap">{s.expiryDate ? new Date(s.expiryDate).toLocaleDateString() : '—'}</td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    {s.daysRemaining !== null && s.daysRemaining !== undefined ? (
                      <span className={`text-[11px] font-bold ${s.lifecycle === 'EXPIRED' ? 'text-red-600' : s.daysRemaining <= 7 ? 'text-amber-600' : 'text-green-600'}`}>{displayDays(s)}</span>
                    ) : '—'}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    {s.autoRenew ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-600">Preference</span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-400">Off</span>
                    )}
                  </td>
                  <td className="py-2 px-3 font-bold text-slate-600 whitespace-nowrap">₹{s.amount || 0}</td>
                  <td className="py-2 px-3 text-right">
                    <button
                      ref={(el) => { if (el) menuButtonRefs.current[s.id] = el; else delete menuButtonRefs.current[s.id]; }}
                      onClick={() => (actionMenu === s.id ? closeMenu() : openMenu(s.id))}
                      aria-haspopup="menu"
                      aria-expanded={actionMenu === s.id}
                      aria-label={`Subscription actions for ${s.restaurant?.name || 'restaurant'}`}
                      title="Subscription actions"
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer align-middle"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
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
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page <= 1} aria-label="Previous page" className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 cursor-pointer"><ChevronLeft className="w-3.5 h-3.5" /></button>
              <button onClick={() => setPage(p => p+1)} disabled={page >= (pagination?.totalPages || 1)} aria-label="Next page" className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 cursor-pointer"><ChevronRight className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        )}
      </div>

      {/* Portal-rendered action dropdown — escapes table overflow clipping.
          Every entry routes through PlanChangeDialog (confirmation + notes). */}
      {activeSub && menuPosition && createPortal(
        <div
          id="sa-subscription-action-dropdown"
          role="menu"
          aria-label={`Actions for ${activeSub.restaurant?.name || 'subscription'}`}
          style={{ position: 'fixed', top: menuPosition.top, left: menuPosition.left, zIndex: 9999, width: MENU_WIDTH }}
          className="bg-white border border-slate-200 rounded-xl shadow-2xl py-1 animate-fade-in"
        >
          {getRowActions(activeSub).map(({ key, label, icon: Icon, className }) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              title={label}
              onClick={() => { setPlanDialog({ subscription: activeSub, mode: key }); closeMenu(); }}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-left transition-colors cursor-pointer ${className}`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>,
        document.body
      )}

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
