import apiClient from './axios';

export const authApi = {
  login: (email, password) =>
    apiClient.post('/auth/login', { email, password }),

  register: (data) =>
    apiClient.post('/auth/register', data),

  profile: () =>
    apiClient.get('/auth/profile'),

  verifyPassword: (password) =>
    apiClient.post('/auth/verify-password', { password }),

  changePassword: (currentPassword, newPassword) =>
    apiClient.post('/auth/change-password', { currentPassword, newPassword }),

  // Secure password SETUP — the single-use link emailed to a newly provisioned
  // admin or a password reset. No credential is ever handled here beyond the
  // password the user chooses themselves.
  validatePasswordSetup: (email, token) =>
    apiClient.get('/auth/password/setup', { params: { email, token } }),

  setupPassword: (email, token, newPassword) =>
    apiClient.post('/auth/password/setup', { email, token, newPassword }),
};

export default authApi;
