import apiClient from './axios';

export const paymentApi = {
  /** Collect payment (combined: create bill + process payments + complete order) */
  collect: (data) => apiClient.post('/payments/collect', data),

  /** Single payment */
  create: (data) => apiClient.post('/payments', data),

  /** Partial payment */
  partial: (data) => apiClient.post('/payments/partial', data),

  /** Split payment across multiple methods */
  split: (data) => apiClient.post('/payments/split', data),

  /** List all payments */
  getAll: () => apiClient.get('/payments'),

  /** Reprint receipt for a bill */
  reprint: (billId) => apiClient.post(`/payments/${billId}/reprint`),

  /** Mark bill as printed */
  markPrinted: (billId) => apiClient.post(`/payments/${billId}/print`),

  /** Generate UPI QR code data */
  generateUPIQr: (data) => apiClient.post('/payments/upi-qr', data),

  /** Verify UPI payment */
  verifyUPI: (data) => apiClient.post('/payments/verify-upi', data),
};

export default paymentApi;
