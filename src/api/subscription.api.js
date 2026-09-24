import apiClient from './axios';

export const subscriptionApi = {
  // Super Admin (existing behavior)
  upgrade: (restaurantId, data) =>
    apiClient.put(`/subscriptions/${restaurantId}`, data),
  renew: (restaurantId) =>
    apiClient.patch(`/subscriptions/${restaurantId}/renew`),

  // Restaurant self-service (restaurant-scoped by the JWT)
  getMySubscription: () => apiClient.get('/subscriptions/me'),
  getGatewayStatus: () => apiClient.get('/subscriptions/gateway-status'),
  refresh: () => apiClient.get('/subscriptions/refresh'),
  listPlans: (cycle) => apiClient.get('/subscriptions/plans', { params: cycle ? { cycle } : {} }),
  // Server-resolved eligibility metadata (businessType/businessMode) for the
  // plan screen — the UI labels the list, it never re-derives the mapping.
  getPlansMeta: () => apiClient.get('/subscriptions/plans/meta'),
  getPaymentHistory: () => apiClient.get('/subscriptions/payments'),
  getPayment: (id) => apiClient.get(`/subscriptions/payments/${id}`),
  createCheckout: (data) => apiClient.post('/subscriptions/checkout', data),
  verifyPayment: (data) => apiClient.post('/subscriptions/verify', data),
  // Only the DELETE (legacy cleanup of rows created before the paid-purchase
  // flow) is used by the UI — there is no schedule-downgrade purchase flow.
  cancelScheduledDowngrade: () => apiClient.delete('/subscriptions/downgrade'),
};

export default subscriptionApi;
