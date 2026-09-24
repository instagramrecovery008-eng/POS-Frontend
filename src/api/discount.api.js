import apiClient from './axios';

/**
 * Discounts & Promotions API.
 * All endpoints are tenant-scoped server-side — no restaurantId is ever sent.
 */
export const discountApi = {
  // ── Management (ADMIN / MANAGER) ──
  getAll: (params) => apiClient.get('/discounts', { params }),
  getUsageStats: () => apiClient.get('/discounts/usage-stats'),
  // Reference lookups for the form — real tenant data, server-scoped (§14)
  refCategories: () => apiClient.get('/discounts/reference/categories'),
  refProducts: (search) => apiClient.get('/discounts/reference/products', { params: search ? { search } : {} }),
  refStaff: () => apiClient.get('/discounts/reference/staff'),
  getById: (id) => apiClient.get(`/discounts/${id}`),
  create: (data) => apiClient.post('/discounts', data),
  update: (id, data) => apiClient.put(`/discounts/${id}`, data),
  setStatus: (id, status) => apiClient.patch(`/discounts/${id}/status`, { status }),
  archive: (id) => apiClient.delete(`/discounts/${id}`),
  preview: (data) => apiClient.post('/discounts/preview', data),

  // ── Apply (billing-capable roles) ──
  getEligible: (orderId) => apiClient.get(`/discounts/eligible/${orderId}`),
  apply: (orderId, data) => apiClient.post(`/discounts/apply/${orderId}`, data),
  applyManual: (orderId, data) => apiClient.post(`/discounts/apply/${orderId}/manual`, data),
  removeApplied: (orderDiscountId) => apiClient.delete(`/discounts/applied/${orderDiscountId}`),
};

export default discountApi;
