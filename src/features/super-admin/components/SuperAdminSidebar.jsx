import React from 'react';
import { useAuthStore, useUiStore } from '../../../store';
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Package,
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
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'sa_dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'sa_applications', label: 'Applications', icon: ClipboardCheck },
  { id: 'sa_restaurants', label: 'Restaurants', icon: Building2 },
  { id: 'sa_subscriptions', label: 'Subscriptions', icon: CreditCard },

  { id: 'sa_plans', label: 'Plans', icon: Package },
  { id: 'sa_invoices', label: 'Invoices', icon: FileText },
  { id: 'sa_reports', label: 'Platform Reports', icon: BarChart3 },
  { id: 'sa_notifications', label: 'Notifications', icon: Bell },
  { id: 'sa_settings', label: 'System Settings', icon: Settings },
  { id: 'sa_gateway', label: 'Payment Gateway', icon: Wallet },
  { id: 'sa_audit', label: 'Audit Logs', icon: ClipboardList },
];

export default function SuperAdminSidebar() {
  const { user, logout } = useAuthStore();
  const { currentScreen, setScreen, sidebarCollapsed, toggleSidebar } = useUiStore();

  const handleNav = (screenId) => {
    setScreen(screenId);
  };

  const handleLogout = () => {
    setScreen('login');
    logout();
  };

  const isActive = (id) => currentScreen === id;

  return (
    <aside
      className={`
        ${sidebarCollapsed ? 'w-[68px]' : 'w-[68px] lg:w-[240px]'}
        relative z-30 h-screen bg-[#0F172A] border-r border-white/5
        flex flex-col transition-all duration-300 shrink-0
      `}
    >
      {/* Branding */}
      <div className={`flex items-center gap-2.5 px-4 h-16 border-b border-white/5 justify-center lg:justify-start`}>
        <div className="w-9 h-9 bg-gradient-to-br from-[#16A34A] to-[#15803D] rounded-xl flex items-center justify-center shadow-lg shrink-0">
          <Shield className="w-5 h-5 text-white" />
        </div>
        {!sidebarCollapsed && (
          <div className="min-w-0 hidden lg:block">
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
                justify-center lg:justify-start
              `}
            >
              <Icon className="w-4.5 h-4.5 shrink-0" />
              {!sidebarCollapsed && <span className="truncate hidden lg:block">{item.label}</span>}
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
            justify-center lg:justify-start
          `}
        >
          <UserCircle className="w-4.5 h-4.5 shrink-0" />
          {!sidebarCollapsed && (
            <span className="truncate hidden lg:block">{user?.name || 'Profile'}</span>
          )}
        </button>
        <button
          onClick={handleLogout}
          title="Logout"
          className="w-full flex items-center gap-2.5 px-3 py-3 min-h-11 rounded-xl text-xs font-bold text-red-400 hover:bg-red-500/10 transition-all duration-150 cursor-pointer justify-center lg:justify-start"
        >
          <LogOut className="w-4.5 h-4.5 shrink-0" />
          {!sidebarCollapsed && <span className="hidden lg:block">Logout</span>}
        </button>
        {/* Collapse toggle (desktop only) */}
        <button
          onClick={toggleSidebar}
          className="hidden lg:flex w-full items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[10px] font-bold text-slate-500 hover:text-white hover:bg-white/5 transition-all duration-150 cursor-pointer mt-1"
        >
          {sidebarCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </div>
    </aside>
  );
}
