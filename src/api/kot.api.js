import apiClient from './axios';

export const kotApi = {
  create: (data) => apiClient.post('/kot', data),
  getAll: () => apiClient.get('/kot'),
  getHistory: () => apiClient.get('/kot/history'),
  updateStatus: (id, status) =>
    apiClient.patch(`/kot/${id}/status`, { status }),
  update: (id, data) => apiClient.put(`/kot/${id}`, data),
  updatePriority: (id, priority) =>
    apiClient.patch(`/kot/${id}/priority`, { priority }),
  // Void a ticket. `extra` carries the structured reason code + explanation
  // (reasonCode/reasonDetail) so the backend can validate "Other" requires a
  // written explanation; it stays optional for legacy single-string callers.
  cancel: (id, reason, extra = {}) =>
    apiClient.patch(`/kot/${id}/cancel`, { reason, ...extra }),
  cancelByOrder: (orderId, reason, extra = {}) =>
    apiClient.patch(`/kot/cancel-by-order/${orderId}`, { reason, ...extra }),
  reprint: (id) => apiClient.get(`/kot/reprint/${id}`),
  reprintByOrder: (orderId) => apiClient.get(`/kot/reprint-by-order/${orderId}`),
  // KOT print-job lifecycle: the POS reports whether the ticket was actually
  // dispatched to the printer or whether the dispatch failed (retryable).
  reportPrintResult: (id, data) => apiClient.post(`/kot/${id}/print-result`, data),
};

export default kotApi;
