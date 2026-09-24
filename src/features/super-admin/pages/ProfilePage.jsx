import React, { useState, useRef } from 'react';
import { useAuthStore, useUiStore } from '../../../store';
import { superAdminApi } from '../../../api/superAdmin.api';
import {
  UserCircle,
  Shield,
  Mail,
  Phone,
  Calendar,
  Clock,
  Activity,
  Building2,
  Key,
  CheckCircle2,
  Edit3,
  Loader2,
  X,
  Save,
  Lock,
  AlertCircle,
} from 'lucide-react';

const inputCls = "w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:border-[#16A34A] transition-all";
const labelCls = "block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1";

/** Modal shell — consistent with the rest of the Super Admin portal. */
function ModalShell({ title, subtitle, onClose, children, footer }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="text-sm font-extrabold text-slate-800">{title}</h3>
            {subtitle && <p className="text-[10px] text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4 overflow-y-auto">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

/** Edit Profile modal — name / email / phone, persisted to PostgreSQL. */
function EditProfileModal({ user, onClose, onSaved, onToast }) {
  const [form, setForm] = useState({ name: user?.name || '', email: user?.email || '', phone: user?.phone || '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    if (name.length < 2) { setError('Name must be at least 2 characters'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a valid email address'); return; }
    if (savingRef.current) return; // double-click guard
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const resp = await superAdminApi.updateProfile({ name, email, phone: form.phone.trim() || null });
      if (resp.success && resp.data) {
        onSaved(resp.data);
        onToast('Profile updated successfully');
      } else {
        setError(resp.message || 'Failed to update profile');
      }
    } catch (err) {
      setError(err.message || 'Failed to update profile');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="Edit Profile"
      subtitle="Updates apply immediately — no logout required."
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="h-10 px-4 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl cursor-pointer">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="h-10 px-5 bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </>
      }
    >
      {error && (
        <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-[11px] font-bold text-red-600">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelCls}>Full Name *</label>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="Super Admin name" />
        </div>
        <div>
          <label className={labelCls}>Email Address *</label>
          <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={inputCls} placeholder="admin@platform.com" />
        </div>
        <div>
          <label className={labelCls}>Phone</label>
          <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className={inputCls} placeholder="Optional" />
        </div>
        <p className="text-[10px] text-slate-400">Password cannot be changed here — use Change Password in Security.</p>
      </form>
    </ModalShell>
  );
}

/** Change Password modal — current / new / confirm, follows the existing
 *  self-service flow: token is invalidated server-side, so the SA signs back in. */
function ChangePasswordModal({ onClose, onToast }) {
  const { changePassword, logout } = useAuthStore();
  const { setScreen } = useUiStore();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { current, next, confirm } = form;
    if (!current || !next || !confirm) { setError('All fields are required'); return; }
    if (next.length < 8) { setError('New password must be at least 8 characters'); return; }
    if (next === current) { setError('New password must be different from the current password'); return; }
    if (next !== confirm) { setError('New password and confirm password do not match'); return; }
    if (savingRef.current) return; // double-click guard
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const result = await changePassword(current, next);
      if (result.success) {
        onToast('Password changed successfully. Please sign in again.');
        onClose();
        // Backend invalidates tokens issued before passwordChangedAt — sign back in.
        logout();
        setScreen('login');
      } else {
        setError(result.message || 'Failed to change password');
      }
    } catch (err) {
      setError(err.message || 'Failed to change password');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="Change Password"
      subtitle="You will be signed out after a successful change."
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="h-10 px-4 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl cursor-pointer">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="h-10 px-5 bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
            {saving ? 'Changing...' : 'Change Password'}
          </button>
        </>
      }
    >
      {error && (
        <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-[11px] font-bold text-red-600">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelCls}>Current Password *</label>
          <input type="password" value={form.current} onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))} className={inputCls} placeholder="Enter current password" />
        </div>
        <div>
          <label className={labelCls}>New Password *</label>
          <input type="password" value={form.next} onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))} className={inputCls} placeholder="At least 8 characters" />
        </div>
        <div>
          <label className={labelCls}>Confirm New Password *</label>
          <input type="password" value={form.confirm} onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} className={inputCls} placeholder="Repeat new password" />
        </div>
      </form>
    </ModalShell>
  );
}

export default function ProfilePage() {
  const { user, updateProfile } = useAuthStore();
  const { setScreen } = useUiStore();
  const [modal, setModal] = useState(null); // 'edit' | 'password' | null
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  const showToast = (msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3500);
  };

  const getInitials = () => {
    if (user?.name) {
      return user.name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
    }
    return 'SA';
  };

  const formatDate = (date) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const formatDateTime = (date) => {
    if (!date) return '—';
    return new Date(date).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const handleSaved = (profile) => {
    updateProfile(profile); // immediate store + localStorage update — no logout, survives refresh
    setModal(null);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      {/* Profile Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex items-center gap-5 flex-wrap">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#0F172A] to-[#1E293B] border-2 border-[#16A34A]/30 flex items-center justify-center text-xl font-extrabold text-[#16A34A] shadow-lg">
            {getInitials()}
          </div>
          <div className="flex-1 min-w-[180px]">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-extrabold text-slate-800">{user?.name || 'Super Admin'}</h1>
              <div className="flex items-center gap-1 px-2 py-0.5 bg-[#0F172A] rounded-full text-[9px] font-bold text-white">
                <Shield className="w-3 h-3 text-[#16A34A]" />
                SUPER ADMIN
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-1">Platform administrator with full system access</p>
          </div>
          <button
            onClick={() => setModal('edit')}
            className="h-11 px-4 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Edit3 className="w-3.5 h-3.5" />
            Edit Profile
          </button>
        </div>
      </div>

      {/* Account Details */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <h2 className="text-xs font-extrabold text-slate-700 mb-4 uppercase tracking-wider">Account Details</h2>
        <div className="space-y-3.5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center">
              <Mail className="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Email Address</p>
              <p className="text-sm font-bold text-slate-700">{user?.email || '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-green-50 border border-green-200 flex items-center justify-center">
              <Phone className="w-4 h-4 text-green-500" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Phone</p>
              <p className="text-sm font-bold text-slate-700">{user?.phone || '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-50 border border-purple-200 flex items-center justify-center">
              <Key className="w-4 h-4 text-purple-500" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Role</p>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-slate-700">Super Admin</p>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-50 text-green-600">Active</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Activity & Security */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h2 className="text-xs font-extrabold text-slate-700 mb-4 uppercase tracking-wider">Activity</h2>
          <div className="space-y-3.5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-amber-500" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Member Since</p>
                <p className="text-xs font-bold text-slate-700">{formatDate(user?.createdAt)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center">
                <Clock className="w-4 h-4 text-indigo-500" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Last Login</p>
                <p className="text-xs font-bold text-slate-700">{formatDateTime(user?.lastLogin)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h2 className="text-xs font-extrabold text-slate-700 mb-4 uppercase tracking-wider">Security</h2>
          <div className="space-y-3.5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-green-50 border border-green-200 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Account Status</p>
                <p className="text-xs font-bold text-green-600">Verified & Active</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center">
                <Activity className="w-4 h-4 text-slate-500" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Last Password Change</p>
                <p className="text-xs font-bold text-slate-700">{formatDateTime(user?.passwordChangedAt)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <h2 className="text-xs font-extrabold text-slate-700 mb-4 uppercase tracking-wider">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button onClick={() => setScreen('sa_restaurants')} className="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl text-center transition-all cursor-pointer">
            <Building2 className="w-5 h-5 text-slate-500 mx-auto mb-1" />
            <p className="text-[10px] font-bold text-slate-600">View Restaurants</p>
          </button>
          <button onClick={() => setModal('password')} className="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl text-center transition-all cursor-pointer">
            <Shield className="w-5 h-5 text-slate-500 mx-auto mb-1" />
            <p className="text-[10px] font-bold text-slate-600">Change Password</p>
          </button>
          <button onClick={() => setScreen('sa_settings')} className="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl text-center transition-all cursor-pointer">
            <Key className="w-5 h-5 text-slate-500 mx-auto mb-1" />
            <p className="text-[10px] font-bold text-slate-600">System Settings</p>
          </button>
        </div>
      </div>

      {modal === 'edit' && (
        <EditProfileModal user={user} onClose={() => setModal(null)} onSaved={handleSaved} onToast={showToast} />
      )}
      {modal === 'password' && (
        <ChangePasswordModal onClose={() => setModal(null)} onToast={showToast} />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 p-3.5 rounded-xl shadow-xl border text-xs font-bold bg-emerald-50 text-emerald-900 border-emerald-200 animate-slide-up">
          {toast}
        </div>
      )}
    </div>
  );
}
