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
};

export default authApi;
