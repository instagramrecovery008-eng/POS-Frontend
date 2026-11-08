import React, { useState, useEffect, useRef } from 'react';
import { User, Search, X, UserPlus, Loader2 } from 'lucide-react';
import { customerApi } from '../../../../api/customer.api';

/**
 * Customer selector for the POS cart.
 * - Searches the company's own customers on the server (debounced, capped list).
 * - A selected customer is returned to the parent, which sends its id with the
 *   order — so the payment screen shows the real customer.
 * - Nothing selected = Walk-in Customer (the backend's fallback).
 */
export default function CustomerPicker({ customer, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const boxRef = useRef(null);

  // Debounced server-side search (cap 20) — no full customer download.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: '20' });
        if (query.trim()) params.set('q', query.trim());
        const resp = await customerApi.search(params.toString());
        if (!cancelled) {
          const rows = Array.isArray(resp?.data) ? resp.data : [];
          setResults(rows.filter((c) => c.type !== 'WALK_IN'));
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const choose = (c) => { onChange(c); setOpen(false); setQuery(''); setError(''); };

  const createFromQuery = async () => {
    const text = query.trim();
    if (!text || creating) return;
    const isPhone = /^[0-9+()\-\s]{4,20}$/.test(text);
    setCreating(true);
    setError('');
    try {
      const resp = await customerApi.create(isPhone ? { name: `Customer ${text}`, phone: text } : { name: text });
      if (resp?.success && resp.data) choose(resp.data);
      else setError(resp?.message || 'Could not create customer');
    } catch (e) {
      setError(e?.response?.data?.message || e.message || 'Could not create customer');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-left cursor-pointer hover:border-[#16A34A]/50 transition-colors"
      >
        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold text-slate-700 truncate">
            {customer ? customer.name : 'Walk-in Customer'}
          </span>
          {customer?.phone && <span className="block text-[9px] text-slate-400 font-semibold truncate">{customer.phone}</span>}
        </span>
        {customer && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Remove customer"
            onClick={(e) => { e.stopPropagation(); onChange(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onChange(null); } }}
            className="p-0.5 text-slate-400 hover:text-red-500"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg p-2 space-y-1.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or phone…"
              className="w-full pl-8 h-9 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            <button
              type="button"
              onClick={() => choose(null)}
              className="w-full text-left px-2 py-1.5 rounded-lg text-[11px] font-bold text-slate-500 hover:bg-slate-50 cursor-pointer"
            >
              Walk-in Customer
            </button>
            {loading && <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin text-slate-400" /></div>}
            {!loading && results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => choose(c)}
                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-emerald-50 cursor-pointer"
              >
                <span className="block text-[11px] font-bold text-slate-700 truncate">{c.name}</span>
                {c.phone && <span className="block text-[9px] text-slate-400 font-semibold">{c.phone}</span>}
              </button>
            ))}
            {!loading && results.length === 0 && query.trim() && (
              <p className="px-2 py-1.5 text-[10px] text-slate-400 font-semibold">No customer found</p>
            )}
          </div>
          {query.trim() && (
            <button
              type="button"
              onClick={createFromQuery}
              disabled={creating}
              className="w-full flex items-center justify-center gap-1.5 h-8 rounded-lg bg-[#16A34A] hover:bg-[#15803D] disabled:bg-slate-300 text-white text-[10px] font-extrabold uppercase tracking-wider cursor-pointer"
            >
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
              Add "{query.trim()}"
            </button>
          )}
          {error && <p className="text-[10px] font-semibold text-red-600 px-1">{error}</p>}
        </div>
      )}
    </div>
  );
}
