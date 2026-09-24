import React, { useState, useEffect, useCallback } from 'react';
import { X, Merge, Split, Loader2, Users, Check } from 'lucide-react';
import { tableApi } from '../../../../api/table.api';
import { floorApi } from '../../../../api/floor.api';
import orderApi from '../../../../api/order.api';
import { useUiStore, useSettingsStore } from '../../../../store';

/**
 * Merge Tables / Split Tables modal for the Floors & Tables screen.
 *
 * Merge and split are ALWAYS executed by the existing backend APIs
 * (POST /orders/:id/merge, POST /orders/split) which persist MergeGroup +
 * MergeGroupTable rows in the tenant database inside a transaction.
 * This modal never keeps merge state of its own beyond the current
 * selection — after a successful operation the caller refetches /api/tables.
 *
 * Props:
 *   mode             'merge' | 'split' | null (null = hidden)
 *   onClose          close the modal
 *   onSplitRequested called with { mergeGroupId, label } — the page shows the
 *                    split ConfirmationDialog so every split needs an explicit
 *                    confirm
 *   onChanged        called after a successful merge so the page refetches
 */
export default function TableMergeModal({ mode, onClose, onSplitRequested, onChanged }) {
  const { addToast } = useUiStore();
  const { settings } = useSettingsStore();
  const currency = settings?.currencySymbol || '₹';

  const open = mode === 'merge' || mode === 'split';

  // ── Server data (fetched fresh every time the modal opens) ──
  const [loading, setLoading] = useState(false);
  const [tables, setTables] = useState([]); // raw backend tables
  const [floors, setFloors] = useState([]);
  const [orders, setOrders] = useState([]); // active orders (enriched by backend)

  // ── Merge selection state ──
  const [selected, setSelected] = useState([]); // array of { table, order } in pick order
  const [primaryTableId, setPrimaryTableId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = useCallback(() => {
    setSelected([]);
    setPrimaryTableId(null);
    setSubmitting(false);
    setLoading(false);
    setTables([]);
    setFloors([]);
    setOrders([]);
  }, []);

  useEffect(() => {
    if (!open) { reset(); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [tblResp, floorResp, orderResp] = await Promise.all([
          tableApi.getAll(),
          floorApi.getAll(),
          orderApi.getActive(),
        ]);
        if (cancelled) return;
        const rawTables = tblResp?.tables || tblResp?.data || [];
        const rawFloors = floorResp?.floors || floorResp?.data || [];
        const active = orderResp?.data || orderResp?.orders || [];
        setTables(rawTables);
        setFloors(rawFloors);
        setOrders(active);
      } catch (e) {
        if (!cancelled) {
          const msg = e?.message || 'Failed to load tables.';
          addToast(msg, 'error');
          onClose?.();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Keep the primary pointer on a selected candidate (first pick becomes primary
  // by default; radio buttons can change it afterwards). This must live ABOVE the
  // early return so every render calls the same hooks in the same order
  // (Rules of Hooks). When the modal is closed, `selected` is empty, so this
  // simply keeps primaryTableId null.
  useEffect(() => {
    setPrimaryTableId((cur) => {
      if (cur != null && selected.some((s) => s.table.id === cur)) return cur;
      return selected[0]?.table.id ?? null;
    });
  }, [selected]);

  if (!open) return null;

  const floorName = (id) => {
    const f = floors.find((fl) => String(fl.id) === String(id));
    return f?.name || '';
  };

  // ── Merge candidates ──
  // A table is eligible when it is OCCUPIED, has an ACTIVE order (from the
  // active-orders API) and is not already part of an ACTIVE merge group.
  // Deeper validation (bills, statuses, tenant/ownership) is enforced by the
  // backend merge API and never bypassed.
  const orderByTable = {};
  (orders || []).forEach((o) => {
    if (!o.tableId) return;
    if (orderByTable[o.tableId] === undefined) orderByTable[o.tableId] = o;
  });
  const candidates = (tables || [])
    .filter((t) => {
      const order = orderByTable[t.id];
      if (!order) return false;
      if (t.status !== 'OCCUPIED') return false;
      if (t.mergeGroupId || (Array.isArray(t.mergedTableIds) && t.mergedTableIds.length > 0)) return false;
      if (order.isMerged || order.mergeGroupId) return false;
      return true;
    })
    .map((t) => ({ table: t, order: orderByTable[t.id] }))
    .sort((a, b) => {
      const fa = (a.table.floorId != null ? String(a.table.floorId) : '');
      const fb = (b.table.floorId != null ? String(b.table.floorId) : '');
      if (fa !== fb) return fa.localeCompare(fb);
      return String(a.table.tableNo || '').localeCompare(String(b.table.tableNo || ''), undefined, { numeric: true });
    });

  const isSelected = (tableId) => selected.some((s) => s.table.id === tableId);
  const toggleCandidate = (cand) => {
    setSelected((prev) => {
      const exists = prev.some((s) => s.table.id === cand.table.id);
      return exists ? prev.filter((s) => s.table.id !== cand.table.id) : [...prev, cand];
    });
  };

  const handleMerge = async () => {
    if (submitting) return;
    const primary = selected.find((s) => s.table.id === primaryTableId) || selected[0];
    const sources = selected.filter((s) => s.table.id !== primary?.table.id);
    if (!primary || sources.length === 0) return;
    setSubmitting(true);
    let mergedCount = 0;
    try {
      for (const src of sources) {
        // Reuse the existing backend merge API (transactional, tenant-scoped,
        // validates source/target orders, bills, statuses and merge conflicts).
        await orderApi.mergeOrders(src.order.id, primary.order.id);
        mergedCount += 1;
      }
      const names = selected.map((s) => s.table.tableNo != null ? `Table ${s.table.tableNo}` : s.table.name).filter(Boolean);
      addToast(`Tables merged: ${names.join(' + ')} (${primary.table.tableNo != null ? `Table ${primary.table.tableNo}` : 'primary'} is primary).`, 'success');
      onChanged?.();
      onClose?.();
    } catch (e) {
      const msg = e?.message || 'Failed to merge tables.';
      addToast(msg, 'error');
      // Do NOT reset selections/table state on error — the user can retry/adjust.
    } finally {
      setSubmitting(false);
    }
  };

  // ── Split view — groups are derived ONLY from the persisted API data ──
  const groupsMap = {};
  (tables || []).forEach((t) => {
    if (!t.mergeGroupId) return;
    if (!groupsMap[t.mergeGroupId]) groupsMap[t.mergeGroupId] = [];
    groupsMap[t.mergeGroupId].push(t);
  });
  const mergeGroups = Object.entries(groupsMap)
    .map(([gid, members]) => {
      const sorted = [...members].sort((a, b) =>
        String(a.tableNo || '').localeCompare(String(b.tableNo || ''), undefined, { numeric: true })
      );
      const primary = sorted.find((m) => m.isPrimaryTable) || sorted.find((m) => m.primaryTableId === m.id) || null;
      const label = sorted.map((m) => `Table ${m.tableNo != null ? m.tableNo : m.name}`).filter(Boolean).join(' + ');
      return { mergeGroupId: Number(gid), label, primary, members: sorted };
    })
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 bg-black/40 backdrop-blur-xs animate-fade-in">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-100 flex flex-col max-h-[88vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            {mode === 'merge' ? (
              <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><Merge className="w-4 h-4" /></span>
            ) : (
              <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center"><Split className="w-4 h-4" /></span>
            )}
            <div>
              <h4 className="text-sm font-extrabold text-slate-800">{mode === 'merge' ? 'Merge Tables' : 'Split Tables'}</h4>
              <p className="text-[9px] text-slate-400 font-medium">{mode === 'merge' ? 'Combine occupied tables into one group' : 'Unmerge a merged table group'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 no-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-14 text-slate-400 text-xs">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              <span className="font-semibold">Loading tables...</span>
            </div>
          ) : mode === 'merge' ? (
            <>
              <div className="text-[10px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-2 leading-relaxed">
                Select <span className="font-bold">2 or more occupied tables</span> with active orders. The first selected table becomes the
                primary table by default (you can change it). Merge combines everything into one order/bill group and is stored in the database.
                Already-merged tables must be split first.
              </div>

              {/* Eligible table picker */}
              {candidates.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs italic bg-slate-50/60 rounded-xl border border-dashed border-slate-200 px-3">
                  No mergeable tables right now.
                  <br />
                  <span className="text-[9px] not-italic">Merge requires at least two occupied tables with active orders that are not already merged.</span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {candidates.map((c) => {
                    const on = isSelected(c.table.id);
                    const orderTotal = c.order.grandTotal || c.order.totalAmount || c.order.subtotal || 0;
                    return (
                      <button key={c.table.id} onClick={() => toggleCandidate(c)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          on ? 'border-emerald-400 bg-emerald-50/70 ring-1 ring-emerald-300' : 'border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/30'
                        }`}>
                        <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${on ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 bg-white'}`}>
                          {on && <Check className="w-3.5 h-3.5 text-white" />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5 flex-wrap">
                            {c.table.tableNo != null ? `Table ${c.table.tableNo}` : (c.table.name || 'Table')}
                            <span className="text-[8px] font-bold text-slate-400 bg-slate-100 px-1.5 py-px rounded-full">#{c.order.orderNo || c.order.id}</span>
                          </span>
                          <span className="flex items-center gap-1 text-[9px] text-slate-400 font-medium mt-0.5">
                            <Users className="w-3 h-3" />
                            {c.table.capacity || '—'} pax · {floorName(c.table.floorId) || 'No floor'} · {currency}{Number(orderTotal).toLocaleString('en-IN')}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Review selected + primary */}
              {selected.length > 0 && (
                <div className="space-y-1.5 border-t border-slate-100 pt-2.5">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Selected ({selected.length}) — tap a dot to make it primary</p>
                  <div className="space-y-1">
                    {selected.map((s, i) => {
                      const isPrimary = s.table.id === primaryTableId;
                      return (
                        <div key={s.table.id} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border ${isPrimary ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                          <button onClick={() => setPrimaryTableId(s.table.id)}
                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 cursor-pointer ${isPrimary ? 'border-emerald-500' : 'border-slate-300 hover:border-emerald-400'}`}
                            title={isPrimary ? 'Primary table' : 'Make primary'}>
                            {isPrimary && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
                          </button>
                          <span className="flex-1 text-[11px] font-bold text-slate-700">
                            {i + 1}. {s.table.tableNo != null ? `Table ${s.table.tableNo}` : (s.table.name || 'Table')}
                            <span className="text-[9px] font-medium text-slate-400 ml-1">#{s.order.orderNo || s.order.id}</span>
                          </span>
                          {isPrimary && <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">Primary</span>}
                          <button onClick={() => toggleCandidate(s)} className="text-slate-300 hover:text-red-400 cursor-pointer text-sm leading-none px-1" title="Remove">✕</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="text-[10px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-2 leading-relaxed">
                Merged groups stay merged until you explicitly split them. Splitting restores each table to its own separate table/order.
              </div>
              {mergeGroups.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs italic bg-slate-50/60 rounded-xl border border-dashed border-slate-200 px-3">
                  No active merged groups right now.
                  <br />
                  <span className="text-[9px] not-italic">Merged tables are stored in the database and appear here after any refresh.</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {mergeGroups.map((g) => (
                    <div key={g.mergeGroupId} className="p-2.5 bg-emerald-50/60 border border-emerald-200 rounded-xl">
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <Merge className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="text-xs font-extrabold text-slate-700">{g.label}</span>
                        {g.primary && (
                          <span className="text-[8px] font-black uppercase text-emerald-700 bg-emerald-100 px-1.5 py-px rounded">
                            Primary: {g.primary.tableNo != null ? `Table ${g.primary.tableNo}` : g.primary.name}
                          </span>
                        )}
                      </div>
                      <p className="text-[9px] text-slate-500 font-medium mb-2">
                        {g.members.map((m) => (m.isPrimaryTable ? `${m.tableNo != null ? `Table ${m.tableNo}` : m.name} (primary)` : (m.tableNo != null ? `Table ${m.tableNo}` : m.name))).join(' · ')}
                      </p>
                      <button onClick={() => onSplitRequested?.({ mergeGroupId: g.mergeGroupId, label: g.label })}
                        className="w-full h-8 bg-white border border-amber-300 text-amber-700 rounded-lg text-[10px] font-bold hover:bg-amber-50 cursor-pointer flex items-center justify-center gap-1">
                        <Split className="w-3 h-3" /> Split / Unmerge
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-100 flex gap-2 shrink-0">
          {mode === 'merge' ? (
            <>
              <button onClick={onClose} disabled={submitting}
                className="flex-1 h-9 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 cursor-pointer disabled:opacity-50">Cancel</button>
              <button onClick={handleMerge} disabled={submitting || selected.length < 2}
                className="flex-[2] h-9 bg-[#16A34A] text-white rounded-lg text-xs font-bold hover:bg-[#15803D] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Merge className="w-3.5 h-3.5" />}
                {submitting ? 'Merging...' : `Merge ${selected.length > 0 ? `${selected.length} Tables` : 'Tables'}`}
              </button>
            </>
          ) : (
            <button onClick={onClose} className="flex-1 h-9 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 cursor-pointer">Close</button>
          )}
        </div>
      </div>
    </div>
  );
}
