import React, { useState, useEffect } from 'react';
import { superAdminApi } from '../../../api/superAdmin.api';
import { BarChart3, Loader2, RefreshCw, TrendingUp, Users, Building2, AlertTriangle, Calendar } from 'lucide-react';

const REPORT_TYPES = [
  { id: 'restaurant_growth', label: 'Restaurant Growth', icon: TrendingUp },
  { id: 'subscription_revenue', label: 'Subscription Revenue', icon: BarChart3 },
  { id: 'user_growth', label: 'User Growth', icon: Users },
  { id: 'expired_plans', label: 'Expired Plans', icon: AlertTriangle },
  { id: 'upcoming_renewals', label: 'Upcoming Renewals', icon: Calendar },
  { id: 'restaurant_activity', label: 'Restaurant Activity', icon: Building2 },
];

export default function PlatformReports() {
  const [activeType, setActiveType] = useState('restaurant_growth');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadReport();
  }, [activeType]);

  const loadReport = async () => {
    try {
      setLoading(true);
      const resp = await superAdminApi.getReports({ type: activeType });
      if (resp.success) setData(resp.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const renderReportContent = () => {
    if (loading) {
      return <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-[#16A34A]" /></div>;
    }
    if (!data) {
      return <div className="text-center py-16 text-slate-400">No data available</div>;
    }

    if (activeType === 'restaurant_growth' || activeType === 'user_growth') {
      const items = Array.isArray(data) ? data : [];
      return (
        <div className="space-y-2">
          {items.length === 0 ? (
            <p className="text-center py-8 text-slate-400">No data for this period</p>
          ) : items.map((item, i) => (
            <div key={i} className="flex items-center gap-3 py-1.5">
              <span className="text-xs font-bold text-slate-500 w-24">{item.label}</span>
              <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#16A34A] to-[#22C55E] rounded-full transition-all" 
                  style={{ width: `${Math.min((item.count || item.newRestaurants || item.newUsers || 0) / Math.max(...items.map(i => i.count || i.newRestaurants || i.newUsers || 0), 1) * 100, 100)}%` }} />
              </div>
              <span className="text-xs font-bold text-slate-600 w-8 text-right">{item.count || item.newRestaurants || item.newUsers || 0}</span>
            </div>
          ))}
        </div>
      );
    }

    if (activeType === 'subscription_revenue') {
      return (
        <div className="space-y-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Total Revenue</p>
            <p className="text-2xl font-extrabold text-emerald-700 mt-1">₹{data.totalRevenue?.toLocaleString() || 0}</p>
            <p className="text-xs text-emerald-500 mt-1">{data.count || 0} paid subscriptions</p>
          </div>
          {data.subscriptions?.map((s, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-xs font-semibold text-slate-600">{s.restaurant?.name}</span>
              <span className="text-xs font-bold text-slate-700">₹{s.amount}</span>
            </div>
          ))}
        </div>
      );
    }

    if (activeType === 'expired_plans' || activeType === 'upcoming_renewals') {
      const items = data.subscriptions || [];
      return (
        <div className="space-y-2">
          {items.length === 0 ? (
            <p className="text-center py-8 text-slate-400">No {activeType === 'expired_plans' ? 'expired' : 'upcoming'} subscriptions</p>
          ) : items.map((s, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100">
              <div>
                <p className="text-xs font-bold text-slate-700">{s.restaurant?.name}</p>
                <p className="text-[10px] text-slate-400">{s.restaurant?.email}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-500">{s.plan}</p>
                <p className="text-[10px] font-bold text-red-500">{s.expiryDate ? new Date(s.expiryDate).toLocaleDateString() : '—'}</p>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (activeType === 'restaurant_activity') {
      // Platform activity only — account lifecycle signals (last ADMIN login,
      // status, plan, subscription), never tenant operational order counts.
      const renderActivityList = (items, highlight) => (
        <div className="space-y-1">
          {items?.length === 0 && <p className="text-xs text-slate-400 py-2 text-center">No data</p>}
          {items?.map((r, i) => (
            <div key={i} className="py-2 border-b border-slate-50 last:border-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700">{r.name}</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">{r.plan || '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-1">
                <span className="text-[10px] text-slate-400">
                  {r.lastLogin ? `Last login: ${new Date(r.lastLogin).toLocaleString()}` : 'Never logged in'}
                </span>
                <span className={`text-[10px] font-bold shrink-0 ${highlight}`}>
                  {r.subscriptionStatus || r.status || '—'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Created {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}
                {r.expiryDate ? ` · Renews ${new Date(r.expiryDate).toLocaleDateString()}` : ''}
              </p>
            </div>
          ))}
        </div>
      );
      return (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="text-xs font-bold text-slate-600 mb-2">Recently Active</h4>
            {renderActivityList(data.recentlyActive, 'text-green-600')}
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-600 mb-2">Least Active</h4>
            {renderActivityList(data.leastActive, 'text-red-500')}
          </div>
        </div>
      );
    }

    return <pre className="text-xs text-slate-500">{JSON.stringify(data, null, 2)}</pre>;
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800">Platform Reports</h1>
          <p className="text-xs text-slate-500 mt-1">Analytics and insights across all restaurants</p>
        </div>
        <button onClick={loadReport} className="h-9 px-4 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Report type selector */}
      <div className="flex flex-wrap gap-2">
        {REPORT_TYPES.map(rt => (
          <button
            key={rt.id}
            onClick={() => setActiveType(rt.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeType === rt.id
                ? 'bg-[#16A34A] text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-[#16A34A]'
            }`}
          >
            <rt.icon className="w-3.5 h-3.5" />
            {rt.label}
          </button>
        ))}
      </div>

      {/* Report content */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        {renderReportContent()}
      </div>
    </div>
  );
}
