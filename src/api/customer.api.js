import apiClient from './axios';

export const customerApi = {
  getAll: () => apiClient.get('/customers'),
  // Server-side search (?q=&limit=) — used by the POS customer picker.
  search: (queryString) => apiClient.get(`/customers?${queryString}`),
  getById: (id) => apiClient.get(`/customers/${id}`),
  create: (data) => apiClient.post('/customers', data),
  update: (id, data) => apiClient.put(`/customers/${id}`, data),
  delete: (id) => apiClient.delete(`/customers/${id}`),
  createWalkIn: () => apiClient.post('/customers/walk-in'),
};

export default customerApi;
