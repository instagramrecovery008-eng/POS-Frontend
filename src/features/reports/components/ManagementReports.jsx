import React, { useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Calendar, BarChart3, TrendingUp, ChefHat, DollarSign, ShoppingBag, CreditCard, Clock, FileText, AlertTriangle, Package } from 'lucide-react';
import { formatCurrency, formatDate } from '../../../lib/utils';
import ReportExportBar from '../../../components/common/ReportExportBar';
import { useSettingsStore } from '../../../store';
import { getBusinessCapabilities } from '../../../utils/businessCapabilities';

const chartFont = { family: "'Inter', 'Segoe UI', sans-serif", size: 9 };
const chartDefaults = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } };

function EmptyState({ message = 'No data available for the selected period.' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
        <BarChart3 className="w-6 h-6 text-slate-300" />
      </div>
      <p className="text-xs font-semibold text-slate-400">{message}</p>
    </div>
  );
}

function KpiCard({ label, value, color, icon: Icon }) {
  return (
    <div className={`bg-${color}-50 rounded-xl p-3 border border-${color}-100`}>
      <div className="flex items-center gap-1.5 mb-1">
        {Icon && <Icon className={`w-3 h-3 text-${color}-600`} />}
        <p className="text-[9px] font-bold uppercase text-slate-500">{label}</p>
      </div>
      <p className={`text-sm font-extrabold text-${color}-700`}>{value}</p>
    </div>
  );
}

export default function ManagementReports({ dailyClosing, restaurantPerformance, loading, formatCurrency: fc, formatDate: fd, dateRange }) {
  const [subTab, setSubTab] = useState('dailyClosing');
  const fcVal = fc || formatCurrency;
  const fdVal = fd || formatDate;
  // §4: the Kitchen card (Total/Completed/Pending/Cancelled KOTs) renders only
  // for kitchen-capable businesses — retail sees the generic metrics only.
  const { settings } = useSettingsStore();
  const showKitchen = (settings.capabilities || getBusinessCapabilities(settings.businessType)).kitchen === true;

  if (loading) return null;

  const dc = dailyClosing || {};
  const dcRevenue = dc.revenue || {};
  const dcOrders = dc.orders || {};
  const dcPayments = dc.payments || {};
  const dcKitchen = dc.kitchen || {};
  const dcTopItems = dc.topItems || [];

  const perf = restaurantPerformance || {};
  const perfHourly = (perf.hourlySales?.hours || []);
  const perfCancellation = perf.cancellation || {};
  const perfCancellationSummary = perfCancellation.summary || {};
  const perfCategoryPerformance = perf.categoryPerformance || [];

  const perfHourlyData = {
    labels: perfHourly.map(h => h.label),
    datasets: [{ label: 'Sales', data: perfHourly.map(h => h.sales), backgroundColor: perfHourly.map(h => h.sales > 0 ? 'rgba(37,99,235,0.7)' : 'rgba(226,232,240,0.3)'), borderRadius: 4, borderSkipped: false }],
  };

  const hasDailyData = dc.date || dcRevenue.grossSales > 0 || dcOrders.total > 0;
  
  const hasPerfData = perfHourly.length > 0 || perfCategoryPerformance.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px] font-bold overflow-x-auto no-scrollbar">
        {[{ key: 'dailyClosing', label: 'Daily Closing' }, { key: 'performance', label: 'Performance' }].map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer shrink-0 ${subTab === t.key ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'dailyClosing' && (
        <div className="space-y-4">
          {!hasDailyData ? (
            <EmptyState message="No daily closing data available for the selected date." />
          ) : (
            <>
              <div className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[#16A34A]" /> Daily Closing — {dc.date || 'Today'}
                  </h4>
                  <ReportExportBar title="Daily Closing" columns={[{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value' }]} data={[{ metric: 'Gross Sales', value: fcVal(dcRevenue.grossSales || 0) }, { metric: 'Total Bills', value: dcRevenue.totalBills || 0 }, { metric: 'Total Orders', value: dcOrders.total || 0 }, { metric: 'Completed', value: dcOrders.completed || 0 }, { metric: 'Cancelled', value: dcOrders.cancelled || 0 }, { metric: 'Total Tax', value: fcVal(dcRevenue.totalTax || 0) }, { metric: 'Total Discount', value: fcVal(dcRevenue.totalDiscount || 0) }, { metric: 'Avg Bill Value', value: fcVal(dcRevenue.averageBillValue || 0) }]} dateRange={dateRange} />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <KpiCard label="Gross Sales" value={fcVal(dcRevenue.grossSales || 0)} color="emerald" icon={DollarSign} />
                  <KpiCard label="Total Bills" value={dcRevenue.totalBills || 0} color="blue" icon={FileText} />
                  <KpiCard label="Total Orders" value={dcOrders.total || 0} color="slate" icon={ShoppingBag} />
                  <KpiCard label="Completed" value={dcOrders.completed || 0} color="emerald" icon={ShoppingBag} />
                  <KpiCard label="Cancelled" value={dcOrders.cancelled || 0} color="red" icon={ShoppingBag} />
                  <KpiCard label="Total Tax" value={fcVal(dcRevenue.totalTax || 0)} color="slate" icon={DollarSign} />
                  <KpiCard label="Total Discount" value={fcVal(dcRevenue.totalDiscount || 0)} color="purple" icon={DollarSign} />
                  <KpiCard label="Avg Bill Value" value={fcVal(dcRevenue.averageBillValue || 0)} color="amber" icon={TrendingUp} />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
                  <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-blue-600" /> Payments
                  </h4>
                  <div className="space-y-2">
                    {Object.entries(dcPayments).map(([method, amount]) => (
                      <div key={method} className="flex items-center justify-between bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                        <span className="text-[10px] font-bold text-slate-600">{method}</span>
                        <span className="text-[10px] font-mono font-bold text-slate-800">{fcVal(amount)}</span>
                      </div>
                    ))}
                    {Object.keys(dcPayments).length === 0 && <p className="text-center text-slate-400 text-xs italic">No payments recorded</p>}
                  </div>
                </div>

                {/* §4: Kitchen KOT card — kitchen-capable businesses only */}
                {showKitchen && (
                <div className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
                  <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <ChefHat className="w-3.5 h-3.5 text-amber-600" /> Kitchen
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Total KOTs', value: dcKitchen.totalKots || 0 },
                      { label: 'Completed', value: dcKitchen.completed || 0 },
                      { label: 'Pending', value: dcKitchen.pending || 0 },
                      { label: 'Cancelled', value: dcKitchen.cancelled || 0 },
                    ].map((k, i) => (
                      <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100 text-center">
                        <p className="text-[9px] font-bold uppercase text-slate-400">{k.label}</p>
                        <p className="text-sm font-extrabold text-slate-800">{k.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
                )}
              </div>

              {dcTopItems.length > 0 && (
                <div className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
                  <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider mb-3">Top Items Today</h4>
                  <div className="space-y-1.5">
                    {dcTopItems.slice(0, 5).map((item, i) => (
                      <div key={i} className="flex items-center justify-between bg-slate-50 rounded-lg p-2 border border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold text-slate-400 w-4">{i + 1}.</span>
                          <span className="text-[10px] font-bold text-slate-700">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[9px] font-mono text-slate-500">{item.quantity} sold</span>
                          <span className="text-[10px] font-mono font-bold text-slate-800">{fcVal(item.revenue)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      

      {subTab === 'performance' && (
        <div className="space-y-4">
          {!hasPerfData ? (
            <EmptyState message="No performance data available for the selected period." />
          ) : (
            <>
              <div className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-[#16A34A]" /> Restaurant Performance Overview
                  </h4>
                  <ReportExportBar title="Restaurant Performance" columns={[{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value' }]} data={[{ metric: 'Total Sales', value: fcVal(perf.totalSales || perf.summary?.totalSales || 0) }, { metric: 'Total Orders', value: perf.totalOrders || perf.summary?.totalOrders || 0 }, { metric: 'Items Sold', value: perf.totalItemsSold || perf.summary?.totalItemsSold || 0 }]} dateRange={dateRange} />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <KpiCard label="Total Sales" value={fcVal(perf.totalSales || perf.summary?.totalSales || 0)} color="emerald" icon={DollarSign} />
                  <KpiCard label="Total Orders" value={perf.totalOrders || perf.summary?.totalOrders || 0} color="blue" icon={ShoppingBag} />
                  <KpiCard label="Items Sold" value={perf.totalItemsSold || perf.summary?.totalItemsSold || 0} color="orange" icon={Package} />
                  <KpiCard label="AOV" value={fcVal(perf.averageOrderValue || perf.summary?.averageOrderValue || 0)} color="purple" icon={TrendingUp} />
                </div>
              </div>

              {perfHourly.length > 0 && (
                <div className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
                  <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider mb-3">Hourly Sales Trend</h4>
                  <div className="h-48"><Bar data={perfHourlyData} options={{ ...chartDefaults, scales: { x: { grid: { display: false }, ticks: { font: { ...chartFont, size: 7 }, maxTicksLimit: 12 } }, y: { beginAtZero: true, ticks: { font: chartFont, callback: v => fcVal(v) } } } }} /></div>
                </div>
              )}

              {perfCategoryPerformance.length > 0 && (
                <div className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
                  <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider mb-3">Category Performance</h4>
                  <div className="space-y-1.5">
                    {perfCategoryPerformance.slice(0, 8).map((cat, i) => (
                      <div key={i} className="flex items-center justify-between bg-slate-50 rounded-lg p-2 border border-slate-100">
                        <span className="text-[10px] font-bold text-slate-700">{cat.categoryName}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-[9px] font-mono text-slate-500">{cat.quantitySold} sold</span>
                          <span className="text-[10px] font-mono font-bold text-slate-800">{fcVal(cat.revenue)}</span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{cat.contributionPercentage}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {perfCancellationSummary.totalCancelled > 0 && (
                <div className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
                  <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider mb-3">Cancellation Overview</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-red-50 rounded-xl p-3 border border-red-100 text-center">
                      <p className="text-[9px] font-bold uppercase text-red-500">Cancelled</p>
                      <p className="text-lg font-extrabold text-red-700">{perfCancellationSummary.totalCancelled || 0}</p>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-3 border border-amber-100 text-center">
                      <p className="text-[9px] font-bold uppercase text-amber-500">Rate</p>
                      <p className="text-lg font-extrabold text-amber-700">{(perfCancellationSummary.cancellationRate || 0).toFixed(1)}%</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
                      <p className="text-[9px] font-bold uppercase text-slate-500">Value Lost</p>
                      <p className="text-lg font-extrabold text-slate-700">{fcVal(perfCancellationSummary.totalCancelledValue || 0)}</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
