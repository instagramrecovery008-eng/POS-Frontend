import React, { useState, useCallback } from 'react';
import { useUiStore, useAuthStore } from '../../../store';
import { Search, Clock, Users, Check, Ban, RefreshCw, Loader2 } from 'lucide-react';
import kotApi from '../../../api/kot.api';
import { useSocketEvent } from '../../../hooks/useSocket';
import { canHandleBilling } from '../../../utils/permissions';

export default function KitchenPage() {
  const { setScreen, setCheckoutOrderId } = useUiStore();
  const { user } = useAuthStore();
  // Checkout Desk is a billing/payment workflow action — only billing-capable
  // roles (ADMIN/MANAGER/CASHIER) may open it. KITCHEN and WAITER never see it.
  const canBill = canHandleBilling(user?.role);

  const [kots, setKots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKotId, setSelectedKotId] = useState(null);
  const [activeTab, setActiveTab] = useState('Active');
  const [busyAction, setBusyAction] = useState(null); // 'void' | 'status' | null — prevents duplicate API calls

  const fetchKots = useCallback(async () => {
    try {
      const res = await kotApi.getAll();
      setKots(res?.data || []);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch KOTs:', err);
      setError('Unable to load kitchen tickets. Retrying...');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Real-time updates via WebSocket with polling fallback ──
  useSocketEvent({
    event: 'kot:created',
    handler: (data) => {
      setKots((prev) => {
        const exists = prev.some((k) => k.id === data.kot?.id);
        return exists ? prev : [data.kot, ...prev];
      });
      setLoading(false);
    },
    pollFn: fetchKots,
    pollInterval: 30000,
  });

  useSocketEvent({
    event: 'kot:updated',
    handler: (data) => {
      setKots((prev) =>
        prev.map((k) => (k.id === data.kot?.id ? { ...k, ...data.kot } : k))
      );
      setLoading(false);
    },
  });

  useSocketEvent({
    event: 'kot:cancelled',
    handler: (data) => {
      setKots((prev) => prev.filter((k) => k.id !== data.kot?.id));
      setLoading(false);
    },
  });

  useSocketEvent({
    event: 'order:cancelled',
    handler: () => { fetchKots(); },
  });
  useSocketEvent({
    event: 'order:deleted',
    handler: () => { fetchKots(); },
  });
  useSocketEvent({
    event: 'order:created',
    handler: () => { fetchKots(); },
  });

  // Determine which orders are active vs history based on KOT status
  const activeKots = kots.filter(k =>
    k.status !== 'CANCELLED' && k.status !== 'SERVED'
  );
  const holdKots = kots.filter(k =>
    k.status !== 'CANCELLED' && k.order?.status === 'HOLD'
  );
  const historyKots = kots.filter(k =>
    k.status === 'CANCELLED' || k.status === 'SERVED'
  );

  const getFilteredKots = () => {
    switch (activeTab) {
      case 'Active': return activeKots;
      case 'On Hold': return holdKots;
      case 'History': return historyKots;
      default: return activeKots;
    }
  };

  const filteredKots = getFilteredKots().filter(k => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    return (
      k.kotNo?.toLowerCase().includes(q) ||
      k.order?.table?.tableNo?.toLowerCase().includes(q) ||
      k.order?.orderItems?.some(i => i.menuItem?.name?.toLowerCase().includes(q))
    );
  });

  const selectedKot = kots.find(k => k.id === selectedKotId) || filteredKots[0] || null;

  const handleUpdateKotStatus = async (kotId, newStatus) => {
    if (busyAction) return;
    setBusyAction('status');
    try {
      await kotApi.updateStatus(kotId, newStatus);
      fetchKots();
    } catch (err) {
      console.error('Failed to update KOT status:', err);
    } finally {
      setBusyAction(null);
    }
  };

  const handleVoidKot = async (kotId) => {
    if (busyAction) return;
    setBusyAction('void');
    try {
      await kotApi.cancel(kotId, 'Voided from kitchen');
      fetchKots();
    } catch (err) {
      console.error('Failed to void KOT:', err);
    } finally {
      setBusyAction(null);
    }
  };

  const getNextStatus = (currentStatus) => {
    const sequence = {
      PENDING: 'ACCEPTED',
      ACCEPTED: 'PREPARING',
      PREPARING: 'READY',
      READY: 'SERVED',
    };
    return sequence[currentStatus] || null;
  };

  const getStatusBadge = (status) => {
    const map = {
      PENDING: 'bg-slate-100 text-slate-600',
      ACCEPTED: 'bg-blue-100 text-blue-700',
      PREPARING: 'bg-orange-100 text-orange-800 animate-pulse',
      READY: 'bg-emerald-100 text-emerald-700',
      SERVED: 'bg-indigo-100 text-indigo-700',
      CANCELLED: 'bg-red-100 text-red-600',
    };
    return map[status] || 'bg-slate-100 text-slate-600';
  };

  const getElapsedMinutes = (createdAt) => {
    return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-xs font-semibold">Loading kitchen tickets...</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in max-w-7xl mx-auto md:h-[calc(100vh-80px)] md:min-h-0">
      {/* Left Pane: KOT Ticket List */}
      <div className="md:col-span-1 bg-white rounded-[18px] border border-slate-200 p-3.5 flex flex-col gap-3 md:h-full min-h-0 shadow-xs">
        {/* Search */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search tickets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 h-8.5 bg-slate-50 border border-slate-200 focus:border-[#16A34A] rounded-xl text-xs outline-none"
            />
          </div>
          <button
            onClick={fetchKots}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition-all shrink-0"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px] font-bold shrink-0">
          {['Active', 'On Hold', 'History'].map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setSelectedKotId(null); }}
              className={`flex-1 py-1 rounded-md transition-all cursor-pointer ${
                activeTab === tab
                  ? 'bg-[#16A34A] text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab} ({tab === 'Active' ? activeKots.length : tab === 'On Hold' ? holdKots.length : historyKots.length})
            </button>
          ))}
        </div>

        {/* Ticket list — independent scroll */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
          {filteredKots.map((kot) => {
            const isSelected = selectedKot?.id === kot.id;
            const itemCount = kot.order?.orderItems?.length || 0;
            const elapsed = getElapsedMinutes(kot.createdAt);

            return (
              <div
                key={kot.id}
                onClick={() => setSelectedKotId(kot.id)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                  isSelected
                    ? 'border-[#16A34A] bg-[#16A34A]/5 ring-1 ring-[#16A34A]/30 shadow-xs'
                    : 'border-slate-100 bg-white hover:border-slate-200'
                }`}
              >
                <div className="flex justify-between items-center text-xs">
                  <span className="font-extrabold text-[#16A34A] font-mono">{kot.kotNo}</span>
                  <span className={`text-[10px] font-mono font-bold flex items-center gap-0.5 ${
                    elapsed > 30 ? 'text-red-500' : 'text-slate-400'
                  }`}>
                    <Clock className="w-3 h-3" />
                    {elapsed > 60 ? `${Math.floor(elapsed / 60)}h ${elapsed % 60}m` : `${elapsed}m`}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-xs font-black text-slate-800">
                    {kot.order?.table?.tableNo || '—'}
                  </p>
                  <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase ${getStatusBadge(kot.status)}`}>
                    {kot.status}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-slate-400 border-t border-dashed border-slate-100 pt-1.5">
                  <span className="font-semibold">{(kot.kotItems?.length || 0)} item{(kot.kotItems?.length || 0) !== 1 ? 's' : ''}</span>
                  <span className="font-semibold">{kot.order?.orderType?.replace('_', ' ')}</span>
                </div>
              </div>
            );
          })}
          {filteredKots.length === 0 && (
            <div className="text-center py-16 text-slate-400 text-xs italic">
              No KOT tickets found in {activeTab}.
            </div>
          )}
        </div>
      </div>

      {/* Right Pane: KOT Detail — viewport-bound flex column */}
      <div className="md:col-span-2 bg-white rounded-[20px] border border-slate-200 p-5 flex flex-col md:h-full min-h-0 shadow-xs">
        {selectedKot ? (
          <div className="flex flex-col h-full min-h-0">
            {/* Header — fixed, never scrolls */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-3.5 border-b border-slate-100 shrink-0">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-extrabold text-slate-800 uppercase font-mono">
                    TICKET {selectedKot.kotNo}
                  </h3>
                  <span className={`text-[9px] font-extrabold px-2.5 py-0.5 rounded-full uppercase ${getStatusBadge(selectedKot.status)}`}>
                    {selectedKot.status}
                  </span>
                </div>
                <p className="text-xs font-black text-slate-800">
                  {selectedKot.order?.table?.tableNo || 'Counter'} · {selectedKot.order?.orderType?.replace('_', ' ')}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-500 font-bold">
                <span className="flex items-center gap-0.5 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg">
                  <Clock className="w-3.5 h-3.5 text-[#16A34A]" />
                  {new Date(selectedKot.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                {selectedKot.order?.orderNo && (
                  <span className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg">
                    Order: {selectedKot.order.orderNo}
                  </span>
                )}
              </div>
            </div>

            {/* Items — scrollable content */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 py-3 pr-1">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                Items to prepare
              </p>
              {/* KOTItems are the authoritative source for what this KOT contains. */}
              {(() => {
                const kotItems = selectedKot.kotItems || [];
                if (kotItems.length === 0) {
                  // No KOTItems — this is a legacy KOT or a failed creation.
                  // Show a warning instead of silently falling back to all order items.
                  return (
                    <div className="text-center py-6">
                      <p className="text-[10px] text-amber-600 font-bold bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        ⚠️ No KOTItems recorded for this KOT.
                        {selectedKot.order?.orderItems?.length > 0 && (
                          <span className="block mt-1 text-slate-500">
                            Order has {selectedKot.order.orderItems.length} item(s) but none were tracked in this KOT.
                          </span>
                        )}
                      </p>
                    </div>
                  );
                }
                return kotItems.map((item, idx) => (
                <div key={item.orderItemId || item.id || idx} className="p-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-[#16A34A] font-mono shrink-0">{item.quantity}x</span>
                      <p className="font-extrabold text-xs text-slate-800 truncate">{item.menuItem?.name}</p>
                      {/* Dietary badge (Part 7): ● VEG / ● NON-VEG for every item where known. */}
                      {(() => {
                        const dietary = item.menuItem?.dietaryType || (item.menuItem?.isVeg === true ? 'VEG' : item.menuItem?.isVeg === false ? 'NON_VEG' : null);
                        if (!dietary) return null;
                        return (
                          <span className={`shrink-0 text-[9px] font-extrabold flex items-center gap-0.5 ${dietary === 'VEG' ? 'text-emerald-600' : 'text-red-600'}`}>
                            ● {dietary === 'VEG' ? 'VEG' : 'NON-VEG'}
                          </span>
                        );
                      })()}
                    </div>
                    {item.notes && (
                      <p className="text-[9px] text-red-600 font-bold bg-red-50/50 border border-red-100 rounded px-1.5 py-0.5 mt-1.5 inline-block">
                        ⚠️ {item.notes}
                      </p>
                    )}
                  </div>
                </div>
              ));
              })()}
            </div>

            {/* Actions — fixed bottom bar, never scrolls */}
            <div className="pt-3.5 border-t border-slate-100 shrink-0 space-y-2.5">
              <div className="flex flex-wrap gap-2 justify-between items-center">
                <div className="flex gap-2">
                  <button
                    onClick={() => handleVoidKot(selectedKot.id)}
                    disabled={!!busyAction}
                    className="h-10 px-3 text-[10px] font-bold bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-lg uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {busyAction === 'void' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                    {busyAction === 'void' ? 'Voiding...' : 'Void Ticket'}
                  </button>
                  {canBill && (
                    <button
                      onClick={() => { setCheckoutOrderId(selectedKot.orderId); }}
                      className="h-10 px-3 text-[10px] font-bold bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer"
                    >
                      Checkout Desk
                    </button>
                  )}
                </div>
                <div>
                  {getNextStatus(selectedKot.status) && (
                    <button
                      onClick={() => handleUpdateKotStatus(selectedKot.id, getNextStatus(selectedKot.status))}
                      disabled={!!busyAction}
                      className="h-10 px-4 text-[10px] font-bold bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                    >
                      {busyAction === 'status' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      {busyAction === 'status' ? 'Updating...' : `Mark as ${getNextStatus(selectedKot.status)}`}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 italic text-xs gap-2">
            <Clock className="w-10 h-10 text-slate-200" />
            <p>Select a KOT ticket from the list.</p>
          </div>
        )}
      </div>
    </div>
  );
}
