import React, { useState, useEffect, useCallback } from 'react';
import { reportApi } from '../../../api/report.api';
import { formatCurrency, formatDate, formatTime } from '../../../lib/utils';
import { useSettingsStore, useUiStore } from '../../../store';
import { useSocketEvent } from '../../../hooks/useSocket';
import { getBusinessCapabilities, catalogNaming } from '../../../utils/businessCapabilities';
import {
  TrendingUp, ShoppingBag, CreditCard, Tag, ChefHat, Package, LayoutGrid, Users, BarChart3,
  RefreshCw, AlertTriangle, Loader2,
} from 'lucide-react';
// printService available if needed for future global exports

// Chart.js registration — must run before any <Bar>, <Doughnut>, etc. render.
import '../../../components/charts/chartConfig';

// Lazy-loaded category components
import SalesReports from '../components/SalesReports';
import OrderReports from '../components/OrderReports';
import PaymentReports from '../components/PaymentReports';
import DiscountReports from '../components/DiscountReports';
import KitchenReports from '../components/KitchenReports';
import MenuReports from '../components/MenuReports';
import TableReports from '../components/TableReports';
import StaffReports from '../components/StaffReports';
import ManagementReports from '../components/ManagementReports';

// ── Report Categories (filtered per-tenant by business capabilities; see
// ReportsPage — this is the base definition) ──
const BASE_CATEGORIES = [
  { key: 'sales', label: 'Sales', icon: TrendingUp, color: 'text-[#16A34A]', activeBg: 'bg-[#16A34A]', activeText: 'text-white', hoverBg: 'hover:bg-emerald-50', inactiveText: 'text-slate-500', activeBorder: 'border-[#16A34A]' },
  { key: 'orders', label: 'Orders', icon: ShoppingBag, color: 'text-blue-600', activeBg: 'bg-blue-600', activeText: 'text-white', hoverBg: 'hover:bg-blue-50', inactiveText: 'text-slate-500', activeBorder: 'border-blue-600' },
  { key: 'payments', label: 'Payments', icon: CreditCard, color: 'text-purple-600', activeBg: 'bg-purple-600', activeText: 'text-white', hoverBg: 'hover:bg-purple-50', inactiveText: 'text-slate-500', activeBorder: 'border-purple-600' },
  { key: 'discounts', label: 'Discounts', icon: Tag, color: 'text-amber-600', activeBg: 'bg-amber-600', activeText: 'text-white', hoverBg: 'hover:bg-amber-50', inactiveText: 'text-slate-500', activeBorder: 'border-amber-600' },
  { key: 'kitchen', label: 'Kitchen', icon: ChefHat, color: 'text-red-600', activeBg: 'bg-red-600', activeText: 'text-white', hoverBg: 'hover:bg-red-50', inactiveText: 'text-slate-500', activeBorder: 'border-red-600' },
  { key: 'menu', label: 'Menu', icon: Package, color: 'text-teal-600', activeBg: 'bg-teal-600', activeText: 'text-white', hoverBg: 'hover:bg-teal-50', inactiveText: 'text-slate-500', activeBorder: 'border-teal-600' },
  { key: 'tables', label: 'Tables', icon: LayoutGrid, color: 'text-orange-600', activeBg: 'bg-orange-600', activeText: 'text-white', hoverBg: 'hover:bg-orange-50', inactiveText: 'text-slate-500', activeBorder: 'border-orange-600' },
  { key: 'staff', label: 'Staff', icon: Users, color: 'text-indigo-600', activeBg: 'bg-indigo-600', activeText: 'text-white', hoverBg: 'hover:bg-indigo-50', inactiveText: 'text-slate-500', activeBorder: 'border-indigo-600' },
  { key: 'management', label: 'Management', icon: BarChart3, color: 'text-slate-600', activeBg: 'bg-slate-700', activeText: 'text-white', hoverBg: 'hover:bg-slate-100', inactiveText: 'text-slate-500', activeBorder: 'border-slate-700' },
];

export default function ReportsPage() {
  const { settings } = useSettingsStore();
  const { refreshTrigger } = useUiStore();

  // ── Capability-driven report categories (§3/§4) ──
  // Kitchen and Tables tabs exist only when the tenant's SERVER-RESOLVED
  // business capabilities allow them. Retail tenants never see them — not
  // even as empty tabs reachable by clicking.
  const capabilities = settings.capabilities || getBusinessCapabilities(settings.businessType);
  const showKitchenReports = capabilities.kitchen === true && capabilities.kot === true;
  const showTableReports = capabilities.tables === true && capabilities.floors === true;
  // §10: catalog-aware tab label — retail tenants see "Products" where food
  // verticals see "Menu" (same underlying report data, real backend only).
  const collectionLabel = catalogNaming(settings.businessType).collectionLabel;
  const CATEGORIES = BASE_CATEGORIES.filter((c) =>
    c.key === 'kitchen' ? showKitchenReports :
    c.key === 'tables' ? showTableReports : true
  ).map((c) =>
    c.key === 'menu' ? { ...c, label: collectionLabel } : c
  );

  // ── Category State ──
  const [activeCategory, setActiveCategory] = useState('sales');

  // §3: a manual/URL-driven activeCategory that is no longer available
  // (capability off, stale local state) falls back to Sales — never an empty
  // Kitchen/Tables page.
  useEffect(() => {
    if (!CATEGORIES.some((c) => c.key === activeCategory)) {
      setActiveCategory('sales');
    }
  }, [CATEGORIES, activeCategory]);

  // ── Date State ──
  const [quickRange, setQuickRange] = useState('today');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // ── Data States ──
  const [salesData, setSalesData] = useState(null);
  const [itemSales, setItemSales] = useState([]);
  const [categorySales, setCategorySales] = useState([]);
  const [paymentData, setPaymentData] = useState(null);
  const [orderReportData, setOrderReportData] = useState(null);
  const [discountData, setDiscountData] = useState(null);
  const [cancellationData, setCancellationData] = useState(null);
  const [kotRegister, setKotRegister] = useState(null);
  const [kotSummary, setKotSummary] = useState(null);
  const [kitchenPerformance, setKitchenPerformance] = useState(null);
  const [menuPerformance, setMenuPerformance] = useState([]);
  const [topSelling, setTopSelling] = useState(null);
  const [lowSelling, setLowSelling] = useState(null);
  const [categoryPerformance, setCategoryPerformance] = useState([]);
  const [tableSales, setTableSales] = useState([]);
  const [tableOccupancy, setTableOccupancy] = useState(null);
  const [staffSales, setStaffSales] = useState([]);
  const [staffActivity, setStaffActivity] = useState([]);
  const [staffDiscountCancellation, setStaffDiscountCancellation] = useState(null);
  const [dailyClosing, setDailyClosing] = useState(null);
  const [restaurantPerformance, setRestaurantPerformance] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [orderPage, setOrderPage] = useState(1);

  // ── Business-date formatting ──
  const formatBusinessDate = useCallback((date) => {
    if (!date) return '';
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    const get = (t) => parts.find((p) => p.type === t)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }, []);

  // ── Quick Date Ranges ──
  const quickRanges = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: '7days', label: 'Last 7 Days' },
    { key: '30days', label: 'Last 30 Days' },
    { key: 'month', label: 'This Month' },
    { key: 'custom', label: 'Custom' },
  ];

  useEffect(() => {
    if (quickRange === 'custom') {
      if (customStart && customEnd) {
        setDateRange(customStart > customEnd ? { start: customEnd, end: customStart } : { start: customStart, end: customEnd });
      }
      return;
    }
    const now = new Date();
    const todayStr = formatBusinessDate(now);
    const todayMidnight = new Date(`${todayStr}T00:00:00+05:30`);
    let start = new Date(todayMidnight);
    switch (quickRange) {
      case 'today': break;
      case 'yesterday': start.setDate(start.getDate() - 1); break;
      case '7days': start.setDate(start.getDate() - 7); break;
      case '30days': start.setDate(start.getDate() - 30); break;
      case 'month': start = new Date(`${todayStr.slice(0, 7)}-01T00:00:00+05:30`); break;
    }
    setDateRange({ start: formatBusinessDate(start), end: todayStr });
  }, [quickRange, customStart, customEnd, formatBusinessDate]);

  // ── Error helper ──
  const getErrorMessage = useCallback((err) => {
    if (!err) return 'An unexpected error occurred. Please try again.';
    if (err.response) {
      switch (err.response.status) {
        case 401: return 'Your session has expired. Please sign in again.';
        case 403: return 'You do not have permission to view this report.';
        case 404: return 'Report data is not available.';
        case 500: return 'Unable to load this report. Please try again.';
        default: return err.response?.data?.message || 'Unable to load this report. Please try again.';
      }
    }
    if (err.request) return 'Unable to connect to the server.';
    return 'Failed to load reports.';
  }, []);

  // ── Load Reports (per-category optimized) ──
  const loadReports = useCallback(async () => {
    if (!dateRange.start || !dateRange.end) return;
    setLoading(true);
    setError(null);
    try {
      const params = { from: dateRange.start, to: dateRange.end };
      const extract = (r) => r.status === 'fulfilled' ? (r.value?.data ?? r.value) : null;

      // Only load APIs relevant to the active category
      let results;
      switch (activeCategory) {
        case 'sales':
          results = await Promise.allSettled([
            reportApi.getSales(params),
            reportApi.getItemSales(params),
            reportApi.getCategorySales(params),
          ]);
          {
            const [s, i, catSales] = results;
            setSalesData(extract(s));
            setItemSales(Array.isArray(extract(i)) ? extract(i) : extract(i)?.items || []);
            setCategorySales(Array.isArray(extract(catSales)) ? extract(catSales) : extract(catSales)?.categories || []);
          }
          break;
        case 'orders':
          results = await Promise.allSettled([
            reportApi.getOrders({ ...params, page: orderPage, pageSize: 10 }),
            reportApi.getCancellationReport(params),
          ]);
          {
            const [o, cancel] = results;
            setOrderReportData(extract(o));
            setCancellationData(extract(cancel));
          }
          break;
        case 'payments':
          results = await Promise.allSettled([
            reportApi.getPaymentReport(params),
          ]);
          {
            const [p] = results;
            setPaymentData(extract(p));
          }
          break;
        case 'discounts':
          results = await Promise.allSettled([
            reportApi.getDiscountReport(params),
          ]);
          {
            const [disc] = results;
            setDiscountData(extract(disc));
          }
          break;
        case 'kitchen':
          results = await Promise.allSettled([
            reportApi.getKotRegister(params),
            reportApi.getKotSummary(params),
            reportApi.getKitchenPerformance(params),
          ]);
          {
            const [kr, ks, kp] = results;
            setKotRegister(extract(kr));
            setKotSummary(extract(ks));
            setKitchenPerformance(extract(kp));
          }
          break;
        case 'menu':
          results = await Promise.allSettled([
            reportApi.getMenuPerformance(params),
            reportApi.getTopSellingItems(params),
            reportApi.getLowSellingItems(params),
            reportApi.getCategoryPerformance(params),
          ]);
          {
            const [mp, ts, ls, cp] = results;
            setMenuPerformance(Array.isArray(extract(mp)) ? extract(mp) : extract(mp)?.items || []);
            setTopSelling(extract(ts));
            setLowSelling(extract(ls));
            setCategoryPerformance(Array.isArray(extract(cp)) ? extract(cp) : extract(cp)?.categories || []);
          }
          break;
        case 'tables':
          results = await Promise.allSettled([
            reportApi.getTableSales(params),
            reportApi.getTableOccupancy(),
          ]);
          {
            const [tsales, to] = results;
            setTableSales(Array.isArray(extract(tsales)) ? extract(tsales) : extract(tsales)?.tables || []);
            setTableOccupancy(extract(to));
          }
          break;
        case 'staff':
          results = await Promise.allSettled([
            reportApi.getStaffSales(params),
            reportApi.getStaffActivity(params),
            reportApi.getStaffDiscountCancellation(params),
          ]);
          {
            const [ss, sa, sdc] = results;
            setStaffSales(Array.isArray(extract(ss)) ? extract(ss) : extract(ss)?.staff || []);
            setStaffActivity(Array.isArray(extract(sa)) ? extract(sa) : extract(sa)?.activity || []);
            setStaffDiscountCancellation(extract(sdc));
          }
          break;
        case 'management':
          results = await Promise.allSettled([
            reportApi.getDailyClosing({ date: dateRange.end }),
            reportApi.getRestaurantPerformance(params),
          ]);
          {
            const [dc, rp] = results;
            setDailyClosing(extract(dc));
            setRestaurantPerformance(extract(rp));
          }
          break;
        default:
          results = [];
      }

      if (results && results.length > 0) {
        const firstRejected = results.find(r => r.status === 'rejected');
        if (firstRejected) {
          const reason = firstRejected.reason;
          if (reason?.status === 401) setError('Your session has expired. Please sign in again.');
          else if (reason?.status === 403) setError('You do not have permission to view reports.');
          else if (reason?.status === 0) setError('Unable to connect to the server. Please check your connection.');
        }
      }
    } catch (e) {
      if (e?.status === 0) setError('Unable to connect to the server. Please check your connection.');
      else if (e?.status === 401) setError('Your session has expired. Please sign in again.');
      else setError('Failed to load reports. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [dateRange, orderPage, activeCategory, getErrorMessage]);

useEffect(() => { loadReports(); }, [loadReports, refreshTrigger]);

  useSocketEvent({ event: 'order:created', handler: () => loadReports() });
  useSocketEvent({ event: 'order:updated', handler: () => loadReports() });
  useSocketEvent({ event: 'order:cancelled', handler: () => loadReports() });
  useSocketEvent({ event: 'order:payment', handler: () => loadReports() });



  const activeCat = CATEGORIES.find(c => c.key === activeCategory);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      {/* ── Page Header ── */}
      <div className="shrink-0 bg-white border-b border-slate-200 print:hidden">
        <div className="max-w-[1600px] mx-auto px-4 pt-4 pb-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h1 className="text-lg font-extrabold text-[#191c1e]">Reports &amp; Sales</h1>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                View {capabilities.kitchen === true ? 'restaurant sales' : 'business sales'} performance, sales history, payment analytics{showKitchenReports ? ', kitchen performance' : ''} and business insights.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={loadReports} disabled={loading} className="p-2 hover:bg-slate-100 rounded-lg cursor-pointer disabled:opacity-50" title="Refresh">
                <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* ── Date Filters ── */}
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            {quickRanges.map(qr => (
              <button key={qr.key} onClick={() => { setQuickRange(qr.key); setOrderPage(1); }}
                className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${quickRange === qr.key ? 'bg-[#16A34A] text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {qr.label}
              </button>
            ))}
            {quickRange === 'custom' && (
              <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-slate-200">
                <label className="text-[9px] font-bold text-slate-400 uppercase">From</label>
                <input type="date" value={customStart} onChange={e => { setCustomStart(e.target.value); setOrderPage(1); }}
                  className="h-7 px-1.5 bg-slate-50 border border-slate-200 rounded text-[10px] outline-none" />
                <label className="text-[9px] font-bold text-slate-400 uppercase">To</label>
                <input type="date" value={customEnd} onChange={e => { setCustomEnd(e.target.value); setOrderPage(1); }}
                  className="h-7 px-1.5 bg-slate-50 border border-slate-200 rounded text-[10px] outline-none" />
              </div>
            )}
            <div className="ml-auto text-[9px] text-slate-400 font-semibold">
              {dateRange.start && dateRange.end ? `${formatDate(dateRange.start)} — ${formatDate(dateRange.end)}` : ''}
            </div>
          </div>
        </div>

        {/* ── Horizontal Category Navigation ── */}
        <div className="max-w-[1600px] mx-auto px-4 pb-0">
          <nav className="flex gap-1 overflow-x-auto no-scrollbar pb-3 -mb-px">
            {CATEGORIES.map(cat => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.key;
              return (
                <button key={cat.key} onClick={() => setActiveCategory(cat.key)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer shrink-0 border border-transparent ${isActive ? `${cat.activeBg} ${cat.activeText} shadow-xs` : `${cat.inactiveText} ${cat.hoverBg} hover:border-slate-200`}`}>
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* ── Main Content ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto p-4 space-y-4">
          {/* ── Error State ── */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2 text-xs text-red-700 font-semibold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
              <button onClick={loadReports} className="ml-auto text-red-600 hover:underline font-bold cursor-pointer">Retry</button>
            </div>
          )}

          {/* ── Loading State ── */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-[#16A34A]" />
              <span className="ml-2.5 text-xs font-semibold text-slate-500">Loading reports...</span>
            </div>
          )}

          {/* ── Category Content ── */}
          {!loading && (
            <div className="animate-fade-in">
              {activeCategory === 'sales' && (
                <SalesReports salesData={salesData} itemSales={itemSales} categorySales={categorySales}
                  dateRange={dateRange} loading={loading} searchQuery={searchQuery} setSearchQuery={setSearchQuery}
                  formatCurrency={formatCurrency} formatDate={formatDate} />
              )}
              {activeCategory === 'orders' && (
                <OrderReports orderReportData={orderReportData} cancellationData={cancellationData} loading={loading}
                  formatCurrency={formatCurrency} formatDate={formatDate} formatTime={formatTime} />
              )}
              {activeCategory === 'payments' && (
                <PaymentReports paymentData={paymentData} loading={loading}
                  formatCurrency={formatCurrency} formatDate={formatDate} formatTime={formatTime} />
              )}
              {activeCategory === 'discounts' && (
                <DiscountReports discountData={discountData}
                  loading={loading} formatCurrency={formatCurrency} formatDate={formatDate} />
              )}
              {activeCategory === 'kitchen' && (
                <KitchenReports kotRegister={kotRegister} kotSummary={kotSummary} kitchenPerformance={kitchenPerformance}
                  loading={loading} formatCurrency={formatCurrency} formatDate={formatDate} formatTime={formatTime} />
              )}
              {activeCategory === 'menu' && (
                <MenuReports menuPerformance={menuPerformance} topSelling={topSelling} lowSelling={lowSelling}
                  categoryPerformance={categoryPerformance} loading={loading} formatCurrency={formatCurrency} />
              )}
              {activeCategory === 'tables' && (
                <TableReports tableSales={tableSales} tableOccupancy={tableOccupancy}
                  loading={loading} formatCurrency={formatCurrency} />
              )}
              {activeCategory === 'staff' && (
                <StaffReports staffSales={staffSales} staffActivity={staffActivity}
                  staffDiscountCancellation={staffDiscountCancellation} loading={loading} formatCurrency={formatCurrency} />
              )}
              {activeCategory === 'management' && (
                <ManagementReports dailyClosing={dailyClosing}
                  restaurantPerformance={restaurantPerformance} loading={loading} formatCurrency={formatCurrency} formatDate={formatDate} dateRange={dateRange} />
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
