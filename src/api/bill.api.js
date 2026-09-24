import apiClient from './axios';

export const billApi = {
  create: (data) => apiClient.post('/bills', data),
  getAll: () => apiClient.get('/bills'),
  getById: (id) => apiClient.get(`/bills/${id}`),
  cancel: (id, reason) =>
    apiClient.post(`/bills/${id}/cancel`, { reason }),
};

export default billApi;
