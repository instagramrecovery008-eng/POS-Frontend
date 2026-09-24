import React, { useState, useEffect, useCallback } from 'react';
import { superAdminApi } from '../../../api/superAdmin.api';
import { FileText, Search, Eye, ChevronLeft, ChevronRight, Calendar, Building2, CreditCard, Loader2, RefreshCw, X } from 'lucide-react';

const STATUS_BADGE = {
  PAID: 'bg-green-50 text-green-600 border-green-200',
  FAILED: 'bg-red-50 text-red-600 border-red-200',
  CREATED: 'bg-amber-50 text-amber-600 border-amber-200',
  REFUNDED: 'bg-slate-50 text-slate-500 border-slate-200',
};

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

/** Invoice number derived from the real payment record (stable + unique). */
const invoiceNo = (p) => {
  const year = p.createdAt ? new Date(p.createdAt).getFullYear() : new Date().getFullYear();
  return `INV-${year}-${String(p.id || 0).padStart(4, '0')}`;
};

/** Details modal — every value comes from the backend payment record. */
function InvoiceDetails({ payment, onClose }) {
  const rows = [
    { label: 'Invoice No', value: invoiceNo(payment) },
    { label: 'Restaurant', value: payment.restaurantName || '—' },
    { label: 'Plan', value: payment.planName || payment.planCode || '—' },
    { label: 'Action', value: payment.action || '—' },
    { label: 'Billing Cycle', value: payment.billingCycle || '—' },
    { label: 'Amount', value: `₹${Number(payment.amount || 0).toLocaleString('en-IN')}` },
    { label: 'Status', value: payment.status || '—' },
    { label: 'Payment Method', value: payment.paymentMethod || '—' },
    { label: 'Order ID', value: payment.razorpayOrderId || '—' },
    { label: 'Payment ID', value: payment.razorpayPaymentId || '—' },
    { label: 'Reference', value: payment.reference || '—' },
    { label: 'Paid At', value: payment.paidAt ? fmtDate(payment.paidAt) : '—' },
    { label: 'Created At', value: payment.createdAt ? fmtDate(payment.createdAt) : '—' },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="text-sm font-extrabold text-slate-800">Invoice Details</h3>
            <p className="text-[10px] text-slate-400 mt-0.5">{invoiceNo(payment)}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto space-y-2.5">
          {rows.map((r) => (
            <div key={r.label} className="flex items-start justify-between gap-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0 pt-0.5">{r.label}</span>
              <span className="text-xs font-bold text-slate-700 text-right break-all">{r.value}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-end px-5 py-4 border-t border-slate-100 shrink-0">
          <button onClick={onClose} className="h-10 px-5 bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-bold rounded-xl cursor-pointer">Close</button>
        </div>
      </div>
    </div>
  );
}

export default function Invoices() {
  const [payments, setPayments] = useState({ payments: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [viewPayment, setViewPayment] = useState(null);
  const pageSize = 15;

  const load = useCallback(async (pageNum, q, status) => {
    try {
      setLoading(true);
      setError('');
      const resp = await superAdminApi.listPayments({
        limit: pageSize,
        page: pageNum,
        search: q || undefined,
        status: status || undefined,
      });
      if (resp.success) {
        setPayments({ payments: resp.data.payments || [], total: resp.data.total || 0 });
        setPagination(resp.data.pagination || null);
      }
    } catch (e) {
      setError(e.message || 'Failed to load invoices');
      setPayments({ payments: [], total: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(1, '', ''); }, [load]);

  const paid = payments.payments.filter((p) => p.status === 'PAID');
  const totalRevenue = paid.reduce((s, p) => s + Number(p.amount || 0), 0);

  const handleSearch = (value) => {
    setSearch(value);
    setPage(1);
    load(1, value, statusFilter);
  };
  const handleStatus = (value) => {
    setStatusFilter(value);
    setPage(1);
    load(1, search, value);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800">Invoices</h1>
          <p className="text-xs text-slate-500 mt-1">Real subscription payment records — one row per payment</p>
        </div>
        <button onClick={() => load(page, search, statusFilter)} className="h-9 w-9 flex items-center justify-center bg-white border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer" aria-label="Refresh invoices">
          <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input value={search} onChange={(e) => handleSearch(e.target.value)} placeholder="Search restaurant / plan / ref..." className="w-full h-9 pl-9 pr-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-[#16A34A]" />
        </div>
        <select value={statusFilter} onChange={(e) => handleStatus(e.target.value)} className="h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none">
          <option value="">All Status</option>
          <option value="PAID">Paid</option>
          <option value="CREATED">Pending</option>
          <option value="FAILED">Failed</option>
        </select>
      </div>

      {/* Summary Cards — computed from the backend records */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <p className="text-[10px] font-bold text-slate-500 uppercase">Total Records</p>
          <p className="text-lg font-extrabold text-slate-800 mt-1">{pagination?.total ?? payments.total ?? 0}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <p className="text-[10px] font-bold text-slate-500 uppercase">Paid (this page)</p>
          <p className="text-lg font-extrabold text-green-600 mt-1">{paid.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <p className="text-[10px] font-bold text-slate-500 uppercase">Revenue (this page)</p>
          <p className="text-lg font-extrabold text-slate-800 mt-1">₹{totalRevenue.toLocaleString('en-IN')}</p>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-[#16A34A]" /></div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-xs font-bold text-red-500">{error}</p>
            <button onClick={() => load(page, search, statusFilter)} className="mt-3 h-9 px-4 bg-[#16A34A] text-white rounded-xl text-xs font-bold cursor-pointer">Retry</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left font-extrabold text-slate-600 uppercase py-3 px-4">Invoice</th>
                  <th className="text-left font-extrabold text-slate-600 uppercase py-3 px-4">Restaurant</th>
                  <th className="text-left font-extrabold text-slate-600 uppercase py-3 px-4">Plan</th>
                  <th className="text-left font-extrabold text-slate-600 uppercase py-3 px-4">Amount</th>
                  <th className="text-left font-extrabold text-slate-600 uppercase py-3 px-4">Status</th>
                  <th className="text-left font-extrabold text-slate-600 uppercase py-3 px-4">Date</th>
                  <th className="text-right font-extrabold text-slate-600 uppercase py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.payments.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-slate-400">No invoices found</td></tr>
                ) : payments.payments.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-bold text-slate-700">{invoiceNo(p)}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-semibold text-slate-600">{p.restaurantName || '—'}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{p.planName || p.planCode || '—'}</span>
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-700">₹{Number(p.amount || 0).toLocaleString('en-IN')}</td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${STATUS_BADGE[p.status] || 'bg-slate-50 text-slate-500 border-slate-200'}`}>{p.status}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 text-[10px]">{fmtDate(p.createdAt)}</td>
                    <td className="py-3 px-4 text-right">
                      <button onClick={() => setViewPayment(p)} className="p-1.5 hover:bg-slate-100 rounded-lg cursor-pointer" title="View details">
                        <Eye className="w-3.5 h-3.5 text-slate-400" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <span className="text-[10px] text-slate-400">Page {pagination.page} of {pagination.totalPages}</span>
            <div className="flex gap-1">
              <button onClick={() => { setPage((p) => Math.max(1, p - 1)); load(Math.max(1, page - 1), search, statusFilter); }} disabled={page <= 1} className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 cursor-pointer"><ChevronLeft className="w-3.5 h-3.5" /></button>
              <button onClick={() => { setPage((p) => Math.min(pagination.totalPages, p + 1)); load(Math.min(pagination.totalPages, page + 1), search, statusFilter); }} disabled={page >= pagination.totalPages} className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 cursor-pointer"><ChevronRight className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        )}
      </div>

      {viewPayment && <InvoiceDetails payment={viewPayment} onClose={() => setViewPayment(null)} />}
    </div>
  );
}
