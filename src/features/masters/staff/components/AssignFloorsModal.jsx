import React, { useState, useEffect } from 'react';
import { X, Loader2, MapPin, Save, ShoppingBag } from 'lucide-react';
import { userApi } from '../../../../api/user.api';
import { floorApi } from '../../../../api/floor.api';
import { useSettingsStore } from '../../../../store';
import { getBusinessCapabilities } from '../../../../utils/businessCapabilities';

/**
 * Assign Access modal (floors + optional Takeaway order access).
 *
 * BUSINESS RULE: Dine In is the DEFAULT access for every staff member — it is
 * never a selectable checkbox. The only order-access choice is Takeaway:
 *   - unchecked → staff is DINE_IN only (TAKEAWAY orders → backend 403)
 *   - checked   → staff can also place TAKEAWAY orders
 *
 * Floor access is an optional restriction for floor-scoped work. Dine-in floor
 * restrictions are enforced by the backend (utils/floorAccess.js).
 *
 * API contract (single request): GET/PUT /users/:id/floors carries both the
 * floor ids and the takeaway flag. Legacy `orders.dine_in` permission rows are
 * ignored on read (Dine In is implicit) and cleared on save — no data loss,
 * the key simply stops being meaningful.
 */
const TAKEAWAY = 'TAKEAWAY';

export default function AssignFloorsModal({ member, onClose, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [floors, setFloors] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [takeaway, setTakeaway] = useState(false);

  // §5: Dine In / Takeaway / Floor Access only exist for table-capable
  // (food dine-in) businesses. Retail tenants get none of it — the modal
  // renders a simple "no assignments" state instead.
  const showFloorAccess = useSettingsStore((s) =>
    (s.settings.capabilities || getBusinessCapabilities(s.settings.businessType)).tables === true);

  const staffId = member?.backendId;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [floorsResp, assignResp] = await Promise.all([
          floorApi.getAll(),
          userApi.getFloorAssignments(staffId),
        ]);
        if (!alive) return;
        const f = floorsResp?.data?.floors || floorsResp?.floors || floorsResp?.data || [];
        setFloors(Array.isArray(f) ? f : []);
        const d = assignResp?.data || assignResp || {};
        const ids = d.floorIds || [];
        setSelected(new Set(ids));
        // assignedOrderTypes: ['TAKEAWAY'] | ['DINE_IN','TAKEAWAY'] | ['DINE_IN'] | null
        // Legacy ['DINE_IN'] rows are treated as dine-in-only (same as null).
        const ot = Array.isArray(d.assignedOrderTypes) ? d.assignedOrderTypes : [];
        setTakeaway(ot.includes(TAKEAWAY));
        setLoading(false);
      } catch (err) {
        if (alive) {
          setError(err?.response?.data?.message || err?.message || 'Failed to load assignments');
          setLoading(false);
        }
      }
    })();
    return () => { alive = false; };
  }, [staffId]);

  const toggle = (floorId) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(floorId)) next.delete(floorId); else next.add(floorId);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // Dine In is implicit; only the takeaway flag is persisted. Legacy
      // orders.dine_in rows are dropped by sending the normalized value.
      await userApi.updateFloorAssignments(staffId, [...selected], takeaway ? [TAKEAWAY] : []);
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save assignments');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header — staff identity */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-800 truncate">Assign Access</h2>
            <p className="text-[11px] font-bold text-slate-700 truncate">{member?.name || `${member?.firstName || ''} ${member?.lastName || ''}`.trim()}</p>
            {member?.email && <p className="text-[10px] text-slate-500 truncate">{member.email}</p>}
            <p className="text-[9px] font-bold text-[#16A34A] uppercase tracking-wide">{member?.roleLabel || member?.role}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded text-slate-400 cursor-pointer shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : error ? (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
          ) : !showFloorAccess ? (
            /* §5: retail — no Order Access (Dine In/Takeaway) and no Floor Access.
               Keep the modal openable (save still works for legacy data) but show
               a clean, intentional state instead of restaurant-only controls. */
            <div className="text-center py-8">
              <MapPin className="w-8 h-8 text-slate-200 mx-auto mb-3" />
              <p className="text-xs font-semibold text-slate-500">No floor or order-mode assignments for this business.</p>
              <p className="text-[10px] text-slate-400 mt-1">Floor and order-type access applies to dine-in businesses only.</p>
            </div>
          ) : (
            <>
              {/* ── ORDER ACCESS ── */}
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <ShoppingBag className="w-3.5 h-3.5 text-slate-400" />
                  <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wide">Order Access</p>
                </div>
                <div className="px-3 py-2 rounded-lg border border-slate-100 bg-slate-50/60 mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">Dine In</span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Default for all staff</span>
                </div>
                <label className="flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-100 hover:border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={takeaway}
                    onChange={(e) => setTakeaway(e.target.checked)}
                    className="w-4 h-4 accent-[#16A34A] cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-slate-700">Takeaway</span>
                </label>
                <p className="text-[10px] text-slate-400 pt-1.5">
                  {takeaway
                    ? 'Staff can take Dine In and Takeaway orders.'
                    : 'Staff can take Dine In orders only — Takeaway is disabled at the backend.'}
                </p>
              </div>

              {/* ── FLOOR ACCESS ── */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wide">Floor Access</p>
                </div>
                {floors.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">No floors defined yet. Create floors in Floors &amp; Tables first.</p>
                ) : (
                  <div className="space-y-1.5">
                    {floors.map(floor => (
                      <label
                        key={floor.id}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-100 hover:border-slate-200 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(floor.id)}
                          onChange={() => toggle(floor.id)}
                          className="w-4 h-4 accent-[#16A34A] cursor-pointer"
                        />
                        <span className="text-xs font-semibold text-slate-700">{floor.name}</span>
                        {!floor.isActive && <span className="text-[9px] text-slate-400">(inactive)</span>}
                      </label>
                    ))}
                    {selected.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelected(new Set())}
                        className="text-[10px] font-bold text-red-500 hover:text-red-600 pt-1 cursor-pointer"
                      >
                        Clear floor assignments
                      </button>
                    )}
                    <p className="text-[10px] text-slate-400 pt-2">
                      Restricted staff (Cashier / Kitchen / Service Staff) see only their assigned floors.
                      Managers and Admins remain restaurant-wide.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer">
            Cancel
          </button>
          {showFloorAccess && (
            <button
            onClick={handleSave}
            disabled={loading || saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-50 cursor-pointer"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </button>
          )}
        </div>
      </div>
    </div>
  );
}
