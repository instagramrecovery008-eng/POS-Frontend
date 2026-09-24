import React, { useEffect, useState, useRef } from 'react';
import { useAuthStore, useSettingsStore, useCartStore, useUiStore } from '../../../store';
import { useSocketEvent } from '../../../hooks/useSocket';
import { dashboardApi } from '../../../api/dashboard.api';
import { formatCurrency } from '../../../lib/utils';
import { PLACEHOLDER_IMAGE } from '../../../lib/imagePlaceholder';
import { getBusinessCapabilities } from '../../../utils/businessCapabilities';
import {
  TrendingUp,
  ShoppingBag,
  Users,
  Clock,
  RefreshCw,
  Bell,
  UtensilsCrossed,
  Timer,
  ChefHat,
  AlertTriangle,
  X,
} from 'lucide-react';

// Cache the last fetched dashboard data to prevent refetch on remount
let cachedData = null;
let cachedKitchen = [];
let cachedRecent = [];
let lastFetchTime = 0;
const CACHE_TTL = 30000; // 30s cache

const SESSION_DISMISS_KEY = 'pos_subscription_warning_dismissed';

export default function DashboardPage() {
  const { user, subscription } = useAuthStore();
  const { settings } = useSettingsStore();
  const { refreshTrigger, setScreen } = useUiStore();
  // Centralized capability check (§1): every food-specific surface on the
  // dashboard (Kitchen Queue KPI/card, Table Occupancy, restaurant wording)
  // is gated on the SERVER-RESOLVED business capabilities — never a local
  // businessType === 'RESTAURANT' check.
  const capabilities = settings.capabilities || getBusinessCapabilities(settings.businessType);
  const showKitchen = capabilities.kitchen === true;
  const showTables = capabilities.tables === true;
  const [warningDismissed, setWarningDismissed] = useState(() => {
    try { return sessionStorage.getItem(SESSION_DISMISS_KEY) === '1'; } catch { return false; }
  });
  const [data, setData] = useState(cachedData);
  const [loading, setLoading] = useState(!cachedData);
  const [loadError, setLoadError] = useState(null);
  const [kitchenOrders, setKitchenOrders] = useState(cachedKitchen);
  const [recentOrders, setRecentOrders] = useState(cachedRecent);
  const [notifications, setNotifications] = useState([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    // Only load if cache is stale or empty
    if (!cachedData || Date.now() - lastFetchTime > CACHE_TTL) {
      loadDashboard();
    }
    return () => { mountedRef.current = false; };
  }, []);

  // Re-fetch when data changes (triggered by TakeOrderWizard after Save/Hold/KOT)
  useEffect(() => {
    if (refreshTrigger > 0) {
      cachedData = null;
      lastFetchTime = 0;
      loadDashboard();
    }
  }, [refreshTrigger]);

  // ── Real-time updates via WebSocket ──
  // Re-fetch dashboard when any order changes (cross-terminal sync)
  useSocketEvent({ event: 'order:created', handler: () => { cachedData = null; lastFetchTime = 0; loadDashboard(); } });
  useSocketEvent({ event: 'order:updated', handler: () => { cachedData = null; lastFetchTime = 0; loadDashboard(); } });
  useSocketEvent({ event: 'order:cancelled', handler: () => { cachedData = null; lastFetchTime = 0; loadDashboard(); } });
  useSocketEvent({ event: 'order:deleted', handler: () => { cachedData = null; lastFetchTime = 0; loadDashboard(); } });
  // Payment completion changes inventory KPIs (items sold, top items, low stock)
  useSocketEvent({ event: 'order:payment', handler: () => { cachedData = null; lastFetchTime = 0; loadDashboard(); } });
  // ── Periodic polling fallback (every 30s) — covers socket-disconnected edge cases ──
  useEffect(() => {
    const interval = setInterval(() => {
      cachedData = null;
      lastFetchTime = 0;
      loadDashboard();
    }, 30000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadDashboard = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Single consolidated dashboard call
      const dashResp = await dashboardApi.getDashboard();
      
      if (!mountedRef.current) return;

      if (dashResp?.data) {
        // ── BACKEND RESPONSE STRUCTURE ──
        // The /api/dashboard endpoint returns:
        // {
        //   summary: { todayOrders, todayBills, todayRevenue, totalMenu, totalCategories, totalUsers,
        //              occupiedTables, availableTables, reservedTables, cleaningTables, pendingKOT },
        //   sales: { totalSales, monthlySales, cashSales, upiSales, cardSales },
        //   tables: { available, occupied, reserved, cleaning },
        //   kitchen: { totalKOT, todayKOT },
        //   payments: { cash, card, upi },
        //   recentOrders: [...],
        //   topItems: [...],
        //   categorySales: [...],
        //   recentPayments: [...],
        //   liveOrders: [...],
        //   hourlySales: [{ hour, label, value }...24],
        //   staff: { admins, managers, cashiers, waiters, kitchen, total }
        // }
        const d = dashResp.data;
        const summary = d.summary || {};
        const sales = d.sales || {};
        const tables = d.tables || {};
        const staff = d.staff || {};
        const totalTablesCount = Number(tables.available || 0) + Number(tables.occupied || 0)
          + Number(tables.reserved || 0) + Number(tables.cleaning || 0);
        // All financial values come from the backend (bills/payments) — never
        // derived from the local cart. 0 is a legitimate value (a slow day).
        const todaySalesValue = Number(sales.totalSales ?? summary.todayRevenue ?? 0);
        const monthlySalesValue = Number(sales.monthlySales ?? 0);
        const todayOrdersCount = Number(summary.todayOrders ?? 0);
        const todayBillsCount = Number(summary.todayBills ?? 0);
        const liveOrdersList = d.liveOrders || [];

        // Map backend structure to frontend expected format
        const mappedData = {
          todaySales: todaySalesValue,
          totalOrders: todayOrdersCount,
          // Active Orders = real orders currently open (PENDING/PREPARING/READY),
          // not the pending-KOT count (a KOT count ≠ order count).
          activeOrders: liveOrdersList.length,
          tableOccupancy: Number(tables.occupied || 0),
          totalTables: totalTablesCount || Number(summary.availableTables || 0) + Number(summary.occupiedTables || 0),
          staffOnShift: Number(staff.total || 0),
          totalStaff: Number(staff.total || 0),
          averageOrderValue: todayBillsCount > 0
            ? Math.round((todaySalesValue / todayBillsCount) * 100) / 100
            : 0,
          salesByHour: Array.isArray(d.hourlySales) ? d.hourlySales : [],
          monthlySales: monthlySalesValue,
          // Kitchen queue count must come from the SAME source as the displayed
          // queue rows (liveOrders) — never the sliced display list length.
          kitchenQueueCount: liveOrdersList.length,
          topSellingItems: (d.topItems || []).map((item) => ({
            name: item.name || 'Item',
            quantity: item.quantity || 0,
            revenue: item.revenue || 0,
            image: item.image || PLACEHOLDER_IMAGE
          })),
        };

        setData(mappedData);
        cachedData = mappedData;

        // Extract kitchen orders from liveOrders (backend data.liveOrders has the order data)
        const kitchenMapped = liveOrdersList.slice(0, 8).map((o) => ({
          orderNumber: o.orderNo ? `#${o.orderNo}` : `#${o.id}`,
          tableName: o.table?.tableNo ? `Table ${o.table.tableNo}` : 'Takeaway',
          items: o.orderItems?.length || 0,
          itemCount: o.orderItems?.length || 0,
          elapsed: Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 60000),
        }));
        setKitchenOrders(kitchenMapped);
        cachedKitchen = kitchenMapped;

        // Extract recent orders — total is the order's persisted totalAmount
        // (includes discounts/tax), never a re-derived item sum.
        const recentOrdersList = d.recentOrders || [];
        const recentMapped = recentOrdersList.slice(0, 5).map((o) => ({
          id: o.id,
          orderNumber: o.orderNo ? `#${o.orderNo}` : `#${o.id}`,
          tableName: o.table?.tableNo ? `Table ${o.table.tableNo}` : 'Takeaway',
          total: Number(o.totalAmount ?? o.subtotal ?? 0),
          status: o.status,
          timestamp: new Date(o.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        }));
        setRecentOrders(recentMapped);
        cachedRecent = recentMapped;
      } else {
        // The backend always returns a data object (even empty); reaching this
        // branch means a malformed payload — show an honest empty state, never
        // fabricate figures from the local cart.
        const emptyData = {
          todaySales: 0, totalOrders: 0, activeOrders: 0,
          tableOccupancy: 0, totalTables: 0, staffOnShift: 0, totalStaff: 0,
          averageOrderValue: 0, salesByHour: [], monthlySales: 0, topSellingItems: [],
          kitchenQueueCount: 0,
        };
        setData(emptyData);
        cachedData = emptyData;
        setKitchenOrders([]);
        cachedKitchen = [];
        setRecentOrders([]);
        cachedRecent = [];
      }

      lastFetchTime = Date.now();
    } catch (e) {
      console.error('Dashboard load error:', e);
      if (mountedRef.current) {
        setLoadError(e?.message || 'Failed to load dashboard data');
        setData(null);
        cachedData = null;
        setKitchenOrders([]);
        cachedKitchen = [];
        setRecentOrders([]);
        cachedRecent = [];
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        <span className="text-sm font-semibold">Loading dashboard...</span>
      </div>
    );
  }

  // All KPI values come from the backend response only. There is no shift/
  // attendance system in the app, so the 4th KPI shows the real persisted
  // active-staff count (never a fabricated "on shift" ratio).
  const activeOrdersCount = Number(data?.activeOrders ?? 0);
  const todaySales = Number(data?.todaySales ?? 0);
  const todayOrdersCount = Number(data?.totalOrders ?? 0);

  // KPI #2 is capability-driven (§4): kitchen businesses show live "Active
  // Orders" (orders being prepared); counter-sale businesses (no kitchen)
  // have no in-progress kitchen state, so they show today's order count
  // instead. Same card slot, same card style — no layout branch.
  const activeOrdersKpi = showKitchen
    ? { label: 'Active Orders', value: activeOrdersCount }
    : { label: "Today's Orders", value: todayOrdersCount };

  const kpis = [
    {
      label: "Today's Sales", value: formatCurrency(todaySales),
      icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200',
    },
    {
      label: activeOrdersKpi.label, value: activeOrdersKpi.value,
      icon: ShoppingBag, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200',
    },
    // Kitchen Queue KPI only for kitchen businesses (§1); retail keeps the
    // 4-card grid by showing This Month's Sales in the third slot instead —
    // the value is already returned by the same consolidated dashboard call
    // (sales.monthlySales) so no extra API is needed.
    ...(showKitchen ? [{
      label: 'Kitchen Queue', value: Number(data?.kitchenQueueCount ?? kitchenOrders.length),
      icon: ChefHat, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200',
    }] : [{
      label: "This Month's Sales", value: formatCurrency(Number(data?.monthlySales ?? 0)),
      icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200',
    }]),
    {
      label: 'Active Staff', value: Number(data?.staffOnShift ?? 0),
      icon: Clock, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200',
    },
  ];

  if (loadError && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
        <AlertTriangle className="w-8 h-8 text-red-400" />
        <span className="text-sm font-semibold text-slate-600">Unable to load dashboard data.</span>
        <span className="text-xs text-slate-400">{loadError}</span>
        <button onClick={loadDashboard}
          className="h-10 px-4 bg-[#16A34A] text-white text-xs font-bold rounded-xl hover:bg-[#15803D] transition-all cursor-pointer">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-[#191c1e]">
            Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}, {user?.firstName || 'User'}
          </h2>
          <p className="text-[11px] text-slate-500 font-medium">Here's your {capabilities.food === true ? 'restaurant' : 'business'} overview for today</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Notifications Bell */}
          <div className="relative">
            <Bell className="w-4 h-4 text-slate-400" />
            {notifications.length > 0 && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full text-[7px] font-bold text-white flex items-center justify-center">
                {notifications.length}
              </span>
            )}
          </div>
          <button onClick={loadDashboard}
            className="h-8 px-3 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer transition-all">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Subscription expiry warning (backend days, dismissible for this session) ── */}
      {!warningDismissed && user?.role === 'ADMIN' && subscription && (
        (subscription.status === 'EXPIRED' || subscription.daysRemaining <= 0) ? (
          <div className="bg-red-50 border border-red-200 rounded-[18px] p-3 shadow-xs animate-slide-down" role="alert">
            <div className="flex flex-wrap items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-xs font-bold text-red-700 flex-1 min-w-[180px]">
                {subscription.expiryMessage || `Your ${subscription.planName || subscription.plan} subscription has expired.`}
              </p>
              <button
                onClick={() => setScreen('subscription')}
                className="h-10 px-4 bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer"
              >
                Renew / Change Plan
              </button>
              <button
                onClick={() => { setWarningDismissed(true); try { sessionStorage.setItem(SESSION_DISMISS_KEY, '1'); } catch {} }}
                aria-label="Dismiss warning"
                className="p-2 text-red-400 hover:text-red-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : subscription.lifecycle === 'EXPIRING_SOON' ? (
          <div className="bg-amber-50 border border-amber-200 rounded-[18px] p-3 shadow-xs animate-slide-down" role="alert">
            <div className="flex flex-wrap items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <p className="text-xs font-bold text-amber-700 flex-1 min-w-[180px]">
                {subscription.expiryMessage || `Your ${subscription.planName || subscription.plan} plan expires in ${subscription.daysRemaining} days.`}
              </p>
              <button
                onClick={() => setScreen('subscription')}
                className="h-10 px-4 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer"
              >
                Renew Plan
              </button>
              <button
                onClick={() => { setWarningDismissed(true); try { sessionStorage.setItem(SESSION_DISMISS_KEY, '1'); } catch {} }}
                aria-label="Dismiss warning"
                className="p-2 text-amber-400 hover:text-amber-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : null
      )}

      {/* Notifications Bar */}
      {notifications.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-[18px] p-3 shadow-xs animate-slide-down">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-800">
            <Bell className="w-4 h-4 text-amber-600" />
            <span>Live Updates</span>
          </div>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {notifications.slice(0, 3).map(n => (
              <span key={n.id} className="inline-flex items-center gap-1 text-[10px] font-semibold bg-white border border-amber-100 rounded-lg px-2 py-1 text-amber-700">
                {showKitchen ? <UtensilsCrossed className="w-3 h-3" /> : <ShoppingBag className="w-3 h-3" />} {n.message}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={`${kpi.bg} ${kpi.border} border rounded-[18px] p-4 shadow-xs`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{kpi.label}</span>
              <div className={`w-9 h-9 ${kpi.bg} rounded-xl flex items-center justify-center border ${kpi.border}`}>
                <kpi.icon className={`w-4.5 h-4.5 ${kpi.color}`} />
              </div>
            </div>
            <p className={`text-2xl font-extrabold ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Kitchen Queue — kitchen businesses only (§1); the card is removed
              entirely for retail so no empty "No pending kitchen orders" box shows. */}
          {showKitchen && (
          <div className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <ChefHat className="w-4 h-4 text-[#16A34A]" /> Kitchen Queue
              </h3>
              <span className="text-[10px] font-bold text-slate-400">{kitchenOrders.length} tickets</span>
            </div>
            {kitchenOrders.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {kitchenOrders.slice(0, 6).map((ko, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 border border-slate-100 rounded-xl hover:border-amber-200 transition-all">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center">
                        <Timer className="w-4 h-4 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-xs font-extrabold text-slate-800">{ko.orderNumber || ko.id}</p>
                        <p className="text-[9px] text-slate-500 font-semibold">{ko.tableName} · {ko.items || ko.itemCount || 0} items</p>
                      </div>
                    </div>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                      (ko.elapsed || 0) > 20 ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-amber-100 text-amber-700'
                    }`}>{ko.elapsed || 0}m</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-slate-400 text-xs italic">No pending kitchen orders.</div>
            )}
          </div>
          )}

          {/* Sales Summary — counter-sale businesses (no Kitchen Queue card)
              use this slot to keep the left column visually balanced. It
              renders ONLY data already returned by the same consolidated
              dashboard call (hourlySales + monthlySales) — no new API, no
              fabricated figures. Kitchen businesses keep the Kitchen Queue
              card instead (§7 — restaurant layout unchanged). */}
          {!showKitchen && (() => {
            const series = Array.isArray(data?.salesByHour) ? data.salesByHour : [];
            const hasSales = series.some((s) => Number(s.value ?? 0) > 0);
            const maxVal = Math.max(1, ...series.map((s) => Number(s.value ?? 0)));
            return (
              <div className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-[#16A34A]" /> Sales Summary
                  </h3>
                  <span className="text-[10px] font-bold text-slate-400">
                    {formatCurrency(Number(data?.monthlySales ?? 0))} this month
                  </span>
                </div>
                {hasSales ? (
                  <div>
                    <div className="flex items-end gap-1 h-24" role="img" aria-label="Sales by hour today">
                      {series.map((s, i) => {
                        const v = Number(s.value ?? 0);
                        const h = Math.max(4, Math.round((v / maxVal) * 100));
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full min-w-0"
                            title={`${s.label || s.hour}: ${formatCurrency(v)}`}>
                            <div
                              className={`w-full rounded-t-md transition-all ${v > 0 ? 'bg-[#16A34A]/75 hover:bg-[#16A34A]' : 'bg-slate-100'}`}
                              style={{ height: `${v > 0 ? h : 4}%` }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between mt-1.5 text-[9px] font-bold text-slate-400">
                      <span>12 AM</span>
                      <span>6 AM</span>
                      <span>12 PM</span>
                      <span>6 PM</span>
                      <span>11 PM</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-400 text-xs italic">
                    No sales recorded today yet.
                  </div>
                )}
              </div>
            );
          })()}

          {/* Top Selling Items */}
          <div className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
            <h3 className="text-xs font-extrabold text-slate-800 mb-3 uppercase tracking-wider">{showKitchen ? 'Top Selling Items' : 'Top Selling Products'}</h3>
            {data?.topSellingItems?.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {data.topSellingItems.slice(0, 6).map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-2.5 border border-slate-100 rounded-xl hover:border-[#16A34A] transition-all">
                    <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                      <img src={item.image || PLACEHOLDER_IMAGE}
                        alt={item.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" decoding="async"
                        onError={(e) => { e.target.src = PLACEHOLDER_IMAGE; }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-extrabold text-slate-800 truncate">{item.name}</p>
                      <p className="text-[10px] text-slate-500 font-semibold">{item.quantity} sold · {formatCurrency(item.revenue)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
            ) : (
              <div className="text-center py-6 text-slate-400 text-xs italic">
                No sales recorded today yet — top {showKitchen ? 'items' : 'products'} will appear here after the first sale.
              </div>
            )}
          </div>

          {/* Recent Orders */}
          {recentOrders.length === 0 ? (
            <div className="bg-white rounded-[18px] border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-xs font-extrabold text-slate-800">Recent Orders</h3>
              </div>
              <div className="text-center py-6 text-slate-400 text-xs italic">
                No orders yet today — new orders will appear here.
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-[18px] border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-xs font-extrabold text-slate-800">Recent Orders</h3>
                <span className="text-[10px] text-slate-500 font-semibold">Last {recentOrders.length}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left py-2.5 px-3 text-[10px] font-bold uppercase text-slate-500">Order</th>
                      {showTables && <th className="text-left py-2.5 px-3 text-[10px] font-bold uppercase text-slate-500">Table</th>}
                      <th className="text-right py-2.5 px-3 text-[10px] font-bold uppercase text-slate-500">Total</th>
                      <th className="text-right py-2.5 px-3 text-[10px] font-bold uppercase text-slate-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.slice(0, 5).map((ro, idx) => (
                      <tr key={ro.id || idx} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-bold text-slate-700 font-mono">{ro.orderNumber || `#${ro.id}`}</td>
                        {showTables && <td className="py-2.5 px-3 text-slate-600">{ro.tableName || `Table ${ro.tableId}`}</td>}
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">{formatCurrency(ro.total || ro.amount || 0)}</td>
                        <td className="py-2.5 px-3 text-right">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                            ro.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                            ro.status === 'CANCELLED' ? 'bg-red-100 text-red-700 line-through' :
                            ro.status === 'PREP' || ro.status === 'PENDING' ? 'bg-amber-100 text-amber-800' :
                            'bg-slate-100 text-slate-600'
                          }`}>{ro.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right: Summary */}
        <div className="space-y-4">
          {/* Today's Summary */}
          <div className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
            <h3 className="text-xs font-extrabold text-slate-800 mb-3 uppercase tracking-wider">Today's Summary</h3>
            <div className="space-y-2.5">
              <div className="flex justify-between items-center p-2.5 bg-emerald-50 rounded-xl border border-emerald-100">
                <span className="text-xs font-bold text-emerald-800">Total Revenue</span>
                <span className="text-sm font-extrabold text-emerald-700">{formatCurrency(todaySales)}</span>
              </div>
              <div className="flex justify-between items-center p-2.5 bg-orange-50 rounded-xl border border-orange-100">
                <span className="text-xs font-bold text-orange-800">Total Orders</span>
                <span className="text-sm font-extrabold text-orange-700">{Number(data?.totalOrders ?? 0)}</span>
              </div>
              <div className="flex justify-between items-center p-2.5 bg-blue-50 rounded-xl border border-blue-100">
                <span className="text-xs font-bold text-blue-800">Avg Order Value</span>
                <span className="text-sm font-extrabold text-blue-700">{formatCurrency(Number(data?.averageOrderValue ?? 0))}</span>
              </div>
            </div>
          </div>

          {/* Quick Summary */}
          <div className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
            <h3 className="text-xs font-extrabold text-slate-800 mb-3 uppercase tracking-wider">Quick Summary</h3>
            <div className="space-y-2 text-xs">
              {showTables && (
                <div className="flex justify-between font-semibold text-slate-600">
                  <span>Table Occupancy</span>
                  <span className="font-bold">{Math.round((Number(data?.tableOccupancy ?? 0) / Math.max(Number(data?.totalTables ?? 0), 1)) * 100)}%</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-slate-600">
                <span>Business Date</span>
                <span className="font-bold">{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              </div>
              <div className="flex justify-between font-semibold text-slate-600">
                <span>Current Time</span>
                <span className="font-bold">{new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
