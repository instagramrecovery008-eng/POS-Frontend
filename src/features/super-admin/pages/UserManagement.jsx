import React, { useState, useEffect, useCallback, useRef } from 'react';
import { superAdminApi } from '../../../api/superAdmin.api';
import { Search, RefreshCw, Loader2, CheckCircle, XCircle, RotateCcw, Trash2, ChevronLeft, ChevronRight, Users, Filter } from 'lucide-react';
import ConfirmationDialog from '../../../components/ConfirmationDialog';
import { useUiStore } from '../../../store';
import { getRoleDisplayName } from '../../../utils/permissions';

export default function UserManagement() {
  const { addToast } = useUiStore();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  // Confirm dialog state: { type: 'reset' | 'delete', user }
  const [confirmAction, setConfirmAction] = useState(null);
  const [busy, setBusy] = useState(false);
  const toggleRef = useRef(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page, limit: 20, role: roleFilter || undefined, status: statusFilter || undefined, search: search || undefined };
      const resp = await superAdminApi.getUsers(params);
      if (resp.success) {
        setUsers(resp.data.users || []);
        setPagination(resp.data.pagination);
      }
    } catch (e) { console.error(e);
    } finally { setLoading(false); }
  }, [page, search, roleFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (id) => {
    if (toggleRef.current) return; // double-click guard
    toggleRef.current = true;
    try { await superAdminApi.toggleUserStatus(id); load(); } catch (e) { alert(e.message); } finally { toggleRef.current = false; }
  };

  const handleResetPassword = (user) => {
    setConfirmAction({ type: 'reset', user });
  };

  const handleDelete = (user) => {
    setConfirmAction({ type: 'delete', user });
  };

  const handleConfirm = async () => {
    if (!confirmAction || busy) return; // guard against duplicate requests
    setBusy(true);
    const { type, user } = confirmAction;
    try {
      if (type === 'reset') {
        // The password is NEVER in the response — it is emailed to the user.
        const resp = await superAdminApi.resetUserPassword(user.id);
        const emailed = resp.data?.emailQueued;
        addToast(
          emailed
            ? `Temporary password emailed to ${user.name} (${resp.data?.emailedTo || user.email}). They must change it at next login.`
            : `Password reset for ${user.name}, but the email could not be sent. Use Resend Credentials in Email Settings.`,
          emailed ? 'success' : 'warning'
        );
      } else {
        await superAdminApi.deleteUser(user.id);
        addToast(`User ${user.name} deleted.`, 'success');
        load();
      }
      setConfirmAction(null);
    } catch (e) {
      addToast(e.message || 'Action failed', 'error');
      setConfirmAction(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-xl font-extrabold text-slate-800">User Management</h1>
        <p className="text-xs text-slate-500 mt-1">Platform users (restaurant ADMINs). Restaurant staff are managed in each restaurant's Staff Roster.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search users..." className="w-full h-9 pl-9 pr-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-[#16A34A]" />
        </div>
        <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1); }} className="h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none">
          <option value="">All Roles</option>
          <option value="ADMIN">Admin</option>
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button onClick={load} className="h-9 w-9 flex items-center justify-center bg-white border border-slate-200 rounded-xl hover:bg-slate-50"><RefreshCw className="w-3.5 h-3.5 text-slate-500" /></button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left font-extrabold text-slate-600 uppercase py-3 px-4">Name</th>
                <th className="text-left font-extrabold text-slate-600 uppercase py-3 px-4">Email</th>
                <th className="text-left font-extrabold text-slate-600 uppercase py-3 px-4">Role</th>
                <th className="text-left font-extrabold text-slate-600 uppercase py-3 px-4">Restaurant</th>
                <th className="text-left font-extrabold text-slate-600 uppercase py-3 px-4">Status</th>
                <th className="text-right font-extrabold text-slate-600 uppercase py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#16A34A] mx-auto" /></td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">No users found</td></tr>
              ) : users.map(u => (
                <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="py-3 px-4 font-bold text-slate-700">{u.name}</td>
                  <td className="py-3 px-4 text-slate-500">{u.email}</td>
                  <td className="py-3 px-4">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{getRoleDisplayName(u.role)}</span>
                  </td>
                  <td className="py-3 px-4 text-slate-500">{u.restaurant?.name || '—'}</td>
                  <td className="py-3 px-4">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${u.isActive ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => handleToggle(u.id)} className="p-1.5 hover:bg-blue-50 rounded-lg cursor-pointer" title={u.isActive ? 'Deactivate' : 'Activate'}>
                        {u.isActive ? <XCircle className="w-3.5 h-3.5 text-amber-500" /> : <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
                      </button>
                      <button onClick={() => handleResetPassword(u)} className="p-1.5 hover:bg-purple-50 rounded-lg cursor-pointer" title="Reset Password">
                        <RotateCcw className="w-3.5 h-3.5 text-purple-500" />
                      </button>
                      <button onClick={() => handleDelete(u)} className="p-1.5 hover:bg-red-50 rounded-lg cursor-pointer" title="Delete">
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {confirmAction && (
          <ConfirmationDialog
            isOpen={!!confirmAction}
            onClose={() => { if (!busy) setConfirmAction(null); }}
            onConfirm={handleConfirm}
            title={confirmAction.type === 'reset' ? 'Reset User Password?' : 'Delete User?'}
            message={confirmAction.type === 'reset'
              ? `Reset the password for ${confirmAction.user?.name || 'this user'}? They will receive a temporary password.`
              : `Are you sure you want to delete ${confirmAction.user?.name || 'this user'}? This cannot be undone.`}
            confirmLabel={confirmAction.type === 'reset' ? 'Reset Password' : 'Delete'}
            cancelLabel="Cancel"
            variant={confirmAction.type === 'reset' ? 'warning' : 'danger'}
            isLoading={busy}
          />
        )}
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
    </div>
  );
}
