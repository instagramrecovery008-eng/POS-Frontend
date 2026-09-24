import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus, Search, X, Edit, Trash, RefreshCw, AlertTriangle, Loader2, Tag,
  Percent, Ticket, Users, Power, Eye, Info,
} from 'lucide-react';
import { useUiStore, useSettingsStore } from '../../../store';
import { discountApi } from '../../../api/discount.api';
import { menuApi } from '../../../api/menu.api';
import { categoryApi } from '../../../api/category.api';
import DiscountFormModal from '../components/DiscountFormModal';
import DiscountDetailModal from '../components/DiscountDetailModal';
import ConfirmationDialog from '../../../components/ConfirmationDialog';

const DAY = 24 * 60 * 60 * 1000;

const TYPE_META = {
  PERCENTAGE: { label: 'Percentage', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: Percent },
  FIXED_AMOUNT: { label: 'Fixed Amount', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: Tag },
  STAFF: { label: 'Staff', color: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: Users },
  PROMO_CODE: { label: 'Promo Code', color: 'bg-purple-50 text-purple-700 border-purple-200', icon: Ticket },
};

const STATUS_META = {
  ACTIVE: { label: 'Active', color: 'bg-emerald-100 text-emerald-800' },
  SCHEDULED: { label: 'Scheduled', color: 'bg-blue-100 text-blue-800' },
  EXPIRED: { label: 'Expired', color: 'bg-slate-200 text-slate-600' },
  DISABLED: { label: 'Disabled', color: 'bg-red-100 text-red-700' },
};

const valueLabel = (d) =>
  d.type === 'PERCENTAGE' || d.type === 'STAFF'
    ? `${Number(d.discountValue)}%`
    : `${d.currency || '₹'}${Number(d.discountValue)}`;

const appliesToLabel = (d) => {
  if (d.scope === 'ENTIRE_ORDER') return 'Entire Order';
  if (d.scope === 'CATEGORIES') return `${(d.categoryIds || d._categoryIds || []).length} categories`;
  return `${(d.menuItemIds || d._menuItemIds || []).length} products`;
};

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function DiscountsPage() {
  const { addToast } = useUiStore();
  const { settings } = useSettingsStore();
  const currency = settings?.currencySymbol || '₹';

  const [discounts, setDiscounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');

  const [showForm, setShowForm] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState(null);
  const [viewingDiscount, setViewingDiscount] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiving, setArchiving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(null);


  const loadDiscounts = useCallback(async (showRetryToast = false) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await discountApi.getAll();
      const list = Array.isArray(resp?.data) ? resp.data : [];
      setDiscounts(list);
      if (showRetryToast) addToast('Discounts loaded successfully.', 'success');
    } catch (e) {
      console.error('Failed to load discounts:', e);
      setError(e.message || 'Failed to load discounts.');
      addToast(e.message || 'Failed to load discounts.', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadDiscounts(); }, [loadDiscounts]);

  // ── Real usage stats (§2): today's discount amount + discounted orders ──
  const [usageStats, setUsageStats] = useState(null);
  const loadUsageStats = useCallback(async () => {
    try {
      const resp = await discountApi.getUsageStats();
      setUsageStats(resp?.data || null);
    } catch {
      // Non-critical — summary cards still show status counts
      setUsageStats(null);
    }
  }, []);

  useEffect(() => { loadUsageStats(); }, [loadUsageStats]);

  // ── Summary cards (real data, derived status from backend) ──
  const summary = useMemo(() => {
    const list = discounts || [];
    return {
      active: list.filter((d) => d.effectiveStatus === 'ACTIVE').length,
      scheduled: list.filter((d) => d.effectiveStatus === 'SCHEDULED').length,
      expired: list.filter((d) => d.effectiveStatus === 'EXPIRED').length,
      disabled: list.filter((d) => d.effectiveStatus === 'DISABLED').length,
    };
  }, [discounts]);

  const filtered = useMemo(() => {
    let list = discounts || [];
    if (statusFilter !== 'ALL') list = list.filter((d) => d.effectiveStatus === statusFilter);
    if (typeFilter !== 'ALL') list = list.filter((d) => d.type === typeFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          (d.promoCode?.code || '').toLowerCase().includes(q) ||
          (d.description || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [discounts, statusFilter, typeFilter, searchQuery]);

  const handleArchiveConfirm = async () => {
    if (!archiveTarget || archiving) return;
    setArchiving(true);
    try {
      await discountApi.archive(archiveTarget.id);
      addToast(`"${archiveTarget.name}" archived.`, 'success');
      setArchiveTarget(null);
      loadDiscounts();
    } catch (e) {
      addToast(e.message || 'Failed to archive discount.', 'error');
    } finally {
      setArchiving(false);
    }
  };

  const handleToggleStatus = async (d) => {
    const next = d.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    setStatusUpdating(d.id);
    try {
      await discountApi.setStatus(d.id, next);
      addToast(next === 'ACTIVE' ? `"${d.name}" activated.` : `"${d.name}" disabled.`, 'success');
      loadDiscounts();
    } catch (e) {
      addToast(e.message || 'Failed to update status.', 'error');
    } finally {
      setStatusUpdating(null);
    }
  };

  const statusCards = [
    { key: 'ACTIVE', label: 'Active', value: summary.active, dot: 'bg-emerald-500', onClick: () => setStatusFilter(statusFilter === 'ACTIVE' ? 'ALL' : 'ACTIVE') },
    { key: 'SCHEDULED', label: 'Scheduled', value: summary.scheduled, dot: 'bg-blue-500', onClick: () => setStatusFilter(statusFilter === 'SCHEDULED' ? 'ALL' : 'SCHEDULED') },
    { key: 'EXPIRED', label: 'Expired', value: summary.expired, dot: 'bg-slate-400', onClick: () => setStatusFilter(statusFilter === 'EXPIRED' ? 'ALL' : 'EXPIRED') },
    { key: 'DISABLED', label: 'Disabled', value: summary.disabled, dot: 'bg-red-500', onClick: () => setStatusFilter(statusFilter === 'DISABLED' ? 'ALL' : 'DISABLED') },
  ];

  // Today's discount amount + total discounted orders (real OrderDiscount data)
  const statCards = [
    { label: "Today's Discount Amount", value: `${currency}${Number(usageStats?.todayDiscountAmount || 0).toFixed(2)}` },
    { label: 'Total Discounted Orders', value: usageStats?.totalDiscountedOrders ?? 0 },
  ];

  return (
    <div className="space-y-4 animate-fade-in max-w-7xl mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h3 className="text-lg font-extrabold text-[#191c1e]">Discounts &amp; Promotions</h3>
          <p className="text-[11px] text-slate-500 font-medium">Configure promotions, staff discounts and promo codes</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadDiscounts(true)}
            className="p-2 hover:bg-slate-100 rounded-lg"
            title="Refresh"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => { setEditingDiscount(null); setShowForm(true); }}
            className="h-8.5 px-3 bg-[#16A34A] hover:bg-[#15803D] text-white font-bold rounded-xl text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" /> + Create Discount
          </button>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statusCards.map((card) => (
          <button
            key={card.key}
            onClick={card.onClick}
            className={`bg-white rounded-[18px] border p-4 shadow-xs text-left transition-all cursor-pointer hover:shadow-md ${
              statusFilter === card.key ? 'border-[#16A34A]' : 'border-slate-200'
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`w-2 h-2 rounded-full ${card.dot}`} />
              <p className="text-[9px] font-bold uppercase text-slate-500 tracking-wider">{card.label}</p>
            </div>
            <p className="text-xl font-extrabold text-slate-800">{loading ? '…' : card.value}</p>
          </button>
        ))}
      </div>

      {/* ── Usage stats (real OrderDiscount data) ── */}
      <div className="grid grid-cols-2 gap-3">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
            <p className="text-[9px] font-bold uppercase text-slate-500 tracking-wider mb-1.5">{card.label}</p>
            <p className="text-lg font-extrabold text-[#16A34A]">{card.value}</p>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search discounts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 h-8.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-[#16A34A]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-8.5 px-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-[#16A34A] cursor-pointer"
        >
          <option value="ALL">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SCHEDULED">Scheduled</option>
          <option value="EXPIRED">Expired</option>
          <option value="DISABLED">Disabled</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-8.5 px-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-[#16A34A] cursor-pointer"
        >
          <option value="ALL">All Types</option>
          <option value="PERCENTAGE">Percentage</option>
          <option value="FIXED_AMOUNT">Fixed Amount</option>
          <option value="STAFF">Staff</option>
          <option value="PROMO_CODE">Promo Code</option>
        </select>
        {(searchQuery || statusFilter !== 'ALL' || typeFilter !== 'ALL') && (
          <button
            onClick={() => { setSearchQuery(''); setStatusFilter('ALL'); setTypeFilter('ALL'); }}
            className="h-8.5 px-3 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-600 flex items-center gap-1 cursor-pointer"
          >
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* ── Error state ── */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-[18px] p-6 text-center">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-sm font-bold text-red-700 mb-1">Failed to Load Discounts</p>
          <p className="text-xs text-red-500 mb-4">{error}</p>
          <button
            onClick={() => loadDiscounts(true)}
            className="h-8.5 px-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Loading state ── */}
      {loading && (
        <div className="bg-white rounded-[18px] border border-slate-200 p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#16A34A] mx-auto mb-3" />
          <p className="text-xs font-semibold text-slate-500">Loading discounts...</p>
        </div>
      )}

      {/* ── Table ── */}
      {!loading && !error && (
        <div className="bg-white rounded-[18px] border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-50">
                <tr>
                  {['Discount', 'Type', 'Applies To', 'Value', 'Valid From', 'Valid Until', 'Usage', 'Status', 'Actions'].map((h) => (
                    <th key={h} className={`py-2.5 px-3 text-[9px] font-bold uppercase text-slate-500 tracking-wider whitespace-nowrap ${h === 'Actions' ? 'text-right' : 'text-left'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => {
                  const typeMeta = TYPE_META[d.type] || TYPE_META.PERCENTAGE;
                  const statusMeta = STATUS_META[d.effectiveStatus] || STATUS_META.EXPIRED;
                  const TypeIcon = typeMeta.icon;
                  return (
                    <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="py-2.5 px-3">
                        <p className="font-bold text-slate-800 truncate max-w-[180px]" title={d.name}>{d.name}</p>
                        {d.promoCode && (
                          <p className="text-[9px] font-mono font-bold text-purple-600">#{d.promoCode.code}</p>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border ${typeMeta.color}`}>
                          <TypeIcon className="w-3 h-3" /> {typeMeta.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{appliesToLabel(d)}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                        {valueLabel({ ...d, currency })}
                        {d.maximumDiscountAmount ? (
                          <span className="block text-[8px] font-semibold text-slate-400">max {currency}{Number(d.maximumDiscountAmount)}</span>
                        ) : null}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{fmtDate(d.startDate)}</td>
                      <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{fmtDate(d.endDate)}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {d.usageLimit != null ? `${d.usageCount}/${d.usageLimit}` : d.usageCount}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${statusMeta.color}`}>
                          {statusMeta.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setViewingDiscount(d)}
                            className="p-1.5 bg-slate-100 hover:bg-sky-100 rounded text-slate-500 cursor-pointer"
                            title="View"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { setEditingDiscount(d); setShowForm(true); }}
                            className="p-1.5 bg-slate-100 hover:bg-emerald-100 rounded text-slate-500 cursor-pointer"
                            title="Edit"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleToggleStatus(d)}
                            disabled={statusUpdating === d.id}
                            className="p-1.5 bg-slate-100 hover:bg-amber-100 rounded text-slate-500 cursor-pointer disabled:opacity-50"
                            title={d.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                          >
                            {statusUpdating === d.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Power className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() => setArchiveTarget(d)}
                            className="p-1.5 bg-slate-100 hover:bg-red-100 rounded text-slate-500 cursor-pointer"
                            title="Archive"
                          >
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-14 text-center">
                      <Tag className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                      <p className="text-xs italic text-slate-400">
                        {searchQuery || statusFilter !== 'ALL' || typeFilter !== 'ALL'
                          ? 'No discounts match your filters.'
                          : 'No discounts yet. Create your first promotion to get started.'}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Info note: effective status is server-derived ── */}
      {!loading && !error && (discounts || []).length > 0 && (
        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-semibold px-1">
          <Info className="w-3 h-3 shrink-0" />
          Status is derived from the schedule by the server — EXPIRED cannot be set manually.
        </div>
      )}

      {/* ── Create/Edit modal ── */}
      {showForm && (
        <DiscountFormModal
          discount={editingDiscount}
          currency={currency}
          onClose={() => { setShowForm(false); setEditingDiscount(null); }}
          onSaved={() => { setShowForm(false); setEditingDiscount(null); loadDiscounts(); }}
        />
      )}

      {/* ── View modal ── */}
      {viewingDiscount && (
        <DiscountDetailModal
          discount={viewingDiscount}
          currency={currency}
          onClose={() => setViewingDiscount(null)}
          onEdit={() => { setEditingDiscount(viewingDiscount); setViewingDiscount(null); setShowForm(true); }}
        />
      )}

      {/* ── Archive confirmation ── */}
      <ConfirmationDialog
        isOpen={!!archiveTarget}
        onClose={() => { if (!archiving) setArchiveTarget(null); }}
        onConfirm={handleArchiveConfirm}
        title="Archive Discount?"
        message={`Are you sure you want to archive "${archiveTarget?.name || 'this discount'}"? It will no longer be applicable. Past orders keep the discounts they already received.`}
        confirmLabel="Archive"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={archiving}
      />
    </div>
  );
}
