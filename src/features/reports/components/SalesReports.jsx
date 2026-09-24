import React, { useState, useMemo } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import { formatCurrency, formatDate } from '../../../lib/utils';
import { PLACEHOLDER_IMAGE } from '../../../lib/imagePlaceholder';
import {
  TrendingUp, DollarSign, ShoppingBag, Receipt, Clock, ArrowUpDown,
  BarChart3, PieChart, Package, Layers, Trophy, Crown,
  ArrowUp, ArrowDown, Search, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import ReportExportBar from '../../../components/common/ReportExportBar';
import { useSettingsStore } from '../../../store';

const chartFont = { family: "'Inter', 'Segoe UI', sans-serif", size: 9 };
const chartDefaults = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { titleFont: chartFont, bodyFont: { ...chartFont, size: 10 } } },
};

export default function SalesReports({
  salesData, itemSales, categorySales, dateRange, loading,
  searchQuery, setSearchQuery, formatCurrency: fc, formatDate: fd,
}) {
  const [subTab, setSubTab] = useState('dashboard');
  const [expandedCategories, setExpandedCategories] = useState({});
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [itemCategoryFilter, setItemCategoryFilter] = useState('all');
  const [itemSortField, setItemSortField] = useState('quantitySold');
  const [itemSortDir, setItemSortDir] = useState('desc');
  const [itemPage, setItemPage] = useState(1);
  const [catChartMetric, setCatChartMetric] = useState('revenue');
  const [itemChartMetric, setItemChartMetric] = useState('quantity');

  const { settings } = useSettingsStore();
  const currencySymbol = settings?.currencySymbol || '₹';
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;
  const itemPageSize = 8;

  const formatCurrencyVal = fc || formatCurrency;
  const formatDateVal = fd || formatDate;

  const subTabs = [
    { key: 'dashboard', label: 'Sales Dashboard' },
    { key: 'daily', label: 'Daily Sales' },
    { key: 'register', label: 'Sales Register' },
    { key: 'items', label: 'Item-wise' },
    { key: 'categories', label: 'Category-wise' },
    { key: 'hourly', label: 'Hourly Sales' },
  ];

  // ── KPIs ──
  const s = salesData?.summary || {};
  const analytics = salesData?.analytics || {};
  const totalItemsSold = analytics.totalItemsSold || 0;
  const totalCategoriesSold = analytics.totalCategoriesSold ?? categorySales.length;
  const avgItemPrice = analytics.averageItemSellingPrice || 0;
  const topItem = analytics.topSellingItem || null;
  const topCat = analytics.topSellingCategory || null;
  const topItems = Array.isArray(analytics.topItems) ? analytics.topItems : [];

  const paymentSummary = useMemo(() => {
    const ps = salesData?.paymentSummary || {};
    const known = { cash: ps.CASH || 0, card: ps.CARD || 0, upi: ps.UPI || 0 };
    let other = 0;
    Object.entries(ps).forEach(([k, v]) => {
      if (!['CASH', 'CARD', 'UPI'].includes(k) && typeof v === 'number') other += v;
    });
    return { ...known, other };
  }, [salesData]);

  const totalPayments = paymentSummary.cash + paymentSummary.card + paymentSummary.upi + paymentSummary.other;

  // ── Payment Distribution Chart ──
  const paymentChartData = useMemo(() => ({
    labels: ['Cash', 'Card', 'UPI', 'Other'],
    datasets: [{
      data: [paymentSummary.cash, paymentSummary.card, paymentSummary.upi, paymentSummary.other],
      backgroundColor: ['rgba(22,163,74,0.85)', 'rgba(37,99,235,0.85)', 'rgba(124,58,237,0.85)', 'rgba(100,116,139,0.85)'],
      borderWidth: 0, cutout: '70%',
    }],
  }), [paymentSummary]);

  // ── Hourly Sales Data ──
  const hourlyData = useMemo(() => {
    const bills = salesData?.bills || [];
    const hourMap = {};
    for (let i = 0; i < 24; i++) hourMap[i] = 0;
    bills.forEach((b) => {
      if (b.createdAt) { const h = new Date(b.createdAt).getHours(); hourMap[h] += b.grandTotal || 0; }
    });
    return {
      labels: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`),
      datasets: [{ label: 'Sales', data: Array.from({ length: 24 }, (_, i) => hourMap[i] || 0),
        backgroundColor: Array.from({ length: 24 }, (_, i) => hourMap[i] > 0 ? 'rgba(22,163,74,0.7)' : 'rgba(226,232,240,0.3)'),
        borderRadius: 4, borderSkipped: false }],
    };
  }, [salesData]);

  // ── Category Chart ──
  const categoryChartData = useMemo(() => {
    const top = categorySales.slice(0, 10);
    const key = catChartMetric === 'revenue' ? 'revenue' : 'quantitySold';
    return {
      labels: top.map(c => c.categoryName || 'Unknown'),
      datasets: [{ label: catChartMetric === 'revenue' ? 'Revenue' : 'Items Sold', data: top.map(c => c[key] || 0),
        backgroundColor: ['rgba(22,163,74,0.8)', 'rgba(37,99,235,0.8)', 'rgba(217,119,6,0.8)', 'rgba(124,58,237,0.8)',
          'rgba(220,38,38,0.8)', 'rgba(13,148,136,0.8)', 'rgba(234,88,12,0.8)', 'rgba(100,116,139,0.8)',
          'rgba(225,29,72,0.8)', 'rgba(34,197,94,0.8)'],
        borderRadius: 4, borderSkipped: false }],
    };
  }, [categorySales, catChartMetric]);

  // ── Item Chart ──
  const itemChartData = useMemo(() => {
    const top = itemSales.slice(0, 10);
    const key = itemChartMetric === 'revenue' ? 'revenue' : 'quantitySold';
    return {
      labels: top.map(i => i.itemName || 'Unknown'),
      datasets: [{ label: itemChartMetric === 'revenue' ? 'Revenue' : 'Quantity', data: top.map(i => i[key] || 0),
        backgroundColor: 'rgba(22,163,74,0.7)', borderRadius: 4, borderSkipped: false }],
    };
  }, [itemSales, itemChartMetric]);

  // ── Sorted/Filtered Items ──
  const filteredItems = useMemo(() => {
    const q = itemSearchQuery.trim().toLowerCase();
    return itemSales.filter(i => {
      if (itemCategoryFilter !== 'all' && String(i.categoryId) !== itemCategoryFilter) return false;
      if (!q) return true;
      return (i.itemName || '').toLowerCase().includes(q) || (i.category || '').toLowerCase().includes(q);
    }).sort((a, b) => {
      let aV, bV;
      switch (itemSortField) {
        case 'revenue': aV = a.revenue || 0; bV = b.revenue || 0; break;
        case 'orderCount': aV = a.orderCount || 0; bV = b.orderCount || 0; break;
        case 'averageSellingPrice': aV = a.averageSellingPrice || 0; bV = b.averageSellingPrice || 0; break;
        default: aV = a.quantitySold || 0; bV = b.quantitySold || 0;
      }
      return itemSortDir === 'asc' ? aV - bV : bV - aV;
    });
  }, [itemSales, itemSearchQuery, itemCategoryFilter, itemSortField, itemSortDir]);

  const itemTotalPages = Math.max(1, Math.ceil(filteredItems.length / itemPageSize));
  const paginatedItems = useMemo(() => {
    const start = (itemPage - 1) * itemPageSize;
    return filteredItems.slice(start, start + itemPageSize);
  }, [filteredItems, itemPage, itemPageSize]);

  const categoryFilterOptions = useMemo(() => categorySales.map(c => ({ id: c.categoryId, name: c.categoryName })), [categorySales]);

  // ── Sales Register (bills list) ──
  const getBillPaymentMethod = (bill) => {
    const p = bill?.payments || [];
    if (p.length > 0) { const paid = p.find(x => x.status === 'PAID') || p[0]; if (paid?.paymentMethod) return paid.paymentMethod; }
    return bill?.paymentMethod || '-';
  };

  const sortedBills = useMemo(() => {
    const bills = salesData?.bills || [];
    if (!searchQuery) return bills;
    const q = searchQuery.toLowerCase();
    return bills.filter(b =>
      String(b.billNo || '').toLowerCase().includes(q) ||
      String(b.order?.orderNo || '').toLowerCase().includes(q) ||
      String(b.order?.table?.tableNo || '').toLowerCase().includes(q)
    );
  }, [salesData, searchQuery]);

  const paginatedBills = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedBills.slice(start, start + pageSize);
  }, [sortedBills, currentPage, pageSize]);

  const totalBillPages = Math.ceil(sortedBills.length / pageSize);

  // ── Daily aggregation ──
  const dailySales = useMemo(() => {
    const bills = salesData?.bills || [];
    const dayMap = {};
    bills.forEach(b => {
      const dateStr = b.createdAt?.split('T')[0] || 'Unknown';
      if (!dayMap[dateStr]) dayMap[dateStr] = { date: dateStr, orders: 0, grossSales: 0, discount: 0, tax: 0 };
      dayMap[dateStr].orders += 1;
      dayMap[dateStr].grossSales += Number(b.grandTotal || 0);
      dayMap[dateStr].discount += Number(b.discount || 0);
      dayMap[dateStr].tax += Number(b.taxAmount || 0);
    });
    return Object.values(dayMap).sort((a, b) => b.date.localeCompare(a.date));
  }, [salesData]);

  const catTotals = useMemo(() => categorySales.reduce((acc, c) => ({
    quantitySold: acc.quantitySold + (c.quantitySold || 0),
    orderCount: acc.orderCount + (c.orderCount || 0),
    revenue: acc.revenue + (c.revenue || 0),
  }), { quantitySold: 0, orderCount: 0, revenue: 0 }), [categorySales]);

  if (loading) return null;

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px] font-bold overflow-x-auto no-scrollbar">
        {subTabs.map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer shrink-0 ${subTab === t.key ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ Sales Dashboard ═══ */}
      {subTab === 'dashboard' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Total Sales', value: formatCurrencyVal(s.totalSales || 0), icon: DollarSign, color: 'from-emerald-50 to-white border-emerald-200', textColor: 'text-[#16A34A]' },
              { label: 'Total Orders', value: s.totalOrders || 0, icon: ShoppingBag, color: 'from-blue-50 to-white border-blue-200', textColor: 'text-blue-600' },
              { label: 'Items Sold', value: totalItemsSold, icon: Package, color: 'from-orange-50 to-white border-orange-200', textColor: 'text-orange-600' },
              { label: 'Top Item', value: topItem?.itemName || '—', caption: topItem ? `${topItem.quantitySold} sold` : 'No sales', icon: Trophy, color: 'from-amber-50 to-white border-amber-200', textColor: 'text-amber-700', valueClass: 'text-[12px]' },
              { label: 'Avg Order Value', value: formatCurrencyVal(s.averageOrderValue || 0), icon: TrendingUp, color: 'from-purple-50 to-white border-purple-200', textColor: 'text-purple-600' },
              { label: 'Net Revenue', value: formatCurrencyVal(s.netSales || 0), icon: DollarSign, color: 'from-teal-50 to-white border-teal-200', textColor: 'text-teal-600' },
            ].map((kpi, idx) => (
              <div key={idx} className={`bg-gradient-to-br ${kpi.color} rounded-[18px] border p-4 shadow-xs`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[9px] font-bold uppercase text-slate-500 tracking-wider truncate">{kpi.label}</p>
                  <kpi.icon className={`w-4 h-4 opacity-40 shrink-0 ${kpi.textColor}`} />
                </div>
                <p className={`${kpi.valueClass || 'text-lg'} font-extrabold truncate ${kpi.textColor}`}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {topItems.length > 0 && (
            <div className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
              <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-amber-600" /> Top Selling Items
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
                {topItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2.5 bg-slate-50 hover:bg-slate-100 rounded-xl p-2.5 border border-slate-100">
                    <div className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-white border border-slate-200">
                      <img src={item.image || PLACEHOLDER_IMAGE} alt={item.itemName} onError={e => { e.target.src = PLACEHOLDER_IMAGE; }} className="w-full h-full object-cover" loading="lazy" />
                      <span className="absolute top-0 left-0 bg-[#16A34A] text-white text-[8px] font-extrabold w-4 h-4 flex items-center justify-center rounded-br-lg">{idx + 1}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-slate-800 truncate">{item.itemName}</p>
                      <p className="text-[9px] text-slate-500 font-mono">{item.quantitySold} sold · {formatCurrencyVal(item.revenue)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
              <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#16A34A]" /> Hourly Sales
              </h4>
              <div className="h-44">
                <Bar data={hourlyData} options={{ ...chartDefaults, scales: { x: { grid: { display: false }, ticks: { font: { ...chartFont, size: 7 }, maxTicksLimit: 12 } }, y: { beginAtZero: true, ticks: { font: chartFont } } } }} />
              </div>
            </div>
            <div className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
              <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <PieChart className="w-3.5 h-3.5 text-blue-600" /> Payment Distribution
              </h4>
              <div className="flex items-center gap-6">
                <div className="w-32 h-32 shrink-0">
                  {totalPayments > 0 ? <Doughnut data={paymentChartData} options={{ ...chartDefaults, cutout: '70%' }} /> :
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400 italic">No data</div>}
                </div>
                <div className="space-y-2 text-[10px]">
                  {[{ l: 'Cash', v: paymentSummary.cash, c: '#16A34A' }, { l: 'Card', v: paymentSummary.card, c: '#2563EB' },
                    { l: 'UPI', v: paymentSummary.upi, c: '#7C3AED' },
                    ...(paymentSummary.other > 0 ? [{ l: 'Other', v: paymentSummary.other, c: '#64748B' }] : []),
                  ].map(p => (
                    <div key={p.l} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.c }} />
                      <span className="font-semibold text-slate-600 min-w-[32px]">{p.l}</span>
                      <span className="font-mono font-bold text-slate-800">{fc(Number(p.v || 0))}</span>
                      <span className="text-slate-400">({totalPayments > 0 ? Math.round((Number(p.v || 0) / totalPayments) * 100) : 0}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5 text-amber-600" /> Category Performance
                </h4>
                <div className="flex bg-slate-100 p-0.5 rounded-lg gap-0.5">
                  {['revenue', 'quantity'].map(m => (
                    <button key={m} onClick={() => setCatChartMetric(m)}
                      className={`px-2 py-0.5 text-[8px] font-bold rounded-md cursor-pointer ${catChartMetric === m ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500'}`}>
                      {m === 'revenue' ? 'Revenue' : 'Items'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-44">
                {categoryChartData.labels.length > 0 ? (
                  <Bar data={categoryChartData} options={{ ...chartDefaults, indexAxis: 'y', scales: { x: { beginAtZero: true, ticks: { font: chartFont } }, y: { grid: { display: false }, ticks: { font: { ...chartFont, size: 8 } } } } }} />
                ) : <div className="h-full flex items-center justify-center text-xs text-slate-400 italic">No data</div>}
              </div>
            </div>
            <div className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5 text-purple-600" /> Item Performance
                </h4>
                <div className="flex bg-slate-100 p-0.5 rounded-lg gap-0.5">
                  {['quantity', 'revenue'].map(m => (
                    <button key={m} onClick={() => setItemChartMetric(m)}
                      className={`px-2 py-0.5 text-[8px] font-bold rounded-md cursor-pointer ${itemChartMetric === m ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500'}`}>
                      {m === 'quantity' ? 'Quantity' : 'Revenue'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-44">
                {itemChartData.labels.length > 0 ? (
                  <Bar data={itemChartData} options={{ ...chartDefaults, indexAxis: 'y', scales: { x: { beginAtZero: true, ticks: { font: chartFont } }, y: { grid: { display: false }, ticks: { font: { ...chartFont, size: 8 } } } } }} />
                ) : <div className="h-full flex items-center justify-center text-xs text-slate-400 italic">No data</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Daily Sales ═══ */}
      {subTab === 'daily' && (
        <div className="bg-white rounded-[18px] border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-xs font-extrabold text-slate-800">Daily Sales Summary</p>
            <ReportExportBar
              title="Daily Sales"
              columns={[{ key: 'date', label: 'Date' }, { key: 'orders', label: 'Orders', format: 'number' }, { key: 'grossSales', label: 'Gross Sales', format: 'currency' }, { key: 'discount', label: 'Discount', format: 'currency' }, { key: 'tax', label: 'Tax', format: 'currency' }, { key: 'netSales', label: 'Net Sales', format: 'currency' }]}
              data={dailySales.map(d => ({ ...d, netSales: d.grossSales }))}
              dateRange={dateRange}
              summaryRow={{ date: 'TOTAL', orders: dailySales.reduce((a, d) => a + d.orders, 0), grossSales: dailySales.reduce((a, d) => a + d.grossSales, 0), discount: dailySales.reduce((a, d) => a + d.discount, 0), tax: dailySales.reduce((a, d) => a + d.tax, 0), netSales: dailySales.reduce((a, d) => a + d.grossSales, 0) }}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left py-2.5 px-3 text-[9px] font-bold uppercase text-slate-500">Date</th>
                  <th className="text-center py-2.5 px-3 text-[9px] font-bold uppercase text-slate-500">Orders</th>
                  <th className="text-right py-2.5 px-3 text-[9px] font-bold uppercase text-slate-500">Gross Sales</th>
                  <th className="text-right py-2.5 px-3 text-[9px] font-bold uppercase text-slate-500">Discount</th>
                  <th className="text-right py-2.5 px-3 text-[9px] font-bold uppercase text-slate-500">Tax</th>
                  <th className="text-right py-2.5 px-3 text-[9px] font-bold uppercase text-slate-500">Net Sales</th>
                </tr>
              </thead>
              <tbody>
                {dailySales.length > 0 ? dailySales.map((d, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-bold text-slate-700">{formatDateVal(d.date)}</td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-600">{d.orders}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">{formatCurrencyVal(d.grossSales)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-red-600">{formatCurrencyVal(d.discount)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-500">{formatCurrencyVal(d.tax)}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-[#16A34A]">{formatCurrencyVal(d.grossSales)}</td>
                  </tr>
                )) : <tr><td colSpan={6} className="py-10 text-center text-slate-400 italic">No daily sales data</td></tr>}
                {dailySales.length > 0 && (
                  <tr className="bg-emerald-50/60 font-bold">
                    <td className="py-2.5 px-3">TOTAL</td>
                    <td className="py-2.5 px-3 text-center font-mono">{dailySales.reduce((a, d) => a + d.orders, 0)}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{formatCurrencyVal(dailySales.reduce((a, d) => a + d.grossSales, 0))}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{formatCurrencyVal(dailySales.reduce((a, d) => a + d.discount, 0))}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{formatCurrencyVal(dailySales.reduce((a, d) => a + d.tax, 0))}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{formatCurrencyVal(dailySales.reduce((a, d) => a + d.grossSales, 0))}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ Sales Register ═══ */}
      {subTab === 'register' && (
        <div className="bg-white rounded-[18px] border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-xs font-extrabold text-slate-800">Sales Register ({sortedBills.length})</p>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input type="text" placeholder="Search..." value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  className="w-48 pl-8 pr-2.5 h-7 bg-slate-50 border border-slate-200 rounded-lg text-[10px] outline-none focus:border-[#16A34A]" />
              </div>
              <ReportExportBar
                title="Sales Register"
                columns={[{ key: 'billNo', label: 'Bill No' }, { key: 'orderNo', label: 'Order' }, { key: 'date', label: 'Date' }, { key: 'table', label: 'Table' }, { key: 'items', label: 'Items', format: 'number' }, { key: 'payment', label: 'Payment' }, { key: 'subtotal', label: 'Subtotal', format: 'currency' }, { key: 'tax', label: 'Tax', format: 'currency' }, { key: 'discount', label: 'Discount', format: 'currency' }, { key: 'total', label: 'Total', format: 'currency' }, { key: 'status', label: 'Status' }]}
                data={sortedBills.map(b => ({ billNo: `#${b.billNo || b.id}`, orderNo: b.order?.orderNo || '-', date: formatDateVal(b.createdAt), table: b.order?.table?.tableNo ? `T${b.order.table.tableNo}` : '-', items: b.order?.orderItems?.length || '-', payment: getBillPaymentMethod(b), subtotal: b.subtotal || 0, tax: b.taxAmount || 0, discount: b.discount || 0, total: b.grandTotal || 0, status: b.status }))}
                dateRange={dateRange}
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead className="bg-slate-50">
                <tr>
                  {['Bill No', 'Order', 'Date', 'Table', 'Items', 'Payment', 'Subtotal', 'Tax', 'Discount', 'Total', 'Status'].map(h => (
                    <th key={h} className={`py-2.5 px-3 text-[9px] font-bold uppercase text-slate-500 ${['Subtotal', 'Tax', 'Discount', 'Total'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedBills.map((b, i) => (
                  <tr key={b.id || i} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-bold text-slate-700 font-mono">#{b.billNo || b.id}</td>
                    <td className="py-2.5 px-3 text-slate-500 font-mono">{b.order?.orderNo || '-'}</td>
                    <td className="py-2.5 px-3 text-slate-500 text-[9px]">{formatDateVal(b.createdAt)}</td>
                    <td className="py-2.5 px-3 text-slate-600">{b.order?.table?.tableNo ? `T${b.order.table.tableNo}` : '-'}</td>
                    <td className="py-2.5 px-3 text-center font-mono">{b.order?.orderItems?.length || '-'}</td>
                    <td className="py-2.5 px-3 text-center"><span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">{getBillPaymentMethod(b)}</span></td>
                    <td className="py-2.5 px-3 text-right font-mono">{formatCurrencyVal(b.subtotal || 0)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-500">{formatCurrencyVal(b.taxAmount || 0)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-red-500">{b.discount > 0 ? formatCurrencyVal(b.discount) : '-'}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">{formatCurrencyVal(b.grandTotal || 0)}</td>
                    <td className="py-2.5 px-3"><span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${b.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{b.status}</span></td>
                  </tr>
                ))}
                {paginatedBills.length === 0 && <tr><td colSpan={11} className="py-10 text-center text-slate-400 italic">No sales data</td></tr>}
              </tbody>
            </table>
          </div>
          {totalBillPages > 1 && (
            <div className="px-4 py-2.5 border-t border-slate-100 flex items-center justify-between text-[10px]">
              <span className="text-slate-500">Page {currentPage} of {totalBillPages}</span>
              <div className="flex items-center gap-1">
                <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-1.5 hover:bg-slate-100 rounded-lg disabled:opacity-30 cursor-pointer"><ChevronLeft className="w-3.5 h-3.5" /></button>
                {Array.from({ length: Math.min(totalBillPages, 5) }, (_, i) => {
                  const start = Math.max(1, Math.min(currentPage - 2, totalBillPages - 4));
                  const page = start + i;
                  if (page > totalBillPages) return null;
                  return <button key={page} onClick={() => setCurrentPage(page)} className={`w-6 h-6 rounded-lg text-[10px] font-bold cursor-pointer ${page === currentPage ? 'bg-[#16A34A] text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{page}</button>;
                })}
                <button disabled={currentPage === totalBillPages} onClick={() => setCurrentPage(p => p + 1)} className="p-1.5 hover:bg-slate-100 rounded-lg disabled:opacity-30 cursor-pointer"><ChevronRight className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ Item-wise Sales ═══ */}
      {subTab === 'items' && (
        <div className="bg-white rounded-[18px] border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-2">
            <p className="text-xs font-extrabold text-slate-800">Item-wise Sales ({filteredItems.length})</p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input type="text" placeholder="Search items..." value={itemSearchQuery} onChange={e => setItemSearchQuery(e.target.value)}
                  className="w-44 pl-8 pr-2.5 h-8 bg-slate-50 border border-slate-200 rounded-lg text-[10px] outline-none focus:border-[#16A34A]" />
              </div>
              <select value={itemCategoryFilter} onChange={e => setItemCategoryFilter(e.target.value)}
                className="h-8 px-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-semibold text-slate-600 outline-none">
                <option value="all">All Categories</option>
                {categoryFilterOptions.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </select>
              <ReportExportBar
                title="Item-wise Sales"
                columns={[{ key: 'itemName', label: 'Item' }, { key: 'category', label: 'Category' }, { key: 'quantitySold', label: 'Qty Sold', format: 'number' }, { key: 'orderCount', label: 'Orders', format: 'number' }, { key: 'revenue', label: 'Revenue', format: 'currency' }, { key: 'averageSellingPrice', label: 'Avg Price', format: 'currency' }, { key: 'percentageOfTotalSales', label: '% of Sales' }]}
                data={filteredItems.map(i => ({ ...i, percentageOfTotalSales: (i.percentageOfTotalSales || 0).toFixed(1) + '%' }))}
                dateRange={dateRange}
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead className="bg-slate-50">
                <tr>
                  {['Item', 'Category', 'Qty Sold', 'Orders', 'Revenue', 'Avg Price', '% of Sales'].map(h => (
                    <th key={h} className={`py-2.5 px-2.5 text-[9px] font-bold uppercase text-slate-500 ${['Revenue', 'Avg Price', '% of Sales'].includes(h) ? 'text-right' : ['Qty Sold', 'Orders'].includes(h) ? 'text-center' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((i, idx) => (
                  <tr key={i.menuItemId || idx} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2 px-2.5 font-bold text-slate-700">
                      <span className="flex items-center gap-2">
                        <img src={i.image || PLACEHOLDER_IMAGE} alt={i.itemName} onError={e => { e.target.src = PLACEHOLDER_IMAGE; }} className="w-7 h-7 rounded object-cover shrink-0 bg-white border border-slate-200" loading="lazy" />
                        <span className="truncate max-w-[160px]">{i.itemName}</span>
                      </span>
                    </td>
                    <td className="py-2 px-2.5 text-slate-500">{i.category || '-'}</td>
                    <td className="py-2 px-2.5 text-center font-mono">{i.quantitySold || 0}</td>
                    <td className="py-2 px-2.5 text-center font-mono">{i.orderCount || 0}</td>
                    <td className="py-2 px-2.5 text-right font-mono font-bold text-slate-800">{formatCurrencyVal(i.revenue || 0)}</td>
                    <td className="py-2 px-2.5 text-right font-mono text-slate-600">{formatCurrencyVal(i.averageSellingPrice || 0)}</td>
                    <td className="py-2 px-2.5 text-right"><span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{(i.percentageOfTotalSales || 0).toFixed(1)}%</span></td>
                  </tr>
                ))}
                {paginatedItems.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-slate-400 italic">No item data</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ Category-wise ═══ */}
      {subTab === 'categories' && (
        <div className="bg-white rounded-[18px] border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-xs font-extrabold text-slate-800">Category-wise Sales ({categorySales.length})</p>
            <ReportExportBar
              title="Category-wise Sales"
              columns={[{ key: 'categoryName', label: 'Category' }, { key: 'quantitySold', label: 'Items Sold', format: 'number' }, { key: 'orderCount', label: 'Orders', format: 'number' }, { key: 'revenue', label: 'Revenue', format: 'currency' }, { key: 'percentageOfTotalSales', label: '% of Sales' }, { key: 'averageItemPrice', label: 'Avg Price', format: 'currency' }]}
              data={categorySales.map(c => ({ ...c, percentageOfTotalSales: (c.percentageOfTotalSales || 0).toFixed(1) + '%' }))}
              dateRange={dateRange}
              summaryRow={{ categoryName: 'TOTAL', quantitySold: catTotals.quantitySold, orderCount: catTotals.orderCount, revenue: catTotals.revenue, percentageOfTotalSales: '100%', averageItemPrice: catTotals.quantitySold > 0 ? catTotals.revenue / catTotals.quantitySold : 0 }}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead className="bg-slate-50">
                <tr>
                  {['Category', 'Items Sold', 'Orders', 'Revenue', '% of Sales', 'Avg Price'].map(h => (
                    <th key={h} className={`py-2.5 px-2 text-[9px] font-bold uppercase text-slate-500 ${['Revenue', '% of Sales', 'Avg Price'].includes(h) ? 'text-right' : ['Items Sold', 'Orders'].includes(h) ? 'text-center' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categorySales.map((c, i) => (
                  <tr key={c.categoryId || i} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2.5 px-2 font-bold text-slate-700">{c.categoryName || '-'}</td>
                    <td className="py-2.5 px-2 text-center font-mono text-slate-600">{c.quantitySold || 0}</td>
                    <td className="py-2.5 px-2 text-center font-mono text-slate-600">{c.orderCount || 0}</td>
                    <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-800">{formatCurrencyVal(c.revenue || 0)}</td>
                    <td className="py-2.5 px-2 text-right"><span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{(c.percentageOfTotalSales || 0).toFixed(1)}%</span></td>
                    <td className="py-2.5 px-2 text-right font-mono text-slate-600">{formatCurrencyVal(c.averageItemPrice || 0)}</td>
                  </tr>
                ))}
                {categorySales.length > 0 && (
                  <tr className="bg-emerald-50/60 font-bold">
                    <td className="py-2.5 px-2">TOTAL</td>
                    <td className="py-2.5 px-2 text-center font-mono">{catTotals.quantitySold}</td>
                    <td className="py-2.5 px-2 text-center font-mono">{catTotals.orderCount}</td>
                    <td className="py-2.5 px-2 text-right font-mono">{formatCurrencyVal(catTotals.revenue)}</td>
                    <td className="py-2.5 px-2 text-right"><span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-600 text-white">100%</span></td>
                    <td className="py-2.5 px-2 text-right font-mono">{catTotals.quantitySold > 0 ? formatCurrencyVal(catTotals.revenue / catTotals.quantitySold) : formatCurrencyVal(0)}</td>
                  </tr>
                )}
                {categorySales.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-slate-400 italic">No category data</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ Hourly Sales ═══ */}
      {subTab === 'hourly' && (
        <div className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#16A34A]" /> Hourly Sales Distribution
            </h4>
            <ReportExportBar
              title="Hourly Sales"
              columns={[{ key: 'hour', label: 'Hour' }, { key: 'sales', label: 'Sales', format: 'currency' }]}
              data={hourlyData.labels.map((label, i) => ({ hour: label, sales: hourlyData.datasets[0].data[i] || 0 })).filter(d => d.sales > 0)}
              dateRange={dateRange}
            />
          </div>
          <div className="h-64">
            <Bar data={hourlyData} options={{ ...chartDefaults, scales: { x: { grid: { display: false }, ticks: { font: { ...chartFont, size: 7 }, maxTicksLimit: 12 } }, y: { beginAtZero: true, ticks: { font: chartFont, callback: v => currencySymbol + v } } } }} />
          </div>
        </div>
      )}

    </div>
  );
}
