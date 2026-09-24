import React, { useState, useEffect } from 'react';
import { superAdminApi } from '../../../api/superAdmin.api';
import { ClipboardList, Loader2, RefreshCw, Search, ChevronLeft, ChevronRight, Filter } from 'lucide-react';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [moduleFilter, setModuleFilter] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const params = { page, limit: 25, module: moduleFilter || undefined };
      const resp = await superAdminApi.getAuditLogs(params);
      if (resp.success) {
        setLogs(resp.data.logs || []);
        setPagination(resp.data.pagination);
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page, moduleFilter]);

  const getActionColor = (action) => {
    const map = { CREATE: 'bg-green-50 text-green-600', UPDATE: 'bg-blue-50 text-blue-600', DELETE: 'bg-red-50 text-red-600', LOGIN: 'bg-purple-50 text-purple-600', LOGOUT: 'bg-slate-50 text-slate-500', PAYMENT: 'bg-emerald-50 text-emerald-600', CANCEL: 'bg-amber-50 text-amber-600' };
    return map[action] || 'bg-slate-50 text-slate-500';
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800">Audit Logs</h1>
          <p className="text-xs text-slate-500 mt-1">Track all activities across the platform</p>
        </div>
        <button onClick={load} className="h-9 w-9 flex items-center justify-center bg-white border border-slate-200 rounded-xl hover:bg-slate-50"><RefreshCw className="w-3.5 h-3.5 text-slate-500" /></button>
      </div>

      <div className="flex gap-2">
        <select value={moduleFilter} onChange={e => { setModuleFilter(e.target.value); setPage(1); }} className="h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none">
          <option value="">All Modules</option>
          <option value="AUTH">Auth</option>
          <option value="USER">User</option>
          <option value="SUBSCRIPTION">Subscription</option>
          <option value="PAYMENT">Payment</option>
          <option value="SETTINGS">Settings</option>
        </select>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left font-extrabold text-slate-600 uppercase py-3 px-4">Timestamp</th>
                <th className="text-left font-extrabold text-slate-600 uppercase py-3 px-4">User</th>
                <th className="text-left font-extrabold text-slate-600 uppercase py-3 px-4">Module</th>
                <th className="text-left font-extrabold text-slate-600 uppercase py-3 px-4">Action</th>
                <th className="text-left font-extrabold text-slate-600 uppercase py-3 px-4">Description</th>
                <th className="text-left font-extrabold text-slate-600 uppercase py-3 px-4">Restaurant</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#16A34A] mx-auto" /></td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">No audit logs found</td></tr>
              ) : logs.map(log => (
                <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="py-2.5 px-4 text-[10px] text-slate-500 whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                  <td className="py-2.5 px-4">
                    <span className="font-semibold text-slate-600">{log.user?.name || 'System'}</span>
                    <span className="text-[10px] text-slate-400 ml-1">({log.user?.role || '—'})</span>
                  </td>
                  <td className="py-2.5 px-4"><span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{log.module}</span></td>
                  <td className="py-2.5 px-4"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${getActionColor(log.action)}`}>{log.action}</span></td>
                  <td className="py-2.5 px-4 text-slate-500 max-w-xs truncate">{log.description}</td>
                  <td className="py-2.5 px-4 text-slate-400 text-[10px]">{log.restaurant?.name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagination?.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <span className="text-[10px] text-slate-400">Page {pagination.page} of {pagination.totalPages}</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page <= 1} className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 cursor-pointer"><ChevronLeft className="w-3.5 h-3.5" /></button>
              <button onClick={() => setPage(p => p+1)} disabled={page >= pagination.totalPages} className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 cursor-pointer"><ChevronRight className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
