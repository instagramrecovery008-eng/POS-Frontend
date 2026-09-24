import apiClient from './axios';

export const dashboardApi = {
  getDashboard: () => apiClient.get('/dashboard'),
  getSummary: () => apiClient.get('/dashboard/summary'),
  getSales: () => apiClient.get('/dashboard/sales'),
  getTables: () => apiClient.get('/dashboard/tables'),
  getKitchen: () => apiClient.get('/dashboard/kitchen'),
  getPayments: () => apiClient.get('/dashboard/payments'),
  getRecentOrders: () => apiClient.get('/dashboard/recent-orders'),
  getTopItems: () => apiClient.get('/dashboard/top-items'),
  getCategorySales: () => apiClient.get('/dashboard/category-sales'),
  getRecentPayments: () => apiClient.get('/dashboard/recent-payments'),
  getLiveOrders: () => apiClient.get('/dashboard/live-orders'),
  getStaff: () => apiClient.get('/dashboard/staff'),
};

export default dashboardApi;
