import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Shield, LogOut, UserCircle, ChevronDown } from 'lucide-react';
import { useAuthStore, useUiStore, useSettingsStore } from '../../../store';
import { getRoleDisplayName, canAccessScreen } from '../../../utils/permissions';

/**
 * User profile dropdown (top-right of the shared app shell).
 *
 * One reusable component for EVERY authenticated role — Super Admin and all
 * restaurant roles (Admin / Manager / Cashier / Kitchen / Service) — so the
 * account + sign-out affordance is identical everywhere. It renders the real
 * authenticated user from authStore (never sample data) and reuses the existing
 * logout() + setScreen('login') mechanism; no second auth/logout path exists.
 *
 * The "My Profile" entry is only rendered when the current role can actually
 * reach a profile-bearing screen (Super Admin profile, or Settings for the
 * restaurant Admin). Other roles see Sign Out only.
 *
 * ── Positioning (clipping fix) ──
 * The app shell wraps the page in `flex flex-col h-screen overflow-hidden`
 * (and the content column in `overflow-y-auto`), so an absolutely-positioned
 * menu rendered inside the header was clipped at the shell boundary. The menu
 * is therefore rendered in a PORTAL attached to document.body and positioned
 * from the trigger's bounding rect. It is clamped to the viewport (never past
 * the right/bottom edges) and flips above the trigger when there is not enough
 * room below. Position is recomputed on scroll (capture — includes nested
 * scroll containers), resize and orientation change.
 */

// Menu width matches the w-72 card below (18rem). Keep the two in sync.
const MENU_WIDTH = 288;
// Minimum gap between the menu and the viewport edges / the trigger.
const VIEWPORT_MARGIN = 8;

export default function UserProfileDropdown() {
  const { user, logout } = useAuthStore();
  const { settings } = useSettingsStore();
  const { setScreen } = useUiStore();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  // ── Real authenticated identity ──
  const displayName = (() => {
    if (user?.name) return user.name;
    if (user?.firstName) return `${user.firstName} ${user.lastName || ''}`.trim();
    return 'User';
  })();

  const initials = (() => {
    if (user?.initials) return user.initials;
    if (user?.name) return user.name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) || 'U';
    if (user?.firstName) return (user.firstName[0] + (user.lastName?.[0] || '')).toUpperCase() || 'U';
    return 'U';
  })();

  const roleLabel = isSuperAdmin ? 'Super Admin' : getRoleDisplayName(user?.role);
  // Restaurant/business name — restaurant roles only (the SA has no tenant).
  const businessName = !isSuperAdmin ? (settings?.branding?.restaurantName || '') : '';

  // Profile screen is shown only when the role can actually open it. The
  // existing screen + route protections stay authoritative (MANAGER/CASHIER/
  // KITCHEN/WAITER cannot reach Settings, so they get Sign Out only).
  const profileScreen = isSuperAdmin ? 'sa_profile' : 'settings';
  const canOpenProfile = isSuperAdmin || canAccessScreen(user?.role, 'settings');

  const handleSelect = (screen) => {
    setOpen(false);
    setScreen(screen);
  };

  const handleLogout = () => {
    setOpen(false);
    // Reuse the existing logout + navigation mechanism — clears token/user
    // state (and socket/store cleanup driven by auth state) and returns to login.
    setScreen('login');
    logout();
  };

  /**
   * Position the menu from the trigger's bounding rect, clamped to the
   * viewport. Flips above the trigger when the space below is too small.
   */
  const updatePosition = useCallback(() => {
    const trigger = buttonRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;

    // Never wider than the viewport minus both margins.
    const width = Math.min(MENU_WIDTH, Math.max(160, vw - VIEWPORT_MARGIN * 2));

    // Right-align to the trigger, then clamp so it can never overflow the
    // right or left edge of the viewport.
    let left = rect.right - width;
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, vw - width - VIEWPORT_MARGIN));

    // Measured height when available; a sane estimate on the first pass.
    const height = menuRef.current?.offsetHeight || 208;
    const spaceBelow = vh - rect.bottom - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - VIEWPORT_MARGIN;
    const placement = spaceBelow >= height || spaceBelow >= spaceAbove ? 'bottom' : 'top';

    // Clamp vertically too — never past the bottom edge of the viewport.
    let top = placement === 'bottom' ? rect.bottom + VIEWPORT_MARGIN : rect.top - height - VIEWPORT_MARGIN;
    top = Math.max(VIEWPORT_MARGIN, Math.min(top, vh - height - VIEWPORT_MARGIN));

    setCoords({ top, left, width, placement });
  }, []);

  // Position before paint (avoids a visible jump), then once more after the
  // menu has measured itself so the flip decision uses the real height.
  useLayoutEffect(() => {
    if (!open) { setCoords(null); return; }
    updatePosition();
    const raf = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(raf);
  }, [open, updatePosition]);

  // Keep the menu anchored to the trigger while the page scrolls or the window
  // resizes. Capture phase catches scrolling inside nested containers (the
  // scrollable <main>) that bubble events never reach.
  useEffect(() => {
    if (!open) return;
    const onReflow = () => updatePosition();
    window.addEventListener('scroll', onReflow, true);
    window.addEventListener('resize', onReflow);
    window.addEventListener('orientationchange', onReflow);
    return () => {
      window.removeEventListener('scroll', onReflow, true);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('orientationchange', onReflow);
    };
  }, [open, updatePosition]);

  // Close on outside click + Escape (Escape restores focus to the trigger).
  // Both the trigger wrapper AND the portalled menu count as "inside".
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      const inTrigger = wrapRef.current && wrapRef.current.contains(e.target);
      const inMenu = menuRef.current && menuRef.current.contains(e.target);
      if (!inTrigger && !inMenu) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }
      // Roving focus across the menu items (keyboard accessibility).
      if (!menuRef.current) return;
      const items = Array.from(menuRef.current.querySelectorAll('[role="menuitem"]'));
      if (items.length === 0) return;
      const current = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        items[(current + 1 + items.length) % items.length]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        items[(current - 1 + items.length) % items.length]?.focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        items[0]?.focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        items[items.length - 1]?.focus();
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Move focus into the menu when it opens, so keyboard users land on an action.
  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector('[role="menuitem"]');
    first?.focus();
  }, [open]);

  const menu = (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Account menu"
      style={{
        position: 'fixed',
        top: coords ? coords.top : -9999,
        left: coords ? coords.left : -9999,
        width: coords ? coords.width : MENU_WIDTH,
        // Hidden until the first measurement lands (avoids a flash at 0,0).
        visibility: coords ? 'visible' : 'hidden',
      }}
      className="z-[1000] max-w-[calc(100vw-1rem)] bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden animate-fade-in"
    >
      {/* Profile header — real authenticated identity */}
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-9 h-9 ${isSuperAdmin ? 'bg-[#0F172A] text-[#16A34A]' : 'bg-[#16A34A]/10 text-[#16A34A]'} rounded-full flex items-center justify-center font-bold text-xs shrink-0`}>
            {isSuperAdmin ? <Shield className="w-4 h-4" /> : initials}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-slate-800 truncate">{displayName}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#16A34A] truncate">{roleLabel}</p>
          </div>
        </div>
        {user?.email && (
          <p className="text-[11px] text-slate-500 mt-2 truncate" title={user.email}>{user.email}</p>
        )}
        {businessName && (
          <p className="text-[11px] text-slate-400 truncate mt-0.5" title={businessName}>{businessName}</p>
        )}
      </div>

      {/* Actions */}
      <div className="py-1">
        {canOpenProfile && (
          <button
            type="button"
            role="menuitem"
            onClick={() => handleSelect(profileScreen)}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none transition-colors cursor-pointer text-left"
          >
            <UserCircle className="w-4 h-4 shrink-0 text-slate-400" />
            <span className="truncate">{isSuperAdmin ? 'My Profile' : 'Account Details'}</span>
          </button>
        )}
        <button
          type="button"
          role="menuitem"
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-red-500 hover:bg-red-50 focus:bg-red-50 focus:outline-none transition-colors cursor-pointer text-left border-t border-slate-100"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="relative" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${displayName}`}
        title="Account"
        className="flex items-center gap-2 border-l pl-2 sm:pl-3 border-slate-200 min-w-0 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer py-1 pr-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#16A34A]/40"
      >
        <div className={`w-8 h-8 ${isSuperAdmin ? 'bg-[#0F172A] text-[#16A34A] border-[#16A34A]/30' : 'bg-[#16A34A]/10 text-[#16A34A] border-[#16A34A]/20'} rounded-full flex items-center justify-center font-bold text-xs shadow-xs border shrink-0`}>
          {isSuperAdmin ? <Shield className="w-4 h-4" /> : initials}
        </div>
        <div className="hidden md:block leading-none min-w-0 text-left">
          <p className="text-xs font-bold text-[#111827] leading-none truncate max-w-[140px]">
            {displayName}
          </p>
          <p className={`text-[10px] font-bold mt-0.5 uppercase tracking-wide ${isSuperAdmin ? 'text-slate-500' : 'text-[#16A34A]'}`}>
            {roleLabel}
          </p>
        </div>
        <ChevronDown className={`hidden md:block w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Rendered in a body portal so no ancestor overflow/transform can clip it. */}
      {open && typeof document !== 'undefined' && createPortal(menu, document.body)}
    </div>
  );
}
