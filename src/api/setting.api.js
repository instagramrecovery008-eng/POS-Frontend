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

  /**
   * Public product registry (no auth) for the login page's "Our Products"
   * section. Returns ONLY active products; the backend swallows its own
   * errors, and any client-side failure degrades to an empty list so the
   * login flow is never blocked by this decorative section.
   */
  getPublicProducts: async () => {
    try {
      const resp = await fetch(`${API_BASE_URL}/products/public`);
      if (!resp.ok) return [];
      const json = await resp.json();
      return Array.isArray(json?.data) ? json.data : [];
    } catch {
      return [];
    }
  },
};

export default settingApi;
