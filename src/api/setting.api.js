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
   * section. Returns ONLY active products, already ordered by the backend.
   *
   * Unlike the branding helper this deliberately THROWS on a transport/HTTP
   * failure so the login page can show a distinct diagnostic state instead of
   * silently hiding the section. A successful response with an empty list is
   * still a normal "no products published" state.
   */
  getPublicProducts: async () => {
    const resp = await fetch(`${API_BASE_URL}/products/public`, {
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) {
      let message = `Product catalog request failed (HTTP ${resp.status}).`;
      try {
        const json = await resp.json();
        if (json?.message) message = json.message;
      } catch { /* keep the status-based message */ }
      throw new Error(message);
    }
    const json = await resp.json();
    if (!Array.isArray(json?.data)) {
      throw new Error('The product catalog returned an unexpected response.');
    }
    return json.data;
  },
};

/**
 * Standalone export of the public product-registry fetch, so callers can import
 * it either as `settingApi.getPublicProducts` or as a named function.
 */
export const getPublicProducts = () => settingApi.getPublicProducts();

export default settingApi;
