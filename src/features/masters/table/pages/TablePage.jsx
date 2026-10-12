import React, { useState, useEffect } from 'react';
import { Layers, Plus, Edit, Trash, Users, X, ArrowRight, Check, Move, Merge, GripVertical, Split, Loader2 } from 'lucide-react';
import { useAuthStore, useCartStore, useUiStore, useSettingsStore } from '../../../../store';
import ConfirmationDialog from '../../../../components/ConfirmationDialog';
import { tableApi } from '../../../../api/table.api';
import { floorApi } from '../../../../api/floor.api';
import orderApi from '../../../../api/order.api';
import { useSocketEvent } from '../../../../hooks/useSocket';
import TableMergeModal from '../components/TableMergeModal';
import { canHandleBilling } from '../../../../utils/permissions';
import { isAcNonAcPricingEnabled } from '../../../../utils/businessCapabilities';

// Module-level cache to prevent refetch on remount
let cachedTables = null;
let cachedTablesFetched = 0;
const CACHE_TTL = 60000; // 1 minute

export default function TablesPage() {
  const { user } = useAuthStore();
  const isAdmin = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user?.role?.toUpperCase());
  const isServiceStaff = (user?.role || '').toUpperCase() === 'WAITER';
  // Checkout opens the payment overlay — restricted to billing-capable roles
  const canBill = canHandleBilling(user?.role);
  const { setScreen, setActiveOrderTakingId, setCheckoutOrderId, setShowTakeOrderWizard, addToast, refreshTrigger, incrementRefreshTrigger } = useUiStore();
  const { settings } = useSettingsStore();
  const currency = settings?.currencySymbol || '₹';
  // AC / Non-AC table type is a RESTAURANT-mode feature only — the selector is
  // never shown for Basic POS / Quick Billing / retail (backend enforces too).
  const acNonAcPricing = isAcNonAcPricingEnabled(settings);

  const [tables, setTables] = useState(cachedTables || []);
  const [floors, setFloors] = useState([]);
  // Distinguishes "no floors exist" from "the floor request failed". A failed
  // request must never look like the unrestricted (Case A) empty state.
  const [floorLoadError, setFloorLoadError] = useState(null);
  const [selectedFloorId, setSelectedFloorId] = useState('');
  const [loading, setLoading] = useState(!cachedTables);
  const [showDesigner, setShowDesigner] = useState(false);
  const [designerMode, setDesignerMode] = useState('tables');

  // Merge Tables / Split Tables modal (DB-persisted MergeGroup)
  const [mergeModalMode, setMergeModalMode] = useState(null); // null | 'merge' | 'split'
  const [splitConfirm, setSplitConfirm] = useState(null); // { mergeGroupId, label } awaiting explicit confirmation
  const [splitLoading, setSplitLoading] = useState(false);

  // Modals
  const [showOpenTableModal, setShowOpenTableModal] = useState(false);
  const [guestCount, setGuestCount] = useState(2);
  const [activeTableNumber, setActiveTableNumber] = useState(null);
  const [showOccupiedModal, setShowOccupiedModal] = useState(false);
  const [selectedOccupiedTable, setSelectedOccupiedTable] = useState(null);

  // Table form
  const [tableNum, setTableNum] = useState(1);
  const [tableName, setTableName] = useState('');
  const [tableSeats, setTableSeats] = useState(4);
  const [tableShape, setTableShape] = useState('Rectangle');
  const [tableFloorId, setTableFloorId] = useState('');
  const [editingTableId, setEditingTableId] = useState(null);

  // Floor form
  const [floorName, setFloorName] = useState('');
  const [floorCode, setFloorCode] = useState('');
  const [floorDescription, setFloorDescription] = useState('');
  const [floorIsActive, setFloorIsActive] = useState(true);
  const [floorColor, setFloorColor] = useState('#16A34A');
  const [floorType, setFloorType] = useState('NON_AC');
  const [editingFloorId, setEditingFloorId] = useState(null);
  const [floorSortOrder, setFloorSortOrder] = useState(0);
  const [floorSaving, setFloorSaving] = useState(false);
  const [tableSaving, setTableSaving] = useState(false);

  // Delete confirmations (replaces native window.confirm — touch-friendly)
  const [deleteTableTarget, setDeleteTableTarget] = useState(null);
  const [deleteFloorTarget, setDeleteFloorTarget] = useState(null);
  const [deletingTable, setDeletingTable] = useState(false);
  const [deletingFloor, setDeletingFloor] = useState(false);

  // Merge info comes from the backend (DB MergeGroup). No client-only merge
  // state is stored — mergeGroupId/isMerged/... are copied straight from the
  // API response and never reset to defaults, so a persisted merge always
  // survives refresh, navigation, logout/login and backend restarts.

  useEffect(() => {
    loadFloors();
    const now = Date.now();
    if (!cachedTables || now - cachedTablesFetched > CACHE_TTL) {
      loadTables();
    }
  }, []);

  const loadFloors = async () => {
    setFloorLoadError(null);
    try {
      const resp = await floorApi.getAll();
      if (resp.floors?.length) {
        setFloors(resp.floors);
        if (!selectedFloorId && resp.floors[0]?.id) {
          setSelectedFloorId(resp.floors[0].id);
        }
        // If selected floor was deleted, reset to first available
        if (selectedFloorId && !resp.floors.find(f => f.id === selectedFloorId)) {
          setSelectedFloorId(resp.floors[0]?.id || '');
        }
      } else {
        setFloors([]);
      }
    } catch (e) {
      // Error state — surface it instead of silently rendering an empty
      // (and therefore misleading) floor list.
      console.error('Failed to load floors:', e);
      setFloors([]);
      setFloorLoadError(e?.message || 'Failed to load floors');
    }
  };

  const loadTables = async () => {
    setLoading(true);
    try {
      const resp = await tableApi.getAll();
      if (resp.tables?.length) {
        const mapped = resp.tables.map((t) => ({
          id: `t-${t.id}`,
          number: parseInt(t.tableNo) || t.id,
          name: t.name || `Table ${String(t.tableNo).padStart(2, '0')}`,
          seats: t.capacity || 4,
          shape: t.shape || 'Rectangle',
          // Inherited from the floor (floor wins); tableType is the fallback.
          floorType: t.floorType || t.tableType || 'NON_AC',
          floorId: t.floorId != null ? t.floorId : '',
          status: t.status === 'OCCUPIED' ? 'Occupied' : t.status === 'AVAILABLE' ? 'Available' : t.status || 'Available',
          currentOrderId: null,
          // ── Persisted merge info (DB MergeGroup + MergeGroupTable) ──
          // Carried through verbatim from GET /api/tables. NEVER reset to
          // merged=false here — the DB is the source of truth and a merge must
          // survive refresh, navigation, logout/login and backend restart.
          tableNo: t.tableNo != null ? String(t.tableNo) : '',
          mergeGroupId: t.mergeGroupId ?? null,
          isMerged: !!(t.isMerged || t.mergeGroupId || (Array.isArray(t.mergedTableIds) && t.mergedTableIds.length > 0)),
          isPrimaryTable: !!t.isPrimaryTable,
          primaryTableId: t.primaryTableId ?? null,
          primaryTableNo: t.primaryTableNo ?? null,
          mergedTableIds: Array.isArray(t.mergedTableIds) ? t.mergedTableIds : [],
          mergedTableNos: Array.isArray(t.mergedTableNos) ? t.mergedTableNos : [],
        }));
        setTables(mapped);
        cachedTables = mapped;
        cachedTablesFetched = Date.now();
      } else {
        setTables([]);
        cachedTables = [];
        cachedTablesFetched = Date.now();
      }
    } catch (e) {
      console.error('Failed to load tables:', e);
      setTables([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredTables = tables.filter(t => String(t.floorId) === String(selectedFloorId));

  // ── Floors & Tables cache clearing + cross-screen refresh ──
  const invalidateFloorsTablesCache = () => {
    cachedTablesFetched = 0;
    if (typeof incrementRefreshTrigger === 'function') incrementRefreshTrigger();
  };
  const invalidateCache = invalidateFloorsTablesCache;

  // Re-fetch when data changes (triggered by TakeOrderWizard) — but only if cache is stale
  React.useEffect(() => {
    if (refreshTrigger > 0) {
      const now = Date.now();
      if (!cachedTables || now - cachedTablesFetched > CACHE_TTL) {
        cachedTablesFetched = 0;
        loadTables();
        loadFloors();
      }
    }
  }, [refreshTrigger]);

  // ── Real-time updates via WebSocket ──
  // Invalidate cache and re-fetch when any order changes (affects table occupancy status)
  const invalidateAndReload = () => {
    cachedTablesFetched = 0;
    loadTables();
    loadFloors();
  };
  useSocketEvent({ event: 'order:created', handler: invalidateAndReload });
  useSocketEvent({ event: 'order:updated', handler: invalidateAndReload });
  useSocketEvent({ event: 'order:cancelled', handler: invalidateAndReload });
  useSocketEvent({ event: 'order:deleted', handler: invalidateAndReload });
  // Merge/split events → refetch from the DB (never derive merge from socket state alone)
  useSocketEvent({ event: 'order:merged', handler: invalidateAndReload });
  useSocketEvent({ event: 'order:split', handler: invalidateAndReload });
  // ── Periodic polling fallback (every 30s) — covers socket-disconnected edge cases ──
  React.useEffect(() => {
    const interval = setInterval(() => {
      cachedTablesFetched = 0;
      loadTables();
      loadFloors();
    }, 30000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTableClick = (table) => {
    if (table.status === 'Occupied') {
      setSelectedOccupiedTable(table);
      setShowOccupiedModal(true);
    } else if (table.status === 'Reserved' || table.status === 'Cleaning') {
      return;
    } else {
      setActiveTableNumber(table.number);
      setGuestCount(table.seats);
      setShowOpenTableModal(true);
    }
  };

  const handleOpenTable = (e) => {
    e.preventDefault();
    if (activeTableNumber === null) return;
    // Mark the table as Occupied locally for visual feedback.
    // Do NOT set a fake 'ord-{timestamp}' as activeOrderTakingId —
    // the TakeOrderWizard will create a NEW order (no activeOrderTakingId)
    // and the backend will assign the real database Order.id.
    setTables(prev => prev.map(t => t.number === activeTableNumber
      ? { ...t, status: 'Occupied', currentOrderId: null, guestsCount: guestCount, billAmount: 0 }
      : t
    ));
    setShowOpenTableModal(false);
    setShowTakeOrderWizard(true);
    // Do NOT call setActiveOrderTakingId — leave it null so the wizard
    // operates in "new order" mode and never attempts GET /api/orders/{fakeId}
  };

  const handleChangeStatus = (tableId, newStatus) => {
    setTables(prev => prev.map(t =>
      t.id === tableId ? { ...t, status: newStatus } : t
    ));
  };

  // Table CRUD
  const handleSaveTable = async (e) => {
    e.preventDefault();
    if (!tableName || !tableFloorId) {
      addToast('Please select a floor for the table.', 'warning');
      return;
    }
    if (tableSaving) return; // guard against duplicate submits
    setTableSaving(true);
    try {
      if (editingTableId) {
        const backendId = parseInt(editingTableId.replace('t-', ''));
        await tableApi.update(backendId, {
          tableNo: String(tableNum),
          name: tableName,
          capacity: tableSeats,
          shape: tableShape,
          floorId: tableFloorId ? Number(tableFloorId) : null,
        });
        // Type is inherited from the (possibly new) floor.
        const updatedFloorType = floors.find(f => String(f.id) === String(tableFloorId))?.floorType || 'NON_AC';
        setTables(prev => prev.map(t =>
          t.id === editingTableId
            ? { ...t, number: tableNum, name: tableName, seats: tableSeats, shape: tableShape, floorType: updatedFloorType, floorId: tableFloorId }
            : t
        ));
        setEditingTableId(null);
        addToast('Table updated successfully.', 'success');
        invalidateFloorsTablesCache();
      } else {
        const resp = await tableApi.create({
          tableNo: String(tableNum),
          name: tableName,
          capacity: tableSeats,
          shape: tableShape,
          floorId: tableFloorId ? Number(tableFloorId) : null,
        });
        if (resp.success && resp.table) {
          addToast('Table created successfully.', 'success');
          const newTable = {
            id: `t-${resp.table.id}`,
            number: tableNum,
            name: tableName,
            seats: tableSeats,
            shape: tableShape,
            floorType: floors.find(f => String(f.id) === String(tableFloorId))?.floorType || 'NON_AC',
            floorId: tableFloorId,
            status: 'Available',
            currentOrderId: null,
          };
          setTables(prev => [...prev, newTable]);
        }
      }
      invalidateFloorsTablesCache();
      setTableName('');
      setTableSeats(4);
      setTableShape('Rectangle');
      setTableFloorId('');
    } catch (e) {
      const msg = e.message || 'Failed to save table.';
      addToast(msg, 'error');
      console.error('Failed to save table:', e);
    } finally {
      setTableSaving(false);
    }
  };

  // Table card actions
  const handleEditTable = (tbl) => {
    setEditingTableId(tbl.id);
    setTableName(tbl.name);
    setTableNum(tbl.number);
    setTableSeats(tbl.seats);
    setTableShape(tbl.shape);
    setTableFloorId(tbl.floorId);
    setShowDesigner(true);
    setDesignerMode('tables');
  };

  const handleDeleteTableConfirm = async () => {
    const tbl = deleteTableTarget;
    if (!tbl || deletingTable) return; // guard against duplicate requests
    setDeletingTable(true);
    const id = tbl.id;
    try {
      cachedTablesFetched = 0; // Invalidate cache
      await tableApi.delete(parseInt(id.replace('t-', '')));
      setTables(prev => prev.filter(t => t.id !== id));
      addToast(`Table "${tbl.name}" deleted.`, 'success');
      invalidateFloorsTablesCache();
      setDeleteTableTarget(null);
    } catch (e) {
      const msg = e.message || 'Failed to delete table.';
      addToast(msg, 'error');
      setDeleteTableTarget(null);
    } finally {
      setDeletingTable(false);
    }
  };

  // Floor CRUD — connected to backend
  const handleSaveFloor = async (e) => {
    e.preventDefault();
    if (!floorName) {
      addToast('Floor name is required.', 'error');
      return;
    }
    setFloorSaving(true);
    try {
      if (editingFloorId) {
        await floorApi.update(Number(editingFloorId), {
          name: floorName,
          floorCode: floorCode || null,
          description: floorDescription || null,
          isActive: floorIsActive,
          sortOrder: floorSortOrder,
          ...(acNonAcPricing ? { floorType } : {}),
        });
        // Tables inherit the floor type — reflect it locally for the tables on
        // this floor without waiting for a refetch.
        setFloors(prev => prev.map(f =>
          f.id === editingFloorId ? { ...f, name: floorName, floorCode: floorCode || null, description: floorDescription || null, isActive: floorIsActive, sortOrder: floorSortOrder, ...(acNonAcPricing ? { floorType } : {}) } : f
        ));
        if (acNonAcPricing) {
          setTables(prev => prev.map(t => String(t.floorId) === String(editingFloorId) ? { ...t, floorType } : t));
        }
        addToast(`Floor "${floorName}" updated.`, 'success');
        setEditingFloorId(null);
      } else {
        const resp = await floorApi.create({
          name: floorName,
          floorCode: floorCode || null,
          description: floorDescription || null,
          isActive: floorIsActive,
          sortOrder: floorSortOrder,
          ...(acNonAcPricing ? { floorType } : {}),
        });
        if (resp.success && resp.floor) {
          setFloors(prev => [...prev, resp.floor]);
          addToast(`Floor "${floorName}" created.`, 'success');
        }
      }
      setFloorName('');
      setFloorCode('');
      setFloorDescription('');
      setFloorIsActive(true);
      setFloorColor('#16A34A');
      setFloorType('NON_AC');
      setFloorSortOrder(0);
      invalidateFloorsTablesCache();
    } catch (e) {
      const msg = e.message || 'Failed to save floor.';
      addToast(msg, 'error');
    } finally {
      setFloorSaving(false);
    }
  };

  const handleDeleteFloorConfirm = async () => {
    const floor = deleteFloorTarget;
    if (!floor || deletingFloor) return; // guard against duplicate requests
    setDeletingFloor(true);
    const id = floor.id;
    try {
      await floorApi.delete(Number(id));
      setFloors(prev => prev.filter(f => f.id !== id));
      // If deleted floor was selected, switch to first available
      if (selectedFloorId === id) {
        const remaining = floors.filter(f => f.id !== id);
        setSelectedFloorId(remaining[0]?.id || '');
      }
      addToast(`Floor "${floor.name}" deleted.`, 'success');
      invalidateFloorsTablesCache();
      setDeleteFloorTarget(null);
    } catch (e) {
      const msg = e.message || 'Failed to delete floor.';
      addToast(msg, 'error');
      setDeleteFloorTarget(null);
    } finally {
      setDeletingFloor(false);
    }
  };

  // ── Merge / Split Tables (DB-persisted MergeGroup + MergeGroupTable) ──
  // Merge is executed by the existing backend order-merge API inside a tenant
  // transaction. After any merge/split we refetch from the backend — the DB is
  // the source of truth and client state is rebuilt from the API response.
  const reloadAfterMergeChange = () => {
    cachedTablesFetched = 0; // bypass 1-min cache
    loadTables();
    loadFloors();
    if (typeof incrementRefreshTrigger === 'function') incrementRefreshTrigger();
  };

  const handleSplitGroupConfirm = async () => {
    if (!splitConfirm || splitLoading) return;
    setSplitLoading(true);
    try {
      await orderApi.splitOrders(splitConfirm.mergeGroupId);
      addToast('Tables split successfully.', 'success');
      setSplitConfirm(null);
      setMergeModalMode(null);
      reloadAfterMergeChange();
    } catch (e) {
      const msg = e?.message || 'Failed to split tables.';
      addToast(msg, 'error');
      setSplitConfirm(null);
    } finally {
      setSplitLoading(false);
    }
  };

  const statusColors = {
    Available: 'border-slate-200 bg-slate-50/50 hover:bg-slate-100',
    Occupied: 'bg-red-50/40 border-red-200 ring-1 ring-red-200/50',
    Reserved: 'bg-amber-50/40 border-amber-200 ring-1 ring-amber-200/50',
    Cleaning: 'bg-blue-50/40 border-blue-200 ring-1 ring-blue-200/50',
  };

  const statusBadgeColors = {
    Available: 'bg-slate-200 text-slate-600',
    Occupied: 'bg-red-100 text-red-700',
    Reserved: 'bg-amber-100 text-amber-700',
    Cleaning: 'bg-blue-100 text-blue-700',
  };

  return (
    <div className="space-y-4 animate-fade-in max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h3 className="text-lg font-extrabold text-[#191c1e]">Restaurant Floors & Tables</h3>
          <p className="text-[11px] text-slate-500">View real-time layout occupancy and manage guest seating.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {isAdmin && settings?.enableMergeTables !== false && (
            <>
              <button onClick={() => setMergeModalMode('merge')}
                className="px-3 h-8 text-[11px] font-bold border border-emerald-300 rounded-lg bg-white text-emerald-700 hover:bg-emerald-50 transition-colors flex items-center gap-1.5 cursor-pointer" title="Merge two or more occupied tables with active orders">
                <Merge className="w-3.5 h-3.5" />
                <span>Merge Tables</span>
              </button>
              <button onClick={() => setMergeModalMode('split')}
                className="px-3 h-8 text-[11px] font-bold border border-amber-300 rounded-lg bg-white text-amber-700 hover:bg-amber-50 transition-colors flex items-center gap-1.5 cursor-pointer" title="Split / unmerge a merged table group">
                <Split className="w-3.5 h-3.5" />
                <span>Split Tables</span>
              </button>
            </>
          )}
          {isAdmin && (
            <button onClick={() => setShowDesigner(p => !p)}
              className={`px-3 h-8 text-[11px] font-bold border rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${showDesigner ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>
              <Layers className="w-3.5 h-3.5" />
              <span>{showDesigner ? 'Exit Designer' : 'Floor Designer'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Floor Tabs */}
      <div className="flex justify-between items-center border-b border-slate-200">
        <div className="flex gap-1 overflow-x-auto pb-px">
          {floors.map((fl) => (
            <button key={fl.id} onClick={() => setSelectedFloorId(fl.id)}
              className={`px-4 py-2 text-xs font-bold border-b-2 -mb-px transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                selectedFloorId === fl.id ? 'border-[#16A34A] text-[#16A34A]' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}>
              <span className={`w-2 h-2 rounded-full ${fl.isActive !== false ? 'bg-[#16A34A]' : 'bg-slate-300'}`} />
              {fl.name}
              {acNonAcPricing && (
                <span className={`text-[8px] font-bold px-1 rounded ${fl.floorType === 'AC' ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-500'}`}>
                  {fl.floorType === 'AC' ? 'AC' : 'Non-AC'}
                </span>
              )}
              {/* Assigned staff — light display only (Part 11) */}
              {Array.isArray(fl.assignedStaff) && fl.assignedStaff.length > 0 && (
                <span className="text-[8px] font-extrabold text-slate-400 hidden md:inline">
                  · {fl.assignedStaff.map(s => s.name).join(', ')}
                </span>
              )}
            </button>
          ))}
        </div>
        {/* Status Legend */}
        <div className="hidden sm:flex items-center gap-2 text-[9px] font-bold text-slate-400">
          {['Available', 'Occupied', 'Reserved', 'Cleaning'].map(s => (
            <span key={s} className={`px-1.5 py-0.5 rounded-full ${statusBadgeColors[s]}`}>{s}</span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main Table Grid */}
        <div className={`${showDesigner ? 'lg:col-span-2' : 'lg:col-span-3'} space-y-3`}>
          <div className="bg-white p-4 rounded-xl border border-slate-200 min-h-[300px]">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-400 text-xs">Loading tables...</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {filteredTables.map((tbl) => {
                  const isOccupied = tbl.status === 'Occupied';
                  const isMerged = !!(tbl.mergeGroupId || tbl.mergedTableIds?.length);
                  const mergedWith = isMerged
                    ? (tbl.mergedTableNos || []).filter(n => String(n) !== String(tbl.tableNo ?? ''))
                    : [];

                  return (
                    <div key={tbl.id} className="relative group">
                      {/* Action buttons — always visible on touch, hover-reveal on desktop */}
                      {tbl.status !== 'Occupied' && isAdmin && (
                        <div className="absolute -top-2 -right-2 z-10 flex gap-0.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                          <button onClick={(e) => { e.stopPropagation(); handleEditTable(tbl); }}
                            className="p-1.5 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 text-slate-500 hover:text-slate-700 cursor-pointer" title="Edit table">
                            <Edit className="w-3 h-3" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); setDeleteTableTarget(tbl); }}
                            className="p-1.5 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-red-50 text-red-400 hover:text-red-600 cursor-pointer" title="Delete table">
                            <Trash className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                      {/* Merged tables — quick explicit Split/Unmerge access (backend allows ADMIN/MANAGER only) */}
                      {isMerged && isAdmin && (
                        <div className="absolute -top-2 -right-2 z-10 flex gap-0.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                          <button onClick={(e) => { e.stopPropagation(); setSplitConfirm({ mergeGroupId: tbl.mergeGroupId, label: (tbl.mergedTableNos || []).join(' + ') }); }}
                            className="p-1.5 bg-white border border-emerald-300 rounded-lg shadow-sm hover:bg-emerald-50 text-emerald-600 hover:text-emerald-700 cursor-pointer" title="Split / Unmerge tables">
                            <Split className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    <div onClick={() => handleTableClick(tbl)}
                      className={`p-3 rounded-xl border cursor-pointer select-none transition-all flex flex-col justify-between min-h-[115px] hover:shadow-md ${
                        isMerged ? 'ring-1 ring-emerald-300 border-emerald-300 bg-emerald-50/30' : statusColors[tbl.status] || statusColors.Available
                      }`}>
                      <div className="flex justify-between items-start gap-1">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-extrabold text-slate-800 truncate flex items-center gap-1">
                            {tbl.name}
                            {isMerged && <Merge className="w-3 h-3 text-emerald-600" />}
                          </p>
                          {isMerged && (
                            <p className="text-[8px] text-emerald-600 font-bold mt-0.5 flex items-center gap-1 flex-wrap">
                              <span className="text-[7px] px-1 py-px rounded bg-emerald-600 text-white uppercase tracking-wide">Merged</span>
                              {tbl.isPrimaryTable
                                ? (mergedWith.length > 0 ? `Primary · with ${mergedWith.join(' + ')}` : 'Primary table')
                                : (tbl.primaryTableNo ? `Part of Table ${tbl.primaryTableNo} group` : 'Part of merged group')}
                            </p>
                          )}
                          <p className="text-[10px] text-slate-400 font-medium mt-1">
                            {tbl.seats} Pax · {tbl.shape}{acNonAcPricing ? ` · ${tbl.floorType === 'AC' ? 'AC' : 'Non-AC'}` : ''}
                          </p>
                        </div>
                        <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded-md uppercase tracking-wider shrink-0 ${
                          isOccupied ? 'bg-red-100 text-red-700 animate-pulse' : statusBadgeColors[tbl.status] || 'bg-slate-200 text-slate-600'
                        }`}>{tbl.status}</span>
                      </div>

                      {isOccupied ? (
                        <div className="mt-2.5">
                          <div className="flex justify-between text-[10px] text-slate-600 font-bold border-t border-red-100 pt-1.5">
                            <span className="flex items-center gap-0.5"><Users className="w-3 h-3 text-red-500" />{tbl.guestsCount || 2} Guests</span>
                            <span className="text-[#C85A32] font-mono">{currency}{tbl.billAmount || 0}</span>
                          </div>
                          <p className="text-[8px] text-slate-400 font-bold mt-1 text-right">Click to Manage</p>
                        </div>
                      ) : tbl.status === 'Reserved' ? (
                        <div className="mt-2.5 flex items-center justify-between text-[9px] text-slate-400 font-bold border-t border-amber-100 pt-1.5">
                          <span>⏰ Reserved</span>
                          <button onClick={(e) => { e.stopPropagation(); handleChangeStatus(tbl.id, 'Available'); }}
                            className="text-amber-600 hover:underline cursor-pointer">Clear</button>
                        </div>
                      ) : tbl.status === 'Cleaning' ? (
                        <div className="mt-2.5 flex items-center justify-between text-[9px] text-slate-400 font-bold border-t border-blue-100 pt-1.5">
                          <span>🧹 Being Cleaned</span>
                          <button onClick={(e) => { e.stopPropagation(); handleChangeStatus(tbl.id, 'Available'); }}
                            className="text-blue-600 hover:underline cursor-pointer">Done</button>
                        </div>
                      ) : (
                        <div className="mt-2.5 flex items-center justify-between text-[9px] text-slate-400 font-bold border-t border-slate-100 pt-1.5">
                          <span>Empty Slots</span>
                          <span className="text-emerald-600">Open Table</span>
                        </div>
                      )}
                    </div>
                    </div>
                  );
                })}
                {filteredTables.length === 0 && (
                  <div className="col-span-full text-center py-16 text-slate-400 text-xs italic">
                    No tables on this floor. Open Floor Designer to add tables.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Floor Designer Sidebar */}
        {showDesigner && (
          <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-4 shadow-xs">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1">Floor Designer</span>
              <div className="flex bg-slate-100 p-0.5 rounded-md text-[9px] font-bold">
                <button onClick={() => setDesignerMode('tables')}
                  className={`px-2 py-1 rounded cursor-pointer ${designerMode === 'tables' ? 'bg-[#16A34A] text-white' : 'text-slate-600'}`}>Tables</button>
                <button onClick={() => setDesignerMode('floors')}
                  className={`px-2 py-1 rounded cursor-pointer ${designerMode === 'floors' ? 'bg-[#16A34A] text-white' : 'text-slate-600'}`}>Floors</button>
              </div>
            </div>

            {designerMode === 'tables' ? (
              <div className="space-y-4">
                <form onSubmit={handleSaveTable} className="space-y-3 p-3 bg-slate-50 rounded-xl">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{editingTableId ? 'Edit Table' : 'Create Table'}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold uppercase text-slate-400">Name</label>
                      <input value={tableName} onChange={(e) => setTableName(e.target.value)}
                        placeholder="e.g., Window Table" className="w-full h-8 px-2 bg-white border rounded text-xs outline-none" required />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold uppercase text-slate-400">Table No</label>
                      <input type="number" inputMode="numeric" value={tableNum} onChange={(e) => setTableNum(parseInt(e.target.value) || 0)}
                        className="w-full h-8 px-2 bg-white border rounded text-xs outline-none" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold uppercase text-slate-400">Capacity</label>
                      <input type="number" inputMode="numeric" value={tableSeats} onChange={(e) => setTableSeats(parseInt(e.target.value) || 2)}
                        className="w-full h-8 px-2 bg-white border rounded text-xs outline-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold uppercase text-slate-400">Shape</label>
                      <select value={tableShape} onChange={(e) => setTableShape(e.target.value)}
                        className="w-full h-8 px-1 bg-white border rounded text-xs outline-none">
                        {['Rectangle', 'Round', 'Square', 'Booth'].map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase text-slate-400">Floor</label>
                    <select value={tableFloorId} onChange={(e) => setTableFloorId(e.target.value)}
                      className="w-full h-8 px-1 bg-white border rounded text-xs outline-none">
                      <option value="">Select floor</option>
                      {floors.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEditingTableId(null)} disabled={tableSaving} className="flex-1 h-8 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 cursor-pointer disabled:opacity-50">Reset</button>
                    <button type="submit" disabled={tableSaving} className="flex-[2] h-8 bg-[#16A34A] text-white rounded-lg text-xs font-bold hover:bg-[#15803D] cursor-pointer disabled:opacity-50">
                      {tableSaving ? 'Saving...' : (editingTableId ? 'Update' : 'Add Table')}
                    </button>
                  </div>
                </form>

                {/* DB Merge Groups (persisted in the tenant DB — not session state) */}
                {tables.filter(t => t.mergeGroupId).length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[9px] font-bold uppercase text-slate-400">Active Merge Groups</p>
                    {(() => {
                      const mergeGroups = {};
                      tables.filter(t => t.mergeGroupId).forEach(t => {
                        if (!mergeGroups[t.mergeGroupId]) mergeGroups[t.mergeGroupId] = [];
                        mergeGroups[t.mergeGroupId].push(t);
                      });
                      return Object.entries(mergeGroups).map(([gid, tbls]) => {
                        const primary = tbls.find(t => t.isPrimaryTable) || tbls[0];
                        return (
                          <div key={gid} className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                            <div className="flex items-center gap-1 mb-1">
                              <Merge className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span className="text-[10px] font-bold text-slate-700 flex items-center gap-1 flex-wrap">
                                {tbls.map(t => t.name).join(' + ')}
                                {primary?.isPrimaryTable && (
                                  <span className="text-[7px] px-1 py-px rounded bg-emerald-600 text-white uppercase">Primary: {primary.name}</span>
                                )}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[8px] text-slate-400 font-medium">
                                Persisted in DB. Only an explicit Split/Unmerge reverses it.
                              </p>
                              <button onClick={() => setSplitConfirm({ mergeGroupId: Number(gid), label: tbls.map(t => t.name).join(' + ') })}
                                className="shrink-0 px-2 h-6 rounded-md bg-white border border-amber-300 text-amber-700 text-[8px] font-bold hover:bg-amber-50 cursor-pointer">
                                Split
                              </button>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <form onSubmit={handleSaveFloor} className="space-y-3 p-3 bg-slate-50 rounded-xl">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{editingFloorId ? 'Edit Floor' : 'Add Floor'}</p>
                  
                  {/* Floor Name (Required) */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase text-slate-400">Name *</label>
                    <input value={floorName} onChange={(e) => setFloorName(e.target.value)} placeholder="e.g., VIP Section"
                      className="w-full h-8 px-2 bg-white border rounded text-xs outline-none" required />
                  </div>
                  
                  {/* Floor Code (Optional) */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase text-slate-400">Floor Code</label>
                    <input value={floorCode} onChange={(e) => setFloorCode(e.target.value)} placeholder="e.g., FL-01"
                      className="w-full h-8 px-2 bg-white border rounded text-xs outline-none" />
                  </div>
                  
                  {/* Description (Optional) */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase text-slate-400">Description</label>
                    <textarea value={floorDescription} onChange={(e) => setFloorDescription(e.target.value)} placeholder="Optional description..."
                      className="w-full h-16 px-2 py-1.5 bg-white border rounded text-xs outline-none resize-none" />
                  </div>

                  {/* Floor Type (RESTAURANT mode only) — the source of truth for
                      AC/Non-AC pricing; every table on this floor inherits it. */}
                  {acNonAcPricing && (
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold uppercase text-slate-400">Floor Type</label>
                      <div className="flex gap-2 h-8">
                        {['AC', 'NON_AC'].map((t) => (
                          <button type="button" key={t} onClick={() => setFloorType(t)}
                            className={`flex-1 rounded-lg border text-[10px] font-bold cursor-pointer ${
                              floorType === t ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'bg-white border-slate-200 text-slate-500'
                            }`}>
                            {t === 'AC' ? 'AC' : 'Non-AC'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Display Order + Active Toggle */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold uppercase text-slate-400">Display Order</label>
                      <input type="number" inputMode="numeric" value={floorSortOrder} onChange={(e) => setFloorSortOrder(parseInt(e.target.value) || 0)}
                        className="w-full h-8 px-2 bg-white border rounded text-xs outline-none" min="0" />
                    </div>
                    <div className="space-y-1 flex flex-col">
                      <label className="text-[9px] font-bold uppercase text-slate-400">Active</label>
                      <label className="flex items-center gap-2 h-8 px-2 bg-white border rounded cursor-pointer">
                        <input type="checkbox" checked={floorIsActive} onChange={(e) => setFloorIsActive(e.target.checked)}
                          className="w-3.5 h-3.5 accent-[#16A34A] cursor-pointer" />
                        <span className="text-[10px] text-slate-600 font-medium">{floorIsActive ? 'Active' : 'Inactive'}</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => { setEditingFloorId(null); setFloorName(''); setFloorCode(''); setFloorDescription(''); setFloorIsActive(true); setFloorSortOrder(0); }} className="flex-1 h-8 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 cursor-pointer">Reset</button>
                    <button type="submit" disabled={floorSaving} className="flex-[2] h-8 bg-[#16A34A] text-white rounded-lg text-xs font-bold hover:bg-[#15803D] cursor-pointer disabled:opacity-50">
                      {floorSaving ? 'Saving...' : editingFloorId ? 'Update' : 'Add Floor'}
                    </button>
                  </div>
                </form>

                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {floors.map(f => (
                    <div key={f.id} className="flex items-center justify-between p-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${f.isActive !== false ? 'bg-[#16A34A]' : 'bg-slate-300'}`} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-slate-700 truncate">{f.name}</span>
                            {f.floorCode && (
                              <span className="text-[8px] text-slate-400 font-mono bg-slate-100 px-1 rounded shrink-0">{f.floorCode}</span>
                            )}
                            {acNonAcPricing && (
                              <span className={`text-[7px] font-bold px-1 rounded shrink-0 ${f.floorType === 'AC' ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-500'}`}>
                                {f.floorType === 'AC' ? 'AC' : 'Non-AC'}
                              </span>
                            )}
                            {f.isActive === false && (
                              <span className="text-[7px] text-amber-600 font-bold uppercase bg-amber-50 px-1 rounded shrink-0">Inactive</span>
                            )}
                          </div>
                          {f.description && (
                            <p className="text-[8px] text-slate-400 truncate mt-0.5">{f.description}</p>
                          )}
                          {f.sortOrder != null && (
                            <span className="text-[7px] text-slate-300 font-medium">Order #{f.sortOrder}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => { setEditingFloorId(f.id); setFloorName(f.name); setFloorCode(f.floorCode || ''); setFloorDescription(f.description || ''); setFloorIsActive(f.isActive !== false); setFloorType(f.floorType || 'NON_AC'); setFloorSortOrder(f.sortOrder || 0); }}
                          className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded cursor-pointer" title="Edit floor">
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleteFloorTarget(f)}
                          className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer" title="Delete floor">
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {floorLoadError && (
                    <div className="text-[10px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-2 flex items-center justify-between gap-2">
                      <span className="truncate">{floorLoadError}</span>
                      <button onClick={loadFloors} className="font-bold text-red-700 hover:text-red-800 cursor-pointer shrink-0">Retry</button>
                    </div>
                  )}
                  {floors.length === 0 && !floorLoadError && (
                    <p className="text-[10px] text-slate-400 italic text-center py-4">No floors yet. Add one above.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Open Table Modal */}
      {showOpenTableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-xs rounded-xl shadow-xl border border-slate-100 p-5 space-y-4">
            <h4 className="text-xs font-extrabold text-slate-800">Open Table {activeTableNumber}</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">Guests</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setGuestCount(p => Math.max(1, p - 1))}
                    className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 cursor-pointer">-</button>
                  <span className="w-8 text-center font-extrabold">{guestCount}</span>
                  <button onClick={() => setGuestCount(p => p + 1)}
                    className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 cursor-pointer">+</button>
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowOpenTableModal(false)}
                className="flex-1 h-9 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 cursor-pointer">Cancel</button>
              <button onClick={handleOpenTable}
                className="flex-[2] h-9 bg-[#16A34A] text-white rounded-lg text-xs font-bold cursor-pointer">Open Table</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Table Confirmation */}
      <ConfirmationDialog
        isOpen={!!deleteTableTarget}
        onClose={() => { if (!deletingTable) setDeleteTableTarget(null); }}
        onConfirm={handleDeleteTableConfirm}
        title="Delete Table?"
        message={`Are you sure you want to delete "${deleteTableTarget?.name || 'this table'}"? This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deletingTable}
      />

      {/* Delete Floor Confirmation */}
      <ConfirmationDialog
        isOpen={!!deleteFloorTarget}
        onClose={() => { if (!deletingFloor) setDeleteFloorTarget(null); }}
        onConfirm={handleDeleteFloorConfirm}
        title="Delete Floor?"
        message={`Are you sure you want to delete "${deleteFloorTarget?.name || 'this floor'}"? This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deletingFloor}
      />

      {/* Occupied Table Modal */}
      {showOccupiedModal && selectedOccupiedTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-xs rounded-xl shadow-xl border border-slate-100 p-5 space-y-4">
            <h4 className="text-xs font-extrabold text-slate-800">{selectedOccupiedTable.name}</h4>
            <div className="text-xs text-slate-500 space-y-1">
              <p><span className="font-bold">Status:</span> Occupied</p>
              <p><span className="font-bold">Guests:</span> {selectedOccupiedTable.guestsCount || 'N/A'}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { 
                const occTbl = selectedOccupiedTable;
                setShowOccupiedModal(false);
                // Try to find real backend order ID from cartStore orders
                const { orders } = useCartStore.getState();
                const tableNo = occTbl.number?.toString();
                const tableOrder = orders.find(o => 
                  (o.table?.tableNo?.toString() === tableNo) ||
                  (o.tableName?.includes(tableNo)) ||
                  (o.table?.name === occTbl.name)
                );
                if (tableOrder) {
                  // Use the real backend order ID from cartStore
                  setActiveOrderTakingId(tableOrder.id);
                  setShowTakeOrderWizard(true);
                } else {
                  // No real backend order found — redirect to Active Orders
                  addToast('Could not find the order. Try Active Orders.', 'warning');
                  setScreen('active_orders');
                }
              }}
                className={`${isServiceStaff ? 'w-full' : 'flex-1'} h-9 bg-[#C85A32] text-white rounded-lg text-xs font-bold cursor-pointer`}>Add Items</button>
              {canBill && (
              <button onClick={() => { 
                const occTbl = selectedOccupiedTable;
                setShowOccupiedModal(false);
                // Find real backend order ID from cartStore
                const { orders } = useCartStore.getState();
                const tableNo = occTbl.number?.toString();
                const tableOrder = orders.find(o => 
                  (o.table?.tableNo?.toString() === tableNo) ||
                  (o.tableName?.includes(tableNo)) ||
                  (o.table?.name === occTbl.name)
                );
                if (tableOrder) {
                  setCheckoutOrderId(tableOrder.id);
                } else {
                  addToast('Order not found. Try Active Orders.', 'warning');
                  setScreen('active_orders');
                }
              }}
                className="flex-[2] h-9 bg-[#16A34A] text-white rounded-lg text-xs font-bold cursor-pointer">Checkout</button>
              )}
            </div>
            {selectedOccupiedTable?.isMerged ? (
              <button onClick={() => { const occ = selectedOccupiedTable; setShowOccupiedModal(false); setSplitConfirm({ mergeGroupId: occ.mergeGroupId, label: (occ.mergedTableNos || []).join(' + ') }); }}
                className="w-full h-8 border border-amber-300 bg-amber-50 text-amber-700 rounded-lg text-[10px] font-bold hover:bg-amber-100 cursor-pointer">Split Tables (Unmerge)</button>
            ) : (
              <button onClick={() => { setShowOccupiedModal(false); handleChangeStatus(selectedOccupiedTable.id, 'Available'); }}
                className="w-full h-8 border border-red-200 text-red-600 rounded-lg text-[10px] font-bold hover:bg-red-50 cursor-pointer">Mark Available</button>
            )}
          </div>
        </div>
      )}

      {/* Merge Tables / Split Tables modal (uses the existing backend merge/split APIs) */}
      <TableMergeModal
        mode={mergeModalMode}
        onClose={() => setMergeModalMode(null)}
        onSplitRequested={(group) => setSplitConfirm(group)}
        onChanged={reloadAfterMergeChange}
      />

      {/* Split Tables confirmation — only an explicit user action may reverse a merge */}
      <ConfirmationDialog
        isOpen={!!splitConfirm}
        onClose={() => { if (!splitLoading) setSplitConfirm(null); }}
        onConfirm={handleSplitGroupConfirm}
        title="Split Tables?"
        message={`Split "${splitConfirm?.label || ''}" back into separate tables? A merged group stays merged until you do this.`}
        confirmLabel="Split"
        cancelLabel="Cancel"
        variant="warning"
        isLoading={splitLoading}
      />
    </div>
  );
}
