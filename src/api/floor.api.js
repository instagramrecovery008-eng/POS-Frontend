import apiClient from './axios';

export const floorApi = {
  getAll: () => apiClient.get('/floors'),
  getById: (id) => apiClient.get(`/floors/${id}`),
  create: (data) => apiClient.post('/floors', data),
  update: (id, data) => apiClient.put(`/floors/${id}`, data),
  delete: (id) => apiClient.delete(`/floors/${id}`),
};

export default floorApi;
