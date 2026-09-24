import React, { useState, useEffect } from 'react';
import { superAdminApi } from '../../../api/superAdmin.api';
import { Bell, Loader2, RefreshCw, ChevronLeft, ChevronRight, Info, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const resp = await superAdminApi.getNotifications({ page, limit: 20 });
      if (resp.success) {
        setNotifications(resp.data.notifications || []);
        setPagination(resp.data.pagination);
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page]);

  const getIcon = (type) => {
    const map = { INFO: Info, SUCCESS: CheckCircle2, WARNING: AlertTriangle, ERROR: AlertCircle, ORDER: Bell, KITCHEN: Bell, PAYMENT: Bell, SUBSCRIPTION: Bell, SYSTEM: AlertCircle };
    return map[type] || Bell;
  };

  const getColor = (type) => {
    const map = { INFO: 'text-blue-500 bg-blue-50 border-blue-200', SUCCESS: 'text-green-600 bg-green-50 border-green-200', WARNING: 'text-amber-500 bg-amber-50 border-amber-200', ERROR: 'text-red-500 bg-red-50 border-red-200', SYSTEM: 'text-purple-500 bg-purple-50 border-purple-200' };
    return map[type] || 'text-slate-500 bg-slate-50 border-slate-200';
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800">Notifications</h1>
          <p className="text-xs text-slate-500 mt-1">Platform notifications only — restaurant operational events stay inside each restaurant</p>
        </div>
        <button onClick={load} className="h-9 w-9 flex items-center justify-center bg-white border border-slate-200 rounded-xl hover:bg-slate-50"><RefreshCw className="w-3.5 h-3.5 text-slate-500" /></button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {loading ? (
          <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-[#16A34A] mx-auto" /></div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Bell className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">No notifications</p>
          </div>
        ) : notifications.map(n => {
          const Icon = getIcon(n.type);
          return (
            <div key={n.id} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-all">
              <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${getColor(n.type)}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-700">{n.title}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{n.message}</p>
                <div className="flex items-center gap-2 mt-1">
                  {n.restaurant?.name && <span className="text-[10px] font-semibold text-slate-400">{n.restaurant.name}</span>}
                  <span className="text-[10px] text-slate-400">{new Date(n.createdAt).toLocaleString()}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {pagination?.totalPages > 1 && (
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-slate-400">Page {pagination.page} of {pagination.totalPages}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page <= 1} className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30"><ChevronLeft className="w-3.5 h-3.5" /></button>
            <button onClick={() => setPage(p => p+1)} disabled={page >= pagination.totalPages} className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30"><ChevronRight className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
