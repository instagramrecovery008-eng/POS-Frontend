import { create } from 'zustand';

const useUiStore = create((set) => ({
  // Sidebar
  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) =>
    set({ sidebarCollapsed: collapsed }),

  // Mobile navigation drawer (< lg viewports — tablet portrait / mobile).
  // The SAME Sidebar component renders as an off-canvas overlay below lg;
  // this flag only controls its visibility. No duplicate nav logic.
  mobileNavOpen: false,
  setMobileNavOpen: (open) => set({ mobileNavOpen: !!open }),
  toggleMobileNav: () =>
    set((state) => ({ mobileNavOpen: !state.mobileNavOpen })),

  // Terminal Lock (controls whether user sees login or dashboard)
  isUnlocked: !!localStorage.getItem('pos_token'),
  setUnlocked: (val) => set({ isUnlocked: val }),

  // Screen/Routing
  currentScreen: 'login',
  // Lightweight navigation history so screens (e.g. POS Ordering) can offer a Back button
  navHistory: [],
  setScreen: (screen) =>
    set((state) => {
      const current = state.currentScreen;
      let history = state.navHistory || [];
      const shouldTrack =
        current &&
        current !== screen &&
        current !== 'login' &&
        screen !== 'login' &&
        !current.startsWith('sa_') &&
        !screen.startsWith('sa_');
      if (shouldTrack && history[history.length - 1] !== current) {
        history = [...history, current].slice(-10);
      }
      return { currentScreen: screen, navHistory: history };
    }),
  /** Navigate back to the previous screen (used by the Back button). */
  goBack: (fallback = 'dashboard') =>
    set((state) => {
      const history = [...(state.navHistory || [])];
      const prev = history.pop();
      return { currentScreen: prev || fallback, navHistory: history };
    }),

  // Language
  language: 'English',
  setLanguage: (lang) => set({ language: lang }),

  // Notifications/Toast
  toasts: [],
  addToast: (message, type = 'success') => {
    const id = Date.now().toString();
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }],
    }));
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, 4500);
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  // API Error
  apiError: null,
  setApiError: (error) => set({ apiError: error }),
  clearApiError: () => set({ apiError: null }),

  // Checkout State
  checkoutOrderId: null,
  setCheckoutOrderId: (id) => set({ checkoutOrderId: id }),
  checkoutAmountReceived: 0,
  setCheckoutAmountReceived: (amount) =>
    set({ checkoutAmountReceived: amount }),
  activeOrderTakingId: null,
  setActiveOrderTakingId: (id) => set({ activeOrderTakingId: id }),

  // Orders Tab
  ordersActiveTab: 'Active',
  setOrdersActiveTab: (tab) => set({ ordersActiveTab: tab }),

  // Take Order Wizard (full-screen overlay)
  showTakeOrderWizard: false,
  setShowTakeOrderWizard: (show) => set({ showTakeOrderWizard: show }),

  // ── Open Table (Floors & Tables → order entry) ──
  // The table the user tapped is carried EXPLICITLY as its real database id
  // (plus its display number) so the order-entry wizard opens straight on the
  // menu for THAT table — never re-asking order type / floor / table. Only the
  // id and display fields are stored; the wizard still re-loads the table from
  // the tenant-scoped API and re-validates it before opening an order.
  // Set only by the Floors & Tables screen; cleared when the wizard closes so
  // no stale table can leak into a later POS Ordering session.
  pendingTable: null,
  setPendingTable: (table) => set({ pendingTable: table || null }),
  clearPendingTable: () => set({ pendingTable: null }),

  // Refresh trigger — increment after any order action to sync screens
  refreshTrigger: 0,
  incrementRefreshTrigger: () => set((state) => ({ refreshTrigger: state.refreshTrigger + 1 })),
}));

export default useUiStore;
