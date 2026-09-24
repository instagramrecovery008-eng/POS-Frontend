import apiClient from './axios';

export const tableApi = {
  getAll: () => apiClient.get('/tables'),
  create: (data) => apiClient.post('/tables', data),
  update: (id, data) => apiClient.put(`/tables/${id}`, data),
  delete: (id) => apiClient.delete(`/tables/${id}`),
  updateStatus: (id, status) =>
    apiClient.put(`/tables/${id}/status`, { status }),
};

export default tableApi;
