import { create } from 'zustand';

const useUiStore = create((set) => ({
  // Sidebar
  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) =>
    set({ sidebarCollapsed: collapsed }),

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

  // Refresh trigger — increment after any order action to sync screens
  refreshTrigger: 0,
  incrementRefreshTrigger: () => set((state) => ({ refreshTrigger: state.refreshTrigger + 1 })),
}));

export default useUiStore;
