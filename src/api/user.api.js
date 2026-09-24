import apiClient from './axios';

export const userApi = {
  getAll: () => apiClient.get('/users'),
  // Waiter directory for the Take Order wizard (any order-placing role may call it)
  getWaiters: () => apiClient.get('/users/waiters'),
  getById: (id) => apiClient.get(`/users/${id}`),
  create: (data) => apiClient.post('/users', data),
  update: (id, data) => apiClient.put(`/users/${id}`, data),
  delete: (id) => apiClient.delete(`/users/${id}`),
  changeStatus: (id, isActive) =>
    apiClient.patch(`/users/${id}/status`, { isActive }),
  changePassword: (id, newPassword) =>
    apiClient.patch(`/users/${id}/password`, { newPassword }),
  // ─── Per-staff permissions (screen access + action permissions + dietary) ───
  getPermissions: (id) => apiClient.get(`/users/${id}/permissions`),
  updatePermissions: (id, data) => apiClient.put(`/users/${id}/permissions`, data),
  resetPermissions: (id) => apiClient.delete(`/users/${id}/permissions`),
  /** The logged-in user's own effective permissions (sidebar/route gating). */
  getMyPermissions: () => apiClient.get('/users/me/permissions'),
  // ─── Per-staff floor assignment (many-to-many) + Takeaway grant ───
  getFloorAssignments: (id) => apiClient.get(`/users/${id}/floors`),
  // `orderTypes` (optional array): ['TAKEAWAY'] grants Takeaway; [] revokes it.
  // Dine In is default for all staff and is never sent. Omitting the argument
  // leaves the existing grant untouched.
  updateFloorAssignments: (id, floorIds, orderTypes) =>
    apiClient.put(
      `/users/${id}/floors`,
      Array.isArray(orderTypes) ? { floorIds, assignedOrderTypes: orderTypes } : { floorIds }
    ),
  /** Floors visible to the current user (restricted staff see only theirs). */
  getMyFloors: () => apiClient.get('/users/me/floors'),
};

export default userApi;
