import React, { useEffect } from 'react';
import { useAuthStore, useUiStore } from '../../../store';
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Package,
  Blocks,
  FileText,
  BarChart3,
  Bell,
  Settings,
  Wallet,
  ClipboardList,
  ClipboardCheck,
  UserCircle,
  LogOut,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { BRAND } from '../../../config/company';
import BrandLogo from '../../../components/common/BrandLogo';

const NAV_ITEMS = [
  { id: 'sa_dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'sa_applications', label: 'Applications', icon: ClipboardCheck },
  { id: 'sa_restaurants', label: 'Restaurants', icon: Building2 },
  { id: 'sa_subscriptions', label: 'Subscriptions', icon: CreditCard },

  { id: 'sa_plans', label: 'Plans', icon: Package },
  { id: 'sa_products', label: 'Products', icon: Blocks },
  { id: 'sa_invoices', label: 'Invoices', icon: FileText },
  { id: 'sa_reports', label: 'Platform Reports', icon: BarChart3 },
  { id: 'sa_notifications', label: 'Notifications', icon: Bell },
  { id: 'sa_settings', label: 'System Settings', icon: Settings },
  { id: 'sa_gateway', label: 'Payment Gateway', icon: Wallet },
  { id: 'sa_audit', label: 'Audit Logs', icon: ClipboardList },
];

// Shared rail styling: the dark navy rail is unchanged; the active item uses the
// QWIKOUT blue → purple accents instead of the legacy green.
const itemClass = (active, collapsed) => `
  group relative w-full flex items-center gap-2.5 px-3 py-3 min-h-11 rounded-xl text-xs font-bold
  transition-colors duration-150 cursor-pointer
  ${collapsed ? 'justify-center' : 'justify-start'}
  ${active
    ? 'bg-[#0866E8]/20 text-white shadow-sm'
    : 'text-slate-400 hover:text-white hover:bg-white/5'
  }
`;

/** Blue → purple indicator pinned to the left edge of the active item. */
function ActiveBar() {
  return (
    <span
      aria-hidden="true"
      className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-[#08B9F5] to-[#9228F5]"
    />
  );
}

export default function SuperAdminSidebar() {
  const { user, logout } = useAuthStore();
  const { currentScreen, setScreen, sidebarCollapsed, toggleSidebar, mobileNavOpen, setMobileNavOpen } = useUiStore();

  // Navigating always dismisses the mobile drawer so the destination page is in
  // view immediately (desktop rail stays put).
  const handleNav = (screenId) => {
    setScreen(screenId);
    setMobileNavOpen(false);
  };

  const handleLogout = () => {
    setMobileNavOpen(false);
    setScreen('login');
    logout();
  };

  const isActive = (id) => currentScreen === id;

  // ── Mobile drawer: close on Escape + lock body scroll while open ──
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setMobileNavOpen(false); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [mobileNavOpen, setMobileNavOpen]);

  // ── Mobile / tablet drawer (< lg): off-canvas overlay, always expanded ──
  if (mobileNavOpen) {
    return (
      <>
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] animate-fade-in lg:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
        <aside
          className="fixed inset-y-0 left-0 z-50 flex h-full w-72 max-w-[85vw] flex-col border-r border-white/5 bg-[#0F172A] shadow-2xl lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          {/* Branding — transparent wordmark directly on the navy rail */}
          <div className="flex h-16 shrink-0 items-center gap-2 border-b border-white/5 px-4">
            <BrandLogo priority className="h-8 w-[122px]" />
            <p className="min-w-0 flex-1 truncate text-[9px] font-bold uppercase tracking-wider text-[#8EC5FF]">
              Super Admin
            </p>
            <button
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close navigation"
              className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="no-scrollbar flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => handleNav(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={itemClass(active, false)}
                >
                  {active && <ActiveBar />}
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Profile & Logout */}
          <div className="shrink-0 space-y-1 border-t border-white/5 p-2">
            <button
              onClick={() => handleNav('sa_profile')}
              aria-current={isActive('sa_profile') ? 'page' : undefined}
              className={itemClass(isActive('sa_profile'), false)}
            >
              {isActive('sa_profile') && <ActiveBar />}
              <UserCircle className="h-[18px] w-[18px] shrink-0" />
              <span className="truncate">{user?.name || 'Profile'}</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-3 text-xs font-bold text-red-400 transition-colors duration-150 hover:bg-red-500/10 cursor-pointer"
            >
              <LogOut className="h-[18px] w-[18px] shrink-0" />
              <span>Logout</span>
            </button>
          </div>
        </aside>
      </>
    );
  }

  return (
    <aside
      className={`
        relative z-30 hidden h-screen shrink-0 flex-col border-r border-white/5 bg-[#0F172A] lg:flex
        transition-[width] duration-300
        ${sidebarCollapsed ? 'w-[76px]' : 'w-[248px]'}
      `}
      aria-label="Super Admin navigation"
    >
      {/* Branding — transparent logo (no white plate) */}
      <div
        className={`flex h-16 shrink-0 items-center border-b border-white/5 ${
          sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-4'
        }`}
      >
        {sidebarCollapsed ? (
          <img
            src={BRAND.icon}
            alt={BRAND.name}
            draggable={false}
            decoding="async"
            className="h-8 w-8 object-contain"
          />
        ) : (
          <>
            <BrandLogo priority className="h-9 w-[132px] shrink-0" />
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase leading-tight tracking-wider text-[#8EC5FF]">
                Super Admin
              </p>
              <p className="text-[9px] font-semibold leading-tight text-slate-400">Control Panel</p>
            </div>
          </>
        )}
      </div>

      {/* Navigation — labels only in expanded mode */}
      <nav className="no-scrollbar flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.id);
          const label = sidebarCollapsed ? undefined : item.label;
          return (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              title={sidebarCollapsed ? item.label : undefined}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              className={`${itemClass(active, sidebarCollapsed)} ${active && !sidebarCollapsed ? 'pr-2' : ''}`}
            >
              {active && <ActiveBar />}
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {label && <span className="truncate">{label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Profile & Logout */}
      <div className="shrink-0 space-y-1 border-t border-white/5 p-2">
        <button
          onClick={() => handleNav('sa_profile')}
          title={sidebarCollapsed ? 'Profile' : undefined}
          aria-label="Profile"
          aria-current={isActive('sa_profile') ? 'page' : undefined}
          className={itemClass(isActive('sa_profile'), sidebarCollapsed)}
        >
          {isActive('sa_profile') && <ActiveBar />}
          <UserCircle className="h-[18px] w-[18px] shrink-0" />
          {!sidebarCollapsed && <span className="truncate">{user?.name || 'Profile'}</span>}
        </button>
        <button
          onClick={handleLogout}
          title={sidebarCollapsed ? 'Logout' : undefined}
          aria-label="Logout"
          className={`flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-3 text-xs font-bold text-red-400 transition-colors duration-150 hover:bg-red-500/10 cursor-pointer ${
            sidebarCollapsed ? 'justify-center' : 'justify-start'
          }`}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          {!sidebarCollapsed && <span>Logout</span>}
        </button>

        {/* Collapse / expand control (desktop rail) */}
        <button
          onClick={toggleSidebar}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!sidebarCollapsed}
          className={`mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 transition-colors duration-150 hover:bg-white/5 hover:text-white cursor-pointer ${
            sidebarCollapsed ? 'justify-center' : 'justify-start'
          }`}
        >
          {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          {!sidebarCollapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
