import apiClient from './axios';
import API_BASE_URL from '../config/apiConfig';

export const reportApi = {
  // ── Existing Reports ──
  getSales: (params) =>
    apiClient.get('/reports/sales', { params }),
  getItemSales: (params) => apiClient.get('/reports/item-sales', { params }),
  getCategorySales: (params) => apiClient.get('/reports/category-sales', { params }),
  getPaymentReport: (params) => apiClient.get('/reports/payment', { params }),
  getDailyReport: (params) => apiClient.get('/reports/daily', { params }),
  getSalesExcelUrl: (startDate, endDate) => {
    const token = localStorage.getItem('pos_token');
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (startDate) params.set('from', startDate);
    if (endDate) params.set('to', endDate);
    return `${API_BASE_URL}/reports/sales/excel?${params.toString()}`;
  },
  getSalesPdfUrl: (startDate, endDate) => {
    const token = localStorage.getItem('pos_token');
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (startDate) params.set('from', startDate);
    if (endDate) params.set('to', endDate);
    return `${API_BASE_URL}/reports/sales/pdf?${params.toString()}`;
  },
  getOrders: (params) =>
    apiClient.get('/reports/orders', { params }),
  getCsvExportUrl: (startDate, endDate) => {
    const token = localStorage.getItem('pos_token');
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (startDate) params.set('from', startDate);
    if (endDate) params.set('to', endDate);
    return `${API_BASE_URL}/reports/sales/csv?${params.toString()}`;
  },

  // ── Sales Reports ──
  getHourlySales: (params) => apiClient.get('/reports/hourly-sales', { params }),
  getSalesComparison: (params) => apiClient.get('/reports/comparison', { params }),

  // ── Discount & Refund Reports ──
  getDiscountReport: (params) => apiClient.get('/reports/discounts', { params }),
  getCancellationReport: (params) => apiClient.get('/reports/cancellations', { params }),

  // ── Kitchen Reports ──
  getKotRegister: (params) => apiClient.get('/reports/kot/register', { params }),
  getKotSummary: (params) => apiClient.get('/reports/kot/summary', { params }),
  getKitchenPerformance: (params) => apiClient.get('/reports/kitchen/performance', { params }),

  // ── Menu Reports ──
  getMenuPerformance: (params) => apiClient.get('/reports/menu/performance', { params }),
  getTopSellingItems: (params) => apiClient.get('/reports/menu/top-selling', { params }),
  getLowSellingItems: (params) => apiClient.get('/reports/menu/low-selling', { params }),
  getCategoryPerformance: (params) => apiClient.get('/reports/menu/category-performance', { params }),

  // ── Table Reports ──
  getTableSales: (params) => apiClient.get('/reports/tables/sales', { params }),
  getTableOccupancy: (params) => apiClient.get('/reports/tables/occupancy', { params }),

  // ── Staff Reports ──
  getStaffSales: (params) => apiClient.get('/reports/staff/sales', { params }),
  getStaffActivity: (params) => apiClient.get('/reports/staff/activity', { params }),
  getStaffDiscountCancellation: (params) => apiClient.get('/reports/staff/discount-cancellation', { params }),

  // ── Management Reports ──
  getDailyClosing: (params) => apiClient.get('/reports/management/daily-closing', { params }),
  getMonthlySummary: (params) => apiClient.get('/reports/management/monthly-summary', { params }),
  getRestaurantPerformance: (params) => apiClient.get('/reports/management/performance', { params }),
};

export default reportApi;
