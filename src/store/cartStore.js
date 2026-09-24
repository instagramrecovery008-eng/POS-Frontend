import { create } from 'zustand';
import { orderApi } from '../api/order.api';
import { paymentApi } from '../api/payment.api';

const useCartStore = create((set, get) => ({
  // Orders
  orders: [],

  // KOT Print Jobs
  kotPrintJobs: [],
  clearKotPrintJobs: () => set({ kotPrintJobs: [] }),

  addKotPrintJob: (job) =>
    set((state) => ({ kotPrintJobs: [job, ...state.kotPrintJobs] })),

  setOrders: (ordersOrFn) => {
    if (typeof ordersOrFn === 'function') {
      set((state) => ({ orders: ordersOrFn(state.orders) }));
    } else {
      set({ orders: ordersOrFn });
    }
  },

  addOrder: (order) =>
    set((state) => ({ orders: [...state.orders, order] })),

  updateOrder: (orderId, updates) =>
    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === orderId ? { ...o, ...updates } : o
      ),
    })),

  removeOrder: (orderId) =>
    set((state) => ({
      orders: state.orders.filter((o) => o.id !== orderId),
    })),

  updateOrderItemStatus: (orderId, itemIndex, status) =>
    set((state) => ({
      orders: state.orders.map((o) => {
        if (o.id === orderId) {
          const items = [...o.items];
          if (items[itemIndex]) {
            items[itemIndex] = { ...items[itemIndex], status };
          }
          return { ...o, items };
        }
        return o;
      }),
    })),

  // Async actions
  createNewOrder: async (orderData) => {
    try {
      const resp = await orderApi.create(orderData);
      if (resp.success && resp.data) {
        return resp.data;
      }
    } catch (e) {
      console.error('Failed to create order:', e);
      throw e;
    }
  },

  /**
   * Collect payment via combined endpoint.
   * @param {number} orderId - Backend order ID
   * @param {Array} payments - [{ paymentMethod, amount, transactionId, notes }]
   * @param {Object} opts - { discount, serviceCharge, roundOff }
   * @returns {Promise<Object>} The bill with payments and order details
   */
  collectPayment: async (orderId, payments, opts = {}) => {
    try {
      const resp = await paymentApi.collect({
        orderId: Number(orderId),
        payments,
        discount: opts.discount || 0,
        discountType: opts.discountType || undefined,
        discountValue: opts.discountValue || 0,
        serviceCharge: opts.serviceCharge || 0,
        roundOff: opts.roundOff || 0,
      });
      if (resp.success && resp.data) {
        // Remove the order from local state after successful payment
        set((state) => ({
          orders: state.orders.filter((o) => o.id !== orderId),
        }));
        // Return the full response data — includes { bill, payments, alreadyPaid }
        return resp.data;
      }
      throw new Error(resp.message || 'Payment failed');
    } catch (e) {
      console.error('Payment failed:', e);
      throw e;
    }
  },

  /** Legacy completePayment — redirects to collectPayment with single payment */
  completePayment: async (orderId, paymentMethod, amount) => {
    return get().collectPayment(orderId, [
      { paymentMethod: paymentMethod.toUpperCase(), amount: Number(amount) },
    ]);
  },
}));

export default useCartStore;
