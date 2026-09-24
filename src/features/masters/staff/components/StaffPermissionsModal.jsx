import React, { useState, useEffect } from 'react';
import { X, Loader2, Shield, ChevronDown, ChevronRight, RotateCcw, Save } from 'lucide-react';
import { userApi } from '../../../../api/user.api';
import { STAFF_SCREEN_PERMISSION_KEYS, getRoleDisplayName } from '../../../../utils/permissions';
import { useSettingsStore } from '../../../../store';
import { getBusinessCapabilities, catalogNaming } from '../../../../utils/businessCapabilities';

/**
 * Staff Permissions modal (Part 7).
 *
 * Lets the Admin configure, per individual staff member:
 *   - SCREEN ACCESS  (nine screens, each a permission key like "pos.view")
 *   - ACTION PERMISSIONS (expandable Order/Billing/Menu/Staff/Report/Settings groups)
 *   - FOOD ACCESS    (dietaryAccess: VEG_ONLY | VEG_AND_NON_VEG)
 *
 * Load semantics: GET /users/:id/permissions returns the catalog + role
 * defaults + the user's explicit overrides. The modal renders the EFFECTIVE
 * state (defaults merged with overrides) — unchecking a role-default key
 * writes an explicit enabled=false override. "Reset to Role Defaults" deletes
 * every override (DELETE /users/:id/permissions).
 */
const STAFF_SCREEN_LABELS = {
  'dashboard.view': 'Dashboard',
  'pos.view': 'POS Ordering',
  'kitchen.view': 'Kitchen Tickets',
  'tables.view': 'Floors & Tables',
  'active_orders.view': 'Active Orders',
  'menu.view': 'Menu & Stock',
  'staff.view': 'Staff Roster',
  'reports.view': 'Reports & Sales',
  'settings.view': 'POS Settings',
};

export default function StaffPermissionsModal({ member, onClose, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [actionGroups, setActionGroups] = useState([]);
  const [roleDefaults, setRoleDefaults] = useState([]);
  const [fullAccess, setFullAccess] = useState(false);
  const [checked, setChecked] = useState(new Set());
  const [dietaryAccess, setDietaryAccess] = useState('VEG_AND_NON_VEG');
  // Restaurant-level dietary mode (Part 14): ceiling for staff Food Access.
  const [restaurantDietaryMode, setRestaurantDietaryMode] = useState('VEG_AND_NON_VEG');
  const [expandedGroups, setExpandedGroups] = useState(new Set());

  const staffId = member?.backendId;
  // Food Access only exists for food verticals (§6/§11) — retail businesses
  // have no dietary concept, so the section is not rendered at all.
  const isDietaryBusiness = useSettingsStore((s) =>
    (s.settings.capabilities || getBusinessCapabilities(s.settings.businessType)).dietary === true);
  // §6: Screen Access + Action Permissions are capability-filtered — retail
  // tenants never see Kitchen Tickets / Floors & Tables, and capability-disabled
  // action permissions are hidden with the group counts recalculated from the
  // VISIBLE keys (no stale 9/9).
  const capabilities = useSettingsStore((s) =>
    s.settings.capabilities || getBusinessCapabilities(s.settings.businessType));
  const CAPABILITY_HIDDEN_SCREEN_KEYS = new Set([
    ...(!capabilities.kitchen ? ['kitchen.view'] : []),
    ...(!capabilities.tables ? ['tables.view'] : []),
  ]);
  const isActionHidden = (key) =>
    (key === 'kitchen.view' && !capabilities.kitchen) ||
    (key === 'tables.view' && !capabilities.tables);
  const visibleScreenKeys = STAFF_SCREEN_PERMISSION_KEYS.filter((k) => !CAPABILITY_HIDDEN_SCREEN_KEYS.has(k));
  // §7: catalog screen label follows the tenant's terminology (Menu ↔ Products).
  const catalogScreenLabel = catalogNaming(
    useSettingsStore.getState().settings.businessType
  ).catalogLabel;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await userApi.getPermissions(staffId);
        const data = resp?.data || resp;
        if (!alive) return;
        const effective = new Set(data.effectivePermissions || []);
        setCatalog(data.catalog || []);
        setActionGroups(data.actionGroups || []);
        setRoleDefaults(new Set(data.roleDefaults || []));
        setFullAccess(!!data.fullAccess);
        setChecked(effective);
        setDietaryAccess(data.dietaryAccess || 'VEG_AND_NON_VEG');
        setRestaurantDietaryMode(data.restaurantDietaryMode || 'VEG_AND_NON_VEG');
        // A VEG_ONLY restaurant can never show a broader staff option (Part 14).
        if ((data.restaurantDietaryMode || 'VEG_AND_NON_VEG') === 'VEG_ONLY' && (data.dietaryAccess || 'VEG_AND_NON_VEG') === 'VEG_AND_NON_VEG') {
          setDietaryAccess('VEG_ONLY');
        }
        setLoading(false);
      } catch (e) {
        if (alive) { setError(e.message || 'Failed to load permissions'); setLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, [staffId]);

  const toggleKey = (key) => {
    if (fullAccess) return; // ADMIN is never restricted (Part 21)
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleGroup = (group) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group); else next.add(group);
      return next;
    });
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      // Diff against role defaults: only changed keys become explicit overrides.
      const permissions = {};
      for (const key of catalog.map((c) => c.key)) {
        const isDefault = roleDefaults.has(key);
        const isChecked = checked.has(key);
        if (isChecked && !isDefault) permissions[key] = true;
        if (!isChecked && isDefault) permissions[key] = false;
      }
      await userApi.updatePermissions(staffId, {
        permissions,
        dietaryAccess: restaurantDietaryMode === 'VEG_ONLY' ? 'VEG_ONLY' : dietaryAccess,
      });
      if (onSaved) onSaved();
      onClose();
    } catch (e) {
      setError(e.message || 'Failed to save permissions');
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await userApi.resetPermissions(staffId);
      const resp = await userApi.getPermissions(staffId);
      const data = resp?.data || resp;
      setChecked(new Set(data.effectivePermissions || []));
      setRoleDefaults(new Set(data.roleDefaults || []));
      setRestaurantDietaryMode(data.restaurantDietaryMode || 'VEG_AND_NON_VEG');
      setDietaryAccess(
        (data.restaurantDietaryMode || 'VEG_AND_NON_VEG') === 'VEG_ONLY'
          ? 'VEG_ONLY'
          : (data.dietaryAccess || 'VEG_AND_NON_VEG')
      );
      if (onSaved) onSaved();
      setSaving(false);
    } catch (e) {
      setError(e.message || 'Failed to reset permissions');
      setSaving(false);
    }
  };

  const groupKeys = new Set(actionGroups.flatMap((g) => g.keys));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs" onClick={() => { if (!saving) onClose(); }}>
      <div className="bg-white w-full max-w-md rounded-xl shadow-xl border border-slate-100 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center rounded-t-xl">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#16A34A]" />
            <div>
              <h4 className="font-extrabold text-xs uppercase tracking-wider text-slate-800">Staff Permissions</h4>
              <p className="text-[10px] text-slate-500 font-medium">{member?.firstName} {member?.lastName} — {getRoleDisplayName(member?.role)}</p>
            </div>
          </div>
          <button onClick={() => { if (!saving) onClose(); }} className="text-slate-400 hover:text-slate-600 cursor-pointer" disabled={saving}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#16A34A] mx-auto mb-3" />
            <p className="text-xs font-semibold text-slate-500">Loading permissions...</p>
          </div>
        ) : (
          <div className="p-4 overflow-y-auto space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-[11px] font-semibold text-red-700">{error}</div>
            )}

            {fullAccess && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 text-[11px] font-semibold text-emerald-800">
                Admin accounts always have full access and cannot be restricted.
              </div>
            )}

            {/* Food Access (Parts 9/14): restaurant mode is the ceiling.
                Hidden entirely for non-food business types. */}
            {isDietaryBusiness && (<div>
              <h5 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">Food Access</h5>
              <p className="text-[10px] text-slate-400 font-medium mb-1.5">
                Restaurant dietary mode: <span className="font-bold text-slate-600">{restaurantDietaryMode === 'VEG_ONLY' ? 'Veg Only' : 'Veg + Non-Veg'}</span>
              </p>
              {restaurantDietaryMode === 'VEG_ONLY' && (
                <p className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 mb-1.5">
                  Your restaurant is configured for Veg Only.
                </p>
              )}
              <div className="space-y-1.5">
                {[['VEG_ONLY', 'Veg Only'], ['VEG_AND_NON_VEG', 'Veg + Non-Veg']].map(([value, label]) => {
                  const broaderThanRestaurant = restaurantDietaryMode === 'VEG_ONLY' && value === 'VEG_AND_NON_VEG';
                  return (
                    <label key={value} className={`flex items-center gap-2 text-xs font-semibold text-slate-700 ${broaderThanRestaurant ? 'opacity-50' : 'cursor-pointer'}`}>
                      <input
                        type="radio"
                        name="dietaryAccess"
                        value={value}
                        checked={dietaryAccess === value}
                        onChange={() => setDietaryAccess(value)}
                        disabled={fullAccess || saving || broaderThanRestaurant}
                        className="accent-[#16A34A]"
                      />
                      {label}
                      {broaderThanRestaurant && <span className="text-[9px] font-bold text-slate-400">(not available)</span>}
                    </label>
                  );
                })}
              </div>
            </div>) }

            {/* Screen Access (Part 7) — capability-filtered (§6) */}
            <div>
              <h5 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">Screen Access</h5>
              <div className="space-y-1.5">
                {visibleScreenKeys.map((key) => (
                  <label key={key} className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked.has(key)}
                      onChange={() => toggleKey(key)}
                      disabled={fullAccess || saving}
                      className="accent-[#16A34A]"
                    />
                    {key === 'menu.view' ? catalogScreenLabel : (STAFF_SCREEN_LABELS[key] || key)}
                  </label>
                ))}
              </div>
            </div>

            {/* Action Permissions — expandable groups (Part 7) */}
            <div>
              <h5 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">Action Permissions</h5>
              <div className="space-y-1.5">
                {actionGroups.map((rawGroup) => {
                  // §6: hide capability-disabled actions and compute the count
                  // from VISIBLE keys only (checked/total both reflect the
                  // filtered list).
                  const group = { ...rawGroup, keys: rawGroup.keys.filter((k) => !isActionHidden(k)) };
                  if (group.keys.length === 0) return null;
                  return (
                  <div key={group.group} className="border border-slate-200 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.group)}
                      className="w-full flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-[11px] font-extrabold text-slate-700 uppercase tracking-wide cursor-pointer"
                    >
                      {expandedGroups.has(group.group)
                        ? <ChevronDown className="w-3 h-3 text-slate-400" />
                        : <ChevronRight className="w-3 h-3 text-slate-400" />}
                      {group.group}
                      <span className="ml-auto text-[9px] font-bold text-slate-400">
                        {group.keys.filter((k) => checked.has(k)).length}/{group.keys.length}
                      </span>
                    </button>
                    {expandedGroups.has(group.group) && (
                      <div className="p-2 space-y-1.5 bg-white">
                        {group.keys.map((key) => (
                          <label key={key} className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked.has(key)}
                              onChange={() => toggleKey(key)}
                              disabled={fullAccess || saving}
                              className="accent-[#16A34A]"
                            />
                            {(catalog.find((c) => c.key === key) || {}).label || key}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {!loading && (
          <div className="px-4 py-3 border-t border-slate-100 flex gap-2">
            <button
              onClick={handleReset}
              disabled={saving || fullAccess}
              className="h-9 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-500 font-bold rounded-lg text-[11px] uppercase tracking-wider flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Reset to Role Defaults"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
            <div className="flex-1" />
            <button
              onClick={onClose}
              disabled={saving}
              className="h-9 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-500 font-bold rounded-lg text-[11px] uppercase tracking-wider cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || fullAccess}
              className="h-9 px-4 bg-[#16A34A] hover:bg-[#15803D] text-white font-bold rounded-lg text-[11px] uppercase tracking-wider flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
