import apiClient from './axios';

export const orderApi = {
  getAll: () => apiClient.get('/orders'),
  getActive: () => apiClient.get('/orders/active'),
  getById: (id) => apiClient.get(`/orders/${id}`),
  create: (data) => apiClient.post('/orders', data),
  update: (id, data) => apiClient.put(`/orders/${id}`, data),
  delete: (id) => apiClient.delete(`/orders/${id}`),
  updateStatus: (id, status) =>
    apiClient.patch(`/orders/${id}/status`, { status }),
  addItem: (id, data) =>
    apiClient.post(`/orders/${id}/items`, data),
  updateItem: (orderId, itemId, data) =>
    apiClient.patch(`/orders/${orderId}/items/${itemId}`, data),
  deleteItem: (orderId, itemId) =>
    apiClient.delete(`/orders/${orderId}/items/${itemId}`),
  updateDiscount: (id, data) =>
    apiClient.patch(`/orders/${id}/discount`, data),
  cancel: (id, reason) =>
    apiClient.patch(`/orders/${id}/cancel`, { reason }),
  hold: (id) => apiClient.patch(`/orders/${id}/hold`),
  resume: (id) => apiClient.patch(`/orders/${id}/resume`),
  changeTable: (id, tableId) =>
    apiClient.patch(`/orders/${id}/change-table`, { tableId }),
  mergeOrders: (sourceOrderId, targetOrderId) =>
    apiClient.post(`/orders/${sourceOrderId}/merge`, { targetOrderId }),
  splitOrders: (mergeGroupId) =>
    apiClient.post('/orders/split', { mergeGroupId }),
  addNotes: (id, data) =>
    apiClient.patch(`/orders/${id}/notes`, data),
};

export default orderApi;
