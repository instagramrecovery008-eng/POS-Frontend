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
  Shield,
  X,
} from 'lucide-react';

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

export default function SuperAdminSidebar() {
  const { user, logout } = useAuthStore();
  const { currentScreen, setScreen, sidebarCollapsed, toggleSidebar, mobileNavOpen, setMobileNavOpen } = useUiStore();

  const handleNav = (screenId) => {
    setScreen(screenId);
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

  // ── Mobile / tablet-portrait drawer (< lg): off-canvas overlay ──
  if (mobileNavOpen) {
    return (
      <>
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] lg:hidden animate-fade-in"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
        <aside
          className={`
            fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] h-full bg-[#0F172A] border-r border-white/5
            flex flex-col shadow-2xl transition-transform duration-300 lg:hidden
            ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'}
          `}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          {/* Branding */}
          <div className={`flex items-center gap-2.5 px-4 h-16 border-b border-white/5 shrink-0`}>
            <div className="w-9 h-9 bg-gradient-to-br from-[#16A34A] to-[#15803D] rounded-xl flex items-center justify-center shadow-lg shrink-0">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold text-white tracking-tight truncate">Super Admin</p>
              <p className="text-[9px] font-bold text-[#16A34A] uppercase tracking-wider">Control Panel</p>
            </div>
            <button
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close navigation"
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5 no-scrollbar">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNav(item.id)}
                  className={`
                    w-full flex items-center gap-2.5 px-3 py-3 min-h-11 rounded-xl text-xs font-bold
                    transition-all duration-150 cursor-pointer justify-start
                    ${isActive(item.id)
                      ? 'bg-[#16A34A]/15 text-[#16A34A] shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }
                  `}
                >
                  <Icon className="w-4.5 h-4.5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Profile & Logout */}
          <div className="border-t border-white/5 p-2 space-y-1 shrink-0">
            <button
              onClick={() => handleNav('sa_profile')}
              className={`
                w-full flex items-center gap-2.5 px-3 py-3 min-h-11 rounded-xl text-xs font-bold
                transition-all duration-150 cursor-pointer justify-start
                ${isActive('sa_profile') ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}
              `}
            >
              <UserCircle className="w-4.5 h-4.5 shrink-0" />
              <span className="truncate">{user?.name || 'Profile'}</span>
            </button>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-3 min-h-11 rounded-xl text-xs font-bold text-red-400 hover:bg-red-500/10 transition-all duration-150 cursor-pointer justify-start"
            >
              <LogOut className="w-4.5 h-4.5 shrink-0" />
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
        ${sidebarCollapsed ? 'w-[68px]' : 'w-[68px] xl:w-[240px]'}
        relative z-30 h-screen bg-[#0F172A] border-r border-white/5
        flex flex-col transition-all duration-300 shrink-0
      `}
    >
      {/* Branding */}
      <div className={`flex items-center gap-2.5 px-4 h-16 border-b border-white/5 justify-center xl:justify-start`}>
        <div className="w-9 h-9 bg-gradient-to-br from-[#16A34A] to-[#15803D] rounded-xl flex items-center justify-center shadow-lg shrink-0">
          <Shield className="w-5 h-5 text-white" />
        </div>
        {!sidebarCollapsed && (
          <div className="min-w-0 hidden xl:block">
            <p className="text-sm font-extrabold text-white tracking-tight truncate">Super Admin</p>
            <p className="text-[9px] font-bold text-[#16A34A] uppercase tracking-wider">Control Panel</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5 no-scrollbar">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              title={item.label}
              className={`
                w-full flex items-center gap-2.5 px-3 py-3 min-h-11 rounded-xl text-xs font-bold
                transition-all duration-150 cursor-pointer
                ${isActive(item.id)
                  ? 'bg-[#16A34A]/15 text-[#16A34A] shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
                }
                justify-center xl:justify-start
              `}
            >
              <Icon className="w-4.5 h-4.5 shrink-0" />
              {!sidebarCollapsed && <span className="truncate hidden xl:block">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Profile & Logout */}
      <div className="border-t border-white/5 p-2 space-y-1">
        <button
          onClick={() => handleNav('sa_profile')}
          title="Profile"
          className={`
            w-full flex items-center gap-2.5 px-3 py-3 min-h-11 rounded-xl text-xs font-bold
            transition-all duration-150 cursor-pointer
            ${isActive('sa_profile') ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}
            justify-center xl:justify-start
          `}
        >
          <UserCircle className="w-4.5 h-4.5 shrink-0" />
          {!sidebarCollapsed && (
            <span className="truncate hidden xl:block">{user?.name || 'Profile'}</span>
          )}
        </button>
        <button
          onClick={handleLogout}
          title="Logout"
          className="w-full flex items-center gap-2.5 px-3 py-3 min-h-11 rounded-xl text-xs font-bold text-red-400 hover:bg-red-500/10 transition-all duration-150 cursor-pointer justify-center xl:justify-start"
        >
          <LogOut className="w-4.5 h-4.5 shrink-0" />
          {!sidebarCollapsed && <span className="hidden xl:block">Logout</span>}
        </button>
        {/* Collapse toggle (desktop only) */}
        <button
          onClick={toggleSidebar}
          className="hidden xl:flex w-full items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[10px] font-bold text-slate-500 hover:text-white hover:bg-white/5 transition-all duration-150 cursor-pointer mt-1"
        >
          {sidebarCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </div>
    </aside>
  );
}
