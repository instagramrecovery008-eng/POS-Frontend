import React, { useEffect, useState, useCallback } from 'react';
import {
  Package, Plus, Pencil, Power, Trash2, Search, X, Loader2, ExternalLink,
  Gauge, ImageOff, RefreshCw, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { superAdminApi } from '../../../api/superAdmin.api';
import { COMPANY } from '../../../config/company';

// URL must resolve and be http(s) — mirrors the backend's own validation.
const isValidUrl = (value) => {
  const v = String(value || '').trim();
  if (!v) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

const EMPTY_FORM = {
  name: '',
  slug: '',
  description: '',
  category: '',
  url: '',
  logo: '',
  isActive: true,
  sortOrder: 0,
};

/** Small inline error banner shared by list + form surfaces. */
function ErrorBanner({ message, onClose, onRetry }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5">
      <p className="flex-1 text-[11px] font-semibold leading-relaxed text-red-700">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-red-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-red-600 transition-colors hover:bg-red-100 cursor-pointer"
        >
          <RefreshCw className="h-3 w-3" /> Retry
        </button>
      )}
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Dismiss error" className="text-red-400 hover:text-red-600 cursor-pointer">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** Success confirmation (create / update / activation / deletion). */
function SuccessBanner({ message, onClose }) {
  if (!message) return null;
  return (
    <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      <p className="flex-1 text-[11px] font-semibold leading-relaxed text-emerald-700">{message}</p>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Dismiss confirmation" className="text-emerald-500 hover:text-emerald-700 cursor-pointer">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** Loading placeholder that mirrors the table layout (no layout jump). */
function ProductsSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-busy="true" aria-label="Loading products">
      <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-3">
        <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 border-b border-slate-50 px-4 py-3 last:border-0">
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-slate-200" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 animate-pulse rounded bg-slate-200" />
            <div className="h-2.5 w-1/2 animate-pulse rounded bg-slate-100" />
          </div>
          <div className="h-6 w-16 animate-pulse rounded-full bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

/** Product logo with graceful fallback (initial letter) — never a broken image glyph. */
function ProductLogo({ logo, name, size = 'h-10 w-10' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [logo]);
  if (logo && !failed) {
    return (
      <span className={`flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-1`}>
        <img
          src={logo}
          alt={`${name} logo`}
          className="max-h-full max-w-full object-contain"
          onError={() => setFailed(true)}
          referrerPolicy="no-referrer"
        />
      </span>
    );
  }
  return (
    <span className={`flex ${size} shrink-0 items-center justify-center rounded-xl bg-[#16A34A]/10 text-sm font-extrabold text-[#15803D]`}>
      {(name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}

export default function ProductsManagement() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // product row | null (= create)
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  const [busyId, setBusyId] = useState(null); // status-toggle/delete in flight
  const [confirmDelete, setConfirmDelete] = useState(null); // product row awaiting confirmation
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const resp = await superAdminApi.getProducts();
      // GET /super-admin/products → { success, message, data: [...] }.
      setProducts(Array.isArray(resp?.data) ? resp.data : Array.isArray(resp) ? resp : []);
    } catch (e) {
      setLoadError(e.message || 'Failed to load products.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Success confirmations auto-dismiss so the page never accumulates banners.
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const slugify = (value) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setModalError('');
    setModalOpen(true);
  };

  const openEdit = (product) => {
    setEditing(product);
    setForm({
      name: product.name || '',
      slug: product.slug || '',
      description: product.description || '',
      category: product.category || '',
      url: product.url || '',
      logo: product.logo || '',
      isActive: product.isActive !== false,
      sortOrder: product.sortOrder ?? 0,
    });
    setFieldErrors({});
    setModalError('');
    setModalOpen(true);
  };

  const validateForm = () => {
    const errs = {};
    const name = form.name.trim();
    const slug = (form.slug.trim() || slugify(name));
    if (name.length < 2) errs.name = 'Product name must be at least 2 characters.';
    if (!slug) errs.slug = 'Slug is required.';
    else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) errs.slug = 'Lowercase letters, numbers and dashes only.';
    if (form.url.trim() && !isValidUrl(form.url)) errs.url = 'Enter a valid http(s) URL.';
    if (form.logo.trim()) {
      const l = form.logo.trim();
      const ok = l.startsWith('/') || isValidUrl(l);
      if (!ok) errs.logo = 'Use an asset path (/…) or a valid http(s) URL.';
    }
    if (typeof form.sortOrder !== 'number' || form.sortOrder < 0) errs.sortOrder = 'Display order must be 0 or more.';
    setFieldErrors(errs);
    return { ok: Object.keys(errs).length === 0, slug };
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving) return;
    const { ok, slug } = validateForm();
    if (!ok) return;
    setSaving(true);
    setModalError('');
    const payload = {
      name: form.name.trim(),
      slug,
      description: form.description.trim() || null,
      category: form.category.trim() || null,
      url: form.url.trim() || null,
      logo: form.logo.trim() || null,
      isActive: form.isActive,
      sortOrder: form.sortOrder,
    };
    try {
      if (editing) {
        const resp = await superAdminApi.updateProduct(editing.id, payload);
        setNotice(resp?.message || `“${payload.name}” updated.`);
      } else {
        const resp = await superAdminApi.createProduct(payload);
        setNotice(resp?.message || `“${payload.name}” created.`);
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setModalError(err.message || 'Failed to save the product.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (product) => {
    setBusyId(product.id);
    setNotice('');
    try {
      const resp = await superAdminApi.toggleProductStatus(product.id);
      setNotice(resp?.message || `${product.name} updated.`);
      await load();
    } catch (err) {
      setLoadError(err.message || 'Failed to change the product status.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleteBusy(true);
    const name = confirmDelete.name;
    try {
      const resp = await superAdminApi.deleteProduct(confirmDelete.id);
      setNotice(resp?.message || `“${name}” deleted.`);
      setConfirmDelete(null);
      await load();
    } catch (err) {
      setLoadError(err.message || 'Failed to delete the product.');
      setConfirmDelete(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  const filtered = products.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [p.name, p.slug, p.category, p.description].some((v) => String(v || '').toLowerCase().includes(q));
  });

  const inputCls = (field) => `h-10 w-full rounded-xl border bg-slate-50 px-3 text-sm text-slate-800 outline-none transition-all focus:border-[#16A34A] focus:bg-white focus:ring-2 focus:ring-[#16A34A]/20 ${fieldErrors[field] ? 'border-red-300 bg-red-50' : 'border-slate-200'}`;

  const updatedLabel = (p) => {
    if (!p.updatedAt) return '—';
    const d = new Date(p.updatedAt);
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="flex-1 space-y-5 overflow-y-auto p-4 md:p-6">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-extrabold text-slate-800">
            <Package className="h-5 w-5 text-[#16A34A]" />
            Products Management
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            {COMPANY.name}'s product catalog — shown on the login page's “Our Products” section.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            aria-label="Refresh products"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:text-[#16A34A] cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="flex h-10 items-center gap-2 rounded-xl bg-[#16A34A] px-4 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition-all hover:bg-[#15803D] cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Add New Product
          </button>
        </div>
      </div>

      <SuccessBanner message={notice} onClose={() => setNotice('')} />
      <ErrorBanner message={loadError} onClose={() => setLoadError('')} onRetry={load} />

      {/* ── Search ── */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products…"
          aria-label="Search products"
          className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/20"
        />
      </div>

      {/* ── Product list ── */}
      {loading ? (
        <ProductsSkeleton />
      ) : loadError && products.length === 0 ? (
        // Distinct ERROR state — never disguised as "no products yet".
        <div className="rounded-2xl border border-red-200 bg-red-50/60 p-10 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-red-400" />
          <p className="mt-3 text-sm font-semibold text-red-700">Failed to load products</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-red-600/80">{loadError}</p>
          <button
            type="button"
            onClick={load}
            className="mx-auto mt-4 flex h-10 items-center gap-2 rounded-xl bg-[#16A34A] px-4 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition-all hover:bg-[#15803D] cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <Package className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-500">
            {products.length === 0 ? 'No products yet.' : 'No products match your search.'}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {products.length === 0
              ? 'Add the company’s real products with verified URLs — nothing is pre-seeded or invented.'
              : 'Try a different name, slug or category.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">URL</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <ProductLogo logo={p.logo} name={p.name} />
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 font-bold text-slate-800">
                            <span className="truncate">{p.name}</span>
                            {p.isCurrent && (
                              <span className="shrink-0 rounded-full bg-[#16A34A]/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#15803D]">
                                Current
                              </span>
                            )}
                          </p>
                          <p className="truncate text-[11px] text-slate-400">
                            {p.description || p.slug}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-600">{p.category || '—'}</td>
                    <td className="max-w-[220px] px-4 py-3">
                      {p.url ? (
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex max-w-full items-center gap-1 truncate text-xs font-semibold text-[#15803D] hover:underline"
                        >
                          <span className="truncate">{p.url}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                          p.isActive
                            ? 'bg-[#16A34A]/10 text-[#15803D]'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${p.isActive ? 'bg-[#16A34A]' : 'bg-slate-400'}`} />
                        {p.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{updatedLabel(p)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          aria-label={`Edit ${p.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#16A34A] cursor-pointer"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggle(p)}
                          disabled={busyId === p.id || p.isCurrent}
                          title={p.isCurrent ? 'The current product stays active' : p.isActive ? 'Deactivate' : 'Activate'}
                          aria-label={`${p.isActive ? 'Deactivate' : 'Activate'} ${p.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-amber-600 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                        >
                          {busyId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(p)}
                          disabled={p.isCurrent}
                          title={p.isCurrent ? 'The current product cannot be deleted' : 'Delete'}
                          aria-label={`Delete ${p.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Add / Edit modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={editing ? `Edit ${editing.name}` : 'Add new product'}>
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => !saving && setModalOpen(false)} aria-hidden="true" />
          <form
            onSubmit={handleSave}
            className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            noValidate
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-800">
                <Package className="h-4 w-4 text-[#16A34A]" />
                {editing ? `Edit ${editing.name}` : 'Add New Product'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={saving}
                aria-label="Close"
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <ErrorBanner message={modalError} />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="product-name" className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Product name *</label>
                  <input
                    id="product-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. KlarGo POS"
                    className={inputCls('name')}
                  />
                  {fieldErrors.name && <p className="mt-1 text-[10px] font-semibold text-red-600">{fieldErrors.name}</p>}
                </div>
                <div>
                  <label htmlFor="product-slug" className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Slug / identifier *</label>
                  <input
                    id="product-slug"
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value })}
                    onBlur={() => { if (!form.slug.trim()) setForm((f) => ({ ...f, slug: slugify(f.name) })); }}
                    placeholder="klargo-pos"
                    autoCapitalize="off"
                    spellCheck={false}
                    className={inputCls('slug')}
                  />
                  {fieldErrors.slug && <p className="mt-1 text-[10px] font-semibold text-red-600">{fieldErrors.slug}</p>}
                </div>
              </div>

              <div>
                <label htmlFor="product-description" className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Short description</label>
                <textarea
                  id="product-description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  maxLength={300}
                  placeholder="One clear sentence about what this product does."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#16A34A] focus:bg-white focus:ring-2 focus:ring-[#16A34A]/20"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="product-category" className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Category</label>
                  <input
                    id="product-category"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    placeholder="POS / ERP / Support"
                    className={inputCls('category')}
                  />
                </div>
                <div>
                  <label htmlFor="product-sort" className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Display order</label>
                  <input
                    id="product-sort"
                    type="number"
                    min={0}
                    value={form.sortOrder}
                    onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                    className={inputCls('sortOrder')}
                  />
                  {fieldErrors.sortOrder && <p className="mt-1 text-[10px] font-semibold text-red-600">{fieldErrors.sortOrder}</p>}
                </div>
              </div>

              <div>
                <label htmlFor="product-url" className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Product URL</label>
                <input
                  id="product-url"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://…"
                  autoCapitalize="off"
                  spellCheck={false}
                  className={inputCls('url')}
                />
                {fieldErrors.url && <p className="mt-1 text-[10px] font-semibold text-red-600">{fieldErrors.url}</p>}
              </div>

              <div>
                <label htmlFor="product-logo" className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Logo (asset path or URL)
                </label>
                <input
                  id="product-logo"
                  value={form.logo}
                  onChange={(e) => setForm({ ...form, logo: e.target.value })}
                  placeholder="/uploads/logos/product.png or https://…"
                  autoCapitalize="off"
                  spellCheck={false}
                  className={inputCls('logo')}
                />
                <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
                  <ImageOff className="h-3 w-3" />
                  Missing logos fall back to the product's initial — the layout never breaks.
                </p>
                {fieldErrors.logo && <p className="mt-1 text-[10px] font-semibold text-red-600">{fieldErrors.logo}</p>}
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
                <div>
                  <p className="text-xs font-bold text-slate-700">Active</p>
                  <p className="text-[10px] text-slate-400">Inactive products never appear on the login page.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.isActive}
                  onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer ${form.isActive ? 'bg-[#16A34A]' : 'bg-slate-300'}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${form.isActive ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={saving}
                className="h-10 rounded-xl border border-slate-200 px-4 text-xs font-bold uppercase tracking-wider text-slate-600 transition-colors hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex h-10 items-center gap-2 rounded-xl bg-[#16A34A] px-5 text-xs font-bold uppercase tracking-wider text-white transition-all hover:bg-[#15803D] disabled:opacity-60 cursor-pointer"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? 'Save Changes' : 'Create Product'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Delete confirmation ── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Delete ${confirmDelete.name}`}>
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setConfirmDelete(null)} aria-hidden="true" />
          <div className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                <Gauge className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-extrabold text-slate-800">Delete “{confirmDelete.name}”?</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  This removes the product from the registry and the login page. This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="h-9 rounded-xl border border-slate-200 px-4 text-xs font-bold uppercase tracking-wider text-slate-600 transition-colors hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteBusy}
                className="flex h-9 items-center gap-2 rounded-xl bg-red-600 px-4 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-red-700 disabled:opacity-60 cursor-pointer"
              >
                {deleteBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
