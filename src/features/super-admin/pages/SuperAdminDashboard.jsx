import React, { useState, useEffect, useMemo } from 'react';
import { superAdminApi } from '../../../api/superAdmin.api';
import {
  Building2,
  Users,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Plus,
  Loader2,
  Zap,
  Activity,
} from 'lucide-react';

const KPI_CARDS = [
  { key: 'totalRestaurants', label: 'Total Restaurants', icon: Building2, color: 'emerald', prefix: '' },
  { key: 'activeRestaurants', label: 'Active Restaurants', icon: CheckCircle2, color: 'green', prefix: '' },
  { key: 'trialRestaurants', label: 'Trial Restaurants', icon: Zap, color: 'blue', prefix: '' },
  // Platform KPIs only — tenant operational metrics (orders, POS revenue,
  // bills, KOTs…) are never shown to Super Admin.
  { key: 'expiredSubscriptions', label: 'Expired Subscriptions', icon: AlertTriangle, color: 'red', prefix: '' },
  { key: 'totalUsers', label: 'Platform Users', icon: Users, color: 'indigo', prefix: '' },
  { key: 'newRestaurantsThisMonth', label: 'New This Month', icon: Plus, color: 'purple', prefix: '' },
  { key: 'onlineRestaurants', label: 'Online Restaurants', icon: Activity, color: 'green', prefix: '' },
  { key: 'offlineRestaurants', label: 'Offline Restaurants', icon: XCircle, color: 'slate', prefix: '' },
];

const COLOR_MAP = {
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-600', icon: 'bg-emerald-100 text-emerald-600' },
  green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-600', icon: 'bg-green-100 text-green-600' },
  blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-600', icon: 'bg-blue-100 text-blue-600' },
  red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-600', icon: 'bg-red-100 text-red-600' },
  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-600', icon: 'bg-indigo-100 text-indigo-600' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-600', icon: 'bg-orange-100 text-orange-600' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-600', icon: 'bg-purple-100 text-purple-600' },
  slate: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-600', icon: 'bg-slate-100 text-slate-600' },
};

export default function SuperAdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const resp = await superAdminApi.getDashboard();
      if (resp.success) {
        setData(resp.data);
      }
    } catch (e) {
      console.error('Failed to load super admin dashboard:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[#16A34A]" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16 text-slate-400 font-medium">
        No dashboard data available.
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800">Super Admin Dashboard</h1>
          <p className="text-xs text-slate-500 mt-1">Platform overview and key metrics</p>
        </div>
        <button
          onClick={loadDashboard}
          className="h-9 px-4 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
        >
          Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {KPI_CARDS.map((kpi) => {
          const value = data[kpi.key];
          const colors = COLOR_MAP[kpi.color];
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.key}
              className={`${colors.bg} ${colors.border} border rounded-xl p-3.5 hover:shadow-md transition-all`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className={`w-8 h-8 rounded-lg ${colors.icon} flex items-center justify-center`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <p className={`text-xl font-extrabold ${colors.text} tabular-nums`}>
                {kpi.prefix}{value?.toLocaleString() || '0'}
              </p>
              <p className="text-[10px] font-bold text-slate-500 mt-0.5 uppercase tracking-wider">
                {kpi.label}
              </p>
            </div>
          );
        })}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly Restaurant Growth */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-extrabold text-slate-700 mb-3">Monthly Restaurant Growth</h3>
          {data.monthlyGrowth && data.monthlyGrowth.length > 0 ? (
            <div className="space-y-2">
              {data.monthlyGrowth.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-slate-500 w-16 shrink-0">{item.label}</span>
                  <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#16A34A] to-[#22C55E] rounded-full transition-all duration-500"
                      style={{ width: `${Math.min((item.count / Math.max(...data.monthlyGrowth.map(m => m.count), 1)) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-slate-600 w-8 text-right">{item.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-4 text-center">No growth data available</p>
          )}
        </div>

        {/* Subscription Revenue */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-extrabold text-slate-700 mb-3">Subscription Revenue</h3>
          {data.subscriptionRevenue && data.subscriptionRevenue.length > 0 ? (
            <div className="space-y-2">
              {data.subscriptionRevenue.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-slate-500 w-16 shrink-0">{item.label}</span>
                  <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min((item.revenue / Math.max(...data.subscriptionRevenue.map(m => m.revenue), 1)) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-slate-600 w-16 text-right">₹{item.revenue.toLocaleString()}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-4 text-center">No revenue data available</p>
          )}
        </div>

        {/* Plan Distribution */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-extrabold text-slate-700 mb-3">Plan Distribution</h3>
          {data.planDistribution && data.planDistribution.length > 0 ? (
            <div className="space-y-2">
              {data.planDistribution.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${
                      item.plan === 'TRIAL' ? 'bg-blue-400' :
                      item.plan === 'BASIC' ? 'bg-green-400' :
                      item.plan === 'PRO' ? 'bg-purple-400' :
                      item.plan === 'PREMIUM' ? 'bg-amber-400' :
                      'bg-slate-400'
                    }`} />
                    <span className="text-xs font-bold text-slate-600">{item.plan}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      item.status === 'ACTIVE' ? 'bg-green-50 text-green-600' :
                      item.status === 'TRIAL' ? 'bg-blue-50 text-blue-600' :
                      item.status === 'EXPIRED' ? 'bg-red-50 text-red-600' :
                      'bg-slate-50 text-slate-500'
                    }`}>{item.status}</span>
                  </div>
                  <span className="text-xs font-bold text-slate-700">{item.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-4 text-center">No plan distribution data</p>
          )}
        </div>

        {/* Recent Restaurants */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-extrabold text-slate-700 mb-3">Newest Restaurants</h3>
          {data.recentRestaurants && data.recentRestaurants.length > 0 ? (
            <div className="space-y-2">
              {data.recentRestaurants.map((r, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#16A34A]/10 to-[#15803D]/10 border border-[#16A34A]/20 flex items-center justify-center text-[10px] font-extrabold text-[#16A34A]">
                      {r.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-700">{r.name}</p>
                      <p className="text-[10px] text-slate-400">{r.ownerName} • {r._count?.users || 0} users</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      r.status === 'ACTIVE' ? 'bg-green-50 text-green-600' :
                      r.status === 'SUSPENDED' ? 'bg-red-50 text-red-600' :
                      'bg-slate-50 text-slate-500'
                    }`}>{r.status}</span>
                    <span className="text-[10px] font-bold text-slate-400">{r.subscriptionPlan}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-4 text-center">No restaurants yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
