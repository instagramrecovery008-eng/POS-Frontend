import axios from 'axios';
import API_BASE_URL from '../config/apiConfig';

// ─── Request Deduplication ──────────────────────────────────────────────────
// Prevents concurrent duplicate GET requests to the same endpoint.
// If an identical request is already in-flight, the duplicate is rejected
// at the interceptor level and returns a promise that resolves when the
// original request completes.
const pendingRequests = new Map();

function getRequestKey(config) {
  const params = config.params ? JSON.stringify(config.params) : '';
  // The auth token (i.e. the authenticated user/tenant) is part of the dedup
  // key. Two requests to the SAME url are only deduplicated when they carry
  // the SAME identity — otherwise an in-flight response from restaurant A
  // could be handed to restaurant B's identical request after a logout/login
  // switch on the same browser.
  const token = config.headers?.Authorization || '';
  return `${config.method}:${config.url}:${JSON.stringify(config.data || '')}:${params}:${token}`;
}

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── Request Interceptor ────────────────────────────────────────────────────
// Attach auth token and deduplicate concurrent GET requests.
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('pos_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Multipart uploads (FormData) must NOT keep the default application/json
    // content-type. axios 1.x would otherwise JSON-stringify the FormData
    // (e.g. {"image":{}}) before sending, so the backend's multer receives no
    // file and rejects the upload with "No file uploaded". Removing the header
    // lets the browser send multipart/form-data with the correct boundary.
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      if (config.headers && typeof config.headers.delete === 'function') {
        config.headers.delete('Content-Type');
      }
      delete config.headers['Content-Type'];
      delete config.headers['content-type'];
    }

    if (config.method === 'get' || config.method === 'GET') {
      const key = getRequestKey(config);
      const existing = pendingRequests.get(key);
      if (existing) {
        // Another request to the same endpoint is in-flight.
        // Return a rejected promise that the error interceptor will redirect
        // to return the existing promise (which resolves when the original completes).
        return Promise.reject({ __isDuplicate: true, promise: existing.promise });
      }

      // Create a controllable promise so we can resolve/reject it later
      // when the original request finishes.
      let resolvePromise, rejectPromise;
      const promise = new Promise((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
      });

      pendingRequests.set(key, { resolvePromise, rejectPromise, promise });
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response Interceptor ───────────────────────────────────────────────────
// Response: resolve any pending duplicate promises with the response data.
// Error: reject pending duplicates and propagate the error.
apiClient.interceptors.response.use(
  (response) => {
    if (response.config.method === 'get' || response.config.method === 'GET') {
      const key = getRequestKey(response.config);
      const pending = pendingRequests.get(key);
      if (pending) {
        // Resolve ALL waiters (original + duplicate callers) with transformed data
        pending.resolvePromise(response.data);
        pendingRequests.delete(key);
      }
    }
    return response.data;
  },
  (error) => {
    // ── Duplicate request redirect ────────────────────────────────────────
    if (error.__isDuplicate) {
      // This request was cancelled because another identical request is in-flight.
      // Return the existing promise, which will resolve/reject when the
      // original request completes.
      return error.promise;
    }

    // ── Cancelled requests (from AbortController) ─────────────────────────
    if (axios.isCancel(error)) {
      return new Promise(() => {}); // Never resolve — swallow silently
    }

    // ── Expired / invalid session (401) ────────────────────────────────────
    // A 401 on any NON-login endpoint means the stored token is expired,
    // invalid, or was invalidated server-side (e.g. password changed).
    // Clear the invalid session EXACTLY ONCE and let the app shell redirect
    // to Login. We never auto-retry a known-401 request, so an expired token
    // can never spin an infinite 401/retry loop. Failed /auth/login attempts
    // (wrong credentials) are handled by the LoginPage and excluded here.
    if (
      error.response?.status === 401 &&
      !String(error.config?.url || '').includes('/auth/login')
    ) {
      const hadToken = !!localStorage.getItem('pos_token');
      if (hadToken) {
        localStorage.removeItem('pos_token');
        localStorage.removeItem('pos_user');
        // Tell the app shell to log out + show the login screen.
        window.dispatchEvent(new CustomEvent('pos:session-expired'));
      }
    }

    // ── Error message extraction ──────────────────────────────────────────
    if (error.code === 'ECONNABORTED') {
      error.message = 'Request timed out. Please try again.';
    }

    let message = error.message || 'Something went wrong';
    if (error.response?.data) {
      const data = error.response.data;
      message = data?.message
        || data?.error
        || (data?.errors ? Object.values(data.errors).flat().join(', ') : null)
        || message;
    }
    const processedError = new Error(message);
    // Expose the HTTP status so callers can map 400/403/503 etc. to friendly UI
    processedError.status = error.response?.status;
    if (!error.response) processedError.status = 0; // network failure

    // ── Reject pending duplicates with the SAME processed error ───────────
    if (error.config) {
      const key = getRequestKey(error.config);
      const pending = pendingRequests.get(key);
      if (pending) {
        pending.rejectPromise(processedError);
        // The REAL error still reaches every caller through axios's own promise
        // chain (handled by each caller's catch). The dedup promise itself has
        // no consumer on the error path when the original caller is the only
        // awaiter — observe its rejection so the browser never logs a spurious
        // "Uncaught (in promise)" pageerror (e.g. expected 404 barcode misses).
        pending.promise.catch(() => {});
        pendingRequests.delete(key);
      }
    }

    return Promise.reject(processedError);
  }
);

export default apiClient;
