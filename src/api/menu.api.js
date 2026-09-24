import apiClient from './axios';

export const menuApi = {
  getAll: (params) => apiClient.get('/menu', { params }),
  getById: (id) => apiClient.get(`/menu/${id}`),
  create: (data) => apiClient.post('/menu', data),
  update: (id, data) => apiClient.put(`/menu/${id}`, data),
  delete: (id) => apiClient.delete(`/menu/${id}`),
  duplicate: (id) => apiClient.post(`/menu/${id}/duplicate`),
  toggleAvailability: (id, isAvailable) => apiClient.patch(`/menu/${id}/status`, { isAvailable }),
  /** Upload a menu item image (multipart, field name: image) → { imageUrl, imagePublicId } */
  uploadImage: (formData) => apiClient.post('/menu/image', formData),
  /** Delete an unbound uploaded image by its publicId */
  deleteImage: (imagePublicId) => apiClient.delete('/menu/image', { data: { imagePublicId } }),
  // ─── Barcode scanner lookup (Part 11) — tenant-scoped, plan-gated server-side ───
  getByBarcode: (barcode) => apiClient.get(`/menu/barcode/${encodeURIComponent(barcode)}`),
  // ─── Subcategories (Category → Subcategory → Item) ───
  getSubcategories: (categoryId) =>
    apiClient.get('/menu/subcategories', { params: categoryId ? { categoryId } : {} }),
  createSubcategory: (data) => apiClient.post('/menu/subcategories', data),
  updateSubcategory: (id, data) => apiClient.put(`/menu/subcategories/${id}`, data),
  /** Delete a subcategory. move: { moveToSubcategoryId: <id> } or { moveToSubcategoryId: 'none' } */
  deleteSubcategory: (id, moveToSubcategoryId) =>
    apiClient.delete(`/menu/subcategories/${id}`, {
      params: moveToSubcategoryId !== undefined ? { moveToSubcategoryId } : {},
    }),
};

export default menuApi;
