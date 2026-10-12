import React from 'react';
import { AlertTriangle, Crown, Menu } from 'lucide-react';
import { useAuthStore, useUiStore, useSettingsStore } from '../../../store';
import UserProfileDropdown from './UserProfileDropdown';

export default function Header() {
  const { user, subscription } = useAuthStore();
  const { settings } = useSettingsStore(); 
  const { setScreen, setMobileNavOpen } = useUiStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

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

  return (
    <header className="bg-white border-b border-slate-200 h-14 px-3 sm:px-5 shrink-0 flex items-center justify-between gap-2 sm:gap-3 z-10 select-none shadow-[0_2px_10px_rgba(44,62,80,0.02)]">
      <div className="flex items-center gap-2 min-w-0">
        {/* Mobile / tablet-portrait menu button — opens the SAME Sidebar as an
            off-canvas drawer (< lg). Hidden on lg+ where the sidebar is visible. */}
        <button
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open navigation menu"
          className="lg:hidden p-2 -ml-1 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>
        {!isSuperAdmin && settings?.showTerminalId && (
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono hidden md:block">
            Station ID: Terminal 04
          </span>
        )}
        {!isSuperAdmin && user?.role === 'ADMIN' && subscription && (
          <button
            onClick={openSubscription}
            title={`Subscription • Expires: ${subscription.expiryDate ? new Date(subscription.expiryDate).toLocaleDateString() : '—'}. Click to manage.`}
            className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all cursor-pointer min-h-[28px] max-w-[46vw] md:max-w-none truncate ${
              expired
                ? 'bg-red-600 border-red-700 text-white'
                : critical
                  ? 'bg-red-50 border-red-300 text-red-700 animate-pulse'
                  : warning
                    ? 'bg-amber-50 border-amber-200 text-amber-700'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:border-emerald-300'
            }`}
          >
            {expired ? <AlertTriangle className="w-3 h-3 shrink-0" /> : warning ? <AlertTriangle className="w-3 h-3 shrink-0" /> : <Crown className="w-3 h-3 shrink-0" />}
            <span className="truncate">{planDisplay} • {expired ? 'Expired' : hasDaysLeft ? `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left` : 'Renewal required'}</span>
          </button>
        )}
        {isSuperAdmin && (
          <span className="text-xs font-bold text-slate-400 hidden md:block">
            Super Admin Portal
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
        {/* Shared profile dropdown — real user info + working logout for every
            authenticated role (Super Admin and all restaurant roles). */}
        <UserProfileDropdown />
      </div>
    </header>
  );
}
