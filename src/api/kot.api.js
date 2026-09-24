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
  cancel: (id, reason) =>
    apiClient.patch(`/kot/${id}/cancel`, { reason }),
  cancelByOrder: (orderId, reason) =>
    apiClient.patch(`/kot/cancel-by-order/${orderId}`, { reason }),
  reprint: (id) => apiClient.get(`/kot/reprint/${id}`),
  reprintByOrder: (orderId) => apiClient.get(`/kot/reprint-by-order/${orderId}`),
};

export default kotApi;
