import React from 'react';
import { Shield, AlertTriangle, Crown } from 'lucide-react';
import { useAuthStore, useUiStore, useSettingsStore } from '../../../store';
import { getRoleDisplayName } from '../../../utils/permissions';

export default function Header() {
  const { user, subscription } = useAuthStore();
  const { settings } = useSettingsStore(); 
  const { setScreen, currentScreen } = useUiStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isSuperAdminScreen = currentScreen?.startsWith('sa_');

  // ── Subscription reminder: always visible, highlighted when expiring ──
  // The lifecycle/days always come from the backend snapshot (authoritative).
  const lifecycle = subscription?.lifecycle;
  const daysLeft = subscription?.daysRemaining;
  const hasDaysLeft = typeof daysLeft === 'number' && !isNaN(daysLeft);
  const expired = lifecycle === 'EXPIRED' || subscription?.status === 'EXPIRED' || (hasDaysLeft && daysLeft <= 0);
  const critical = !expired && hasDaysLeft && daysLeft <= 2;
  const warning = !expired && (lifecycle === 'EXPIRING_SOON' || (hasDaysLeft && daysLeft <= 7));
  const planNameRaw = subscription?.planName || subscription?.plan || '';
  const planDisplay = planNameRaw
    ? (planNameRaw.toLowerCase().includes('plan') ? planNameRaw : `${planNameRaw} Plan`)
    : 'Plan';

  const openSubscription = () => {
    if (!isSuperAdmin) setScreen('subscription');
  };

  // Get user display name
  const getDisplayName = () => {
    if (user?.name) return user.name;
    if (user?.firstName) return `${user.firstName} ${user.lastName || ''}`.trim();
    return 'User';
  };

  // Get initials
  const getInitials = () => {
    if (user?.initials) return user.initials;
    if (user?.name) {
      return user.name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) || 'SA';
    }
    if (user?.firstName) {
      return (user.firstName[0] + (user.lastName?.[0] || '')).toUpperCase() || 'SA';
    }
    return 'SA';
  };

  return (
    <header className="bg-white border-b border-slate-200 h-14 px-3 sm:px-5 shrink-0 flex items-center justify-between gap-3 z-10 select-none shadow-[0_2px_10px_rgba(44,62,80,0.02)]">
      <div className="flex items-center gap-2 min-w-0">
        {!isSuperAdmin && settings?.showTerminalId && (
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono hidden sm:block">
            Station ID: Terminal 04
          </span>
        )}
        {!isSuperAdmin && user?.role === 'ADMIN' && subscription && (
          <button
            onClick={openSubscription}
            title={`Subscription • Expires: ${subscription.expiryDate ? new Date(subscription.expiryDate).toLocaleDateString() : '—'}. Click to manage.`}
            className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all cursor-pointer min-h-[28px] max-w-[46vw] sm:max-w-none truncate ${
              expired
                ? 'bg-red-600 border-red-700 text-white'
                : critical
                  ? 'bg-red-50 border-red-300 text-red-700 animate-pulse'
                  : warning
                    ? 'bg-amber-50 border-amber-200 text-amber-700'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:border-emerald-300'
            }`}
          >
            {expired ? <AlertTriangle className="w-3 h-3" /> : warning ? <AlertTriangle className="w-3 h-3" /> : <Crown className="w-3 h-3" />}
            {planDisplay} • {expired ? 'Expired' : hasDaysLeft ? `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left` : 'Renewal required'}
          </button>
        )}
        {isSuperAdmin && (
          <span className="text-xs font-bold text-slate-400 hidden sm:block">
            Super Admin Portal
          </span>
        )}
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        <div className="flex items-center gap-2 border-l pl-2.5 sm:pl-3 border-slate-200 min-w-0">
          <div className={`w-8 h-8 ${isSuperAdmin ? 'bg-[#0F172A] text-[#16A34A] border-[#16A34A]/30' : 'bg-[#16A34A]/10 text-[#16A34A] border-[#16A34A]/20'} rounded-full flex items-center justify-center font-bold text-xs shadow-xs border shrink-0`}>
            {isSuperAdmin ? <Shield className="w-4 h-4" /> : (getInitials())}
          </div>
          <div className="hidden md:block leading-none min-w-0">
            <p className="text-xs font-bold text-[#111827] leading-none truncate">
              {getDisplayName()}
            </p>
            <p className={`text-[10px] font-bold mt-0.5 uppercase tracking-wide ${isSuperAdmin ? 'text-slate-500' : 'text-[#16A34A]'}`}>
              {isSuperAdmin ? 'Super Admin' : getRoleDisplayName(user?.role)}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
