import apiClient from './axios';

export const superAdminApi = {
  // ─── Dashboard ───────────────────────────────────────────────
  getDashboard: () =>
    apiClient.get('/super-admin/dashboard'),

  // ─── Own Profile ─────────────────────────────────────────────
  getProfile: () =>
    apiClient.get('/super-admin/profile'),

  updateProfile: (data) =>
    apiClient.put('/super-admin/profile', data),

  // ─── Restaurants ──────────────────────────────────────────────
  getRestaurants: (params = {}) =>
    apiClient.get('/super-admin/restaurants', { params }),

  getRestaurant: (id) =>
    apiClient.get(`/super-admin/restaurants/${id}`),

  createRestaurant: (data) =>
    apiClient.post('/super-admin/restaurants', data),

  createRestaurantOnboarding: (data) =>
    apiClient.post('/super-admin/restaurants/onboarding', data),

  uploadDocument: (restaurantId, formData) =>
    apiClient.post(`/super-admin/restaurants/${restaurantId}/documents`, formData),

  getDocuments: (restaurantId) =>
    apiClient.get(`/super-admin/restaurants/${restaurantId}/documents`),

  verifyDocument: (restaurantId, documentId) =>
    apiClient.patch(`/super-admin/restaurants/${restaurantId}/documents/${documentId}/verify`),

  rejectDocument: (restaurantId, documentId, reason) =>
    apiClient.patch(`/super-admin/restaurants/${restaurantId}/documents/${documentId}/reject`, { reason }),

  deleteDocument: (restaurantId, documentId) =>
    apiClient.delete(`/super-admin/restaurants/${restaurantId}/documents/${documentId}`),

  createPolicyAgreement: (restaurantId, data) =>
    apiClient.post(`/super-admin/restaurants/${restaurantId}/policy-agreements`, data),

  getPolicyAgreements: (restaurantId) =>
    apiClient.get(`/super-admin/restaurants/${restaurantId}/policy-agreements`),

  updateRestaurant: (id, data) =>
    apiClient.put(`/super-admin/restaurants/${id}`, data),

  updateRestaurantStatus: (id, status) =>
    apiClient.patch(`/super-admin/restaurants/${id}/status`, { status }),

  deleteRestaurant: (id) =>
    apiClient.delete(`/super-admin/restaurants/${id}`),

  getRestaurantLoginAs: (id) =>
    apiClient.get(`/super-admin/restaurants/${id}/login-as`),

  // ─── Self-serve Business Applications (new-user onboarding review) ───
  getBusinessApplications: (params = {}) =>
    apiClient.get('/super-admin/business-applications', { params }),

  getBusinessApplication: (id) =>
    apiClient.get(`/super-admin/business-applications/${id}`),

  approveBusinessApplication: (id) =>
    apiClient.post(`/super-admin/business-applications/${id}/approve`),

  rejectBusinessApplication: (id, reason) =>
    apiClient.post(`/super-admin/business-applications/${id}/reject`, { reason }),

  getReviewMode: () =>
    apiClient.get('/super-admin/business-applications/review-mode'),

  setReviewMode: (mode) =>
    apiClient.put('/super-admin/business-applications/review-mode', { mode }),

  // ─── Manual Payment Applications (new simplified onboarding flow) ─────────
  getManualApplications: (params = {}) =>
    apiClient.get('/super-admin/manual-applications', { params }),

  getManualApplication: (id) =>
    apiClient.get(`/super-admin/manual-applications/${id}`),

  // generateManualPaymentQR removed — the approval workflow must not offer QR
  // generation; payment is verified manually via markManualPaymentReceived.

  markManualPaymentReceived: (id, data) =>
    apiClient.post(`/super-admin/manual-applications/${id}/mark-payment`, data),

  approveManualApplication: (id) =>
    apiClient.post(`/super-admin/manual-applications/${id}/approve`),

  rejectManualApplication: (id, reason) =>
    apiClient.post(`/super-admin/manual-applications/${id}/reject`, { reason }),

  // ─── Users ───────────────────────────────────────────────────
  getUsers: (params = {}) =>
    apiClient.get('/super-admin/users', { params }),

  updateUser: (id, data) =>
    apiClient.put(`/super-admin/users/${id}`, data),

  resetUserPassword: (id) =>
    apiClient.patch(`/super-admin/users/${id}/reset-password`),

  toggleUserStatus: (id) =>
    apiClient.patch(`/super-admin/users/${id}/toggle-status`),

  deleteUser: (id) =>
    apiClient.delete(`/super-admin/users/${id}`),

  // ─── Subscriptions ───────────────────────────────────────────
  getSubscriptions: (params = {}) =>
    apiClient.get('/super-admin/subscriptions', { params }),

  changeSubscriptionPlan: (restaurantId, data) =>
    apiClient.put(`/super-admin/subscriptions/${restaurantId}/plan`, data),

  renewSubscription: (restaurantId, notes) =>
    apiClient.post(`/super-admin/subscriptions/${restaurantId}/renew`, { notes }),

  cancelSubscription: (restaurantId, notes) =>
    apiClient.post(`/super-admin/subscriptions/${restaurantId}/cancel`, { notes }),

  suspendSubscription: (restaurantId, notes) =>
    apiClient.post(`/super-admin/subscriptions/${restaurantId}/suspend`, { notes }),

  activateSubscription: (restaurantId, notes) =>
    apiClient.post(`/super-admin/subscriptions/${restaurantId}/activate`, { notes }),

  getSubscriptionHistory: (restaurantId) =>
    apiClient.get(`/super-admin/subscriptions/${restaurantId}/history`),

  getSubscriptionPayments: (restaurantId) =>
    apiClient.get(`/super-admin/subscriptions/${restaurantId}/payments`),

  // ─── Plans (database-driven) ──────────────────────────────────
  getPlans: (params = {}) =>
    apiClient.get('/super-admin/plans', { params }),

  getPlanModules: (params = {}) =>
    apiClient.get('/super-admin/plans/modules', { params }),

  createPlan: (data) =>
    apiClient.post('/super-admin/plans', data),

  updatePlan: (id, data) =>
    apiClient.put(`/super-admin/plans/${id}`, data),

  togglePlanActive: (id) =>
    apiClient.patch(`/super-admin/plans/${id}/toggle`),

  duplicatePlan: (id) =>
    apiClient.post(`/super-admin/plans/${id}/duplicate`),

  deletePlan: (id) =>
    apiClient.delete(`/super-admin/plans/${id}`),

  // ─── Reports ─────────────────────────────────────────────────
  getReports: (params = {}) =>
    apiClient.get('/super-admin/reports', { params }),

  // ─── Notifications ───────────────────────────────────────────
  getNotifications: (params = {}) =>
    apiClient.get('/super-admin/notifications', { params }),

  // ─── System Settings ─────────────────────────────────────────
  getSettings: (params = {}) =>
    apiClient.get('/super-admin/settings', { params }),

  updateSetting: (key, value) =>
    apiClient.put('/super-admin/settings', { key, value }),

  updateSettings: (settings) =>
    apiClient.put('/super-admin/settings', { settings }),

  // ─── Audit Logs ──────────────────────────────────────────────
  getAuditLogs: (params = {}) =>
    apiClient.get('/super-admin/audit-logs', { params }),

  // ─── Payment Gateway (platform-level) ────────────────────────
  getGatewayStatus: () =>
    apiClient.get('/super-admin/payments/gateway'),
  saveGatewayConfig: (data) =>
    apiClient.put('/super-admin/payments/gateway', data),
  testGateway: () =>
    apiClient.post('/super-admin/payments/gateway/test'),
  toggleGateway: (enabled) =>
    apiClient.post('/super-admin/payments/gateway/toggle', { enabled }),
  getPaymentMetrics: () =>
    apiClient.get('/super-admin/payments/metrics'),

  // ─── Email (SMTP) settings + delivery log ────────────────────
  // NOTE: the settings payload never carries the SMTP password back out —
  // the backend masks it; sending the mask preserves the stored secret.
  getEmailSettings: () =>
    apiClient.get('/super-admin/email/settings'),
  updateEmailSettings: (data) =>
    apiClient.put('/super-admin/email/settings', data),
  // Active email provider selection (GRAPH | SMTP) — persisted server-side.
  getEmailProvider: () =>
    apiClient.get('/super-admin/email/provider'),
  updateEmailProvider: (provider) =>
    apiClient.put('/super-admin/email/provider', { provider }),
  verifyEmailSettings: () =>
    apiClient.post('/super-admin/email/verify'),
  sendTestEmail: (to) =>
    apiClient.post('/super-admin/email/test', { to }),
  getEmailLogs: (params = {}) =>
    apiClient.get('/super-admin/email/logs', { params }),
  resendEmail: (id) =>
    apiClient.post(`/super-admin/email/logs/${id}/resend`),
  retryEmailQueue: () =>
    apiClient.post('/super-admin/email/queue/retry'),
  listPayments: (params = {}) =>
    apiClient.get('/super-admin/payments', { params }),
};

export default superAdminApi;
