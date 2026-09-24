import apiClient from './axios';
import API_BASE_URL from '../config/apiConfig';

export const settingApi = {
  get: () => apiClient.get('/settings'),
  save: (data) => apiClient.post('/settings', data),
  uploadLogo: (formData) => apiClient.post('/settings/logo', formData),
  deleteLogo: () => apiClient.delete('/settings/logo'),

  /**
   * Public branding endpoint (no auth required) for the login screen.
   * Uses a separate axios instance without the auth interceptor so it
   * works before any token exists.
   */
  getPublicBranding: async () => {
    try {
      const resp = await fetch(`${API_BASE_URL}/settings/public/branding`);
      if (!resp.ok) return null;
      const json = await resp.json();
      return json?.data || null;
    } catch {
      return null;
    }
  },
};

export default settingApi;
