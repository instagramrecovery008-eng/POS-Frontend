import React, { useState, useMemo } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import { formatCurrency, formatDate, formatTime } from '../../../lib/utils';
import { ShoppingBag, CheckCircle, Clock, XCircle, Timer, BarChart3, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import ReportExportBar from '../../../components/common/ReportExportBar';
import { useSettingsStore } from '../../../store';
import { getBusinessCapabilities } from '../../../utils/businessCapabilities';

const chartFont = { family: "'Inter', 'Segoe UI', sans-serif", size: 9 };
const chartDefaults = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { titleFont: chartFont, bodyFont: { ...chartFont, size: 10 } } } };
const STATUS_COLORS = { COMPLETED: '#16A34A', PREPARING: '#2563EB', READY: '#D97706', PENDING: '#64748B', CANCELLED: '#DC2626' };

export default function OrderReports({ orderReportData, cancellationData, loading, formatCurrency: fc, formatDate: fd, formatTime: ft }) {
  // §7/§8/§11: kitchen/order-workflow terminology ONLY for kitchen-capable
  // businesses (server-resolved capability, never a businessType check).
  // Retail tenants get a direct-sales view: no Pending/Preparing/Ready states,
  // no "Order Status" restaurant doughnut — real data only.
  const { settings } = useSettingsStore();
  const businessCaps = settings.capabilities || getBusinessCapabilities(settings.businessType);
  const isKitchenBusiness = businessCaps.kitchen === true;
  const showTablesColumn = businessCaps.tables === true;
  const [subTab, setSubTab] = useState('register');
  const [orderPage, setOrderPage] = useState(1);
  const orderPageSize = 10;

  const fcVal = fc || formatCurrency;
  const fdVal = fd || formatDate;
  const ftVal = ft || formatTime;

  const allSubTabs = [
    { key: 'register', label: 'Order Register' },
    { key: 'completed', label: 'Completed' },
    // §7: "Pending" represents the kitchen/order workflow — retail Basic POS
    // has no pending/held transaction feature, so the tab is removed there.
    { key: 'pending', label: 'Pending', kitchenOnly: true },
    { key: 'cancelled', label: 'Cancelled' },
    { key: 'type', label: 'Order Type' },
  ];
  const subTabs = allSubTabs.filter((t) => !t.kitchenOnly || isKitchenBusiness);

  const summary = orderReportData?.summary || {};
  const orders = orderReportData?.orders || [];
  const cancellationSummary = cancellationData?.summary || {};
  const cancellationOrders = cancellationData?.orders || [];

  const orderStatusSummary = useMemo(() => ({
    COMPLETED: summary.completedCount || 0,
    PREPARING: summary.preparingCount || 0,
    READY: summary.readyCount || 0,
    PENDING: summary.pendingCount || 0,
    CANCELLED: summary.cancelledCount || 0,
  }), [summary]);

  // §11: restaurant businesses keep the Order Status doughnut (kitchen
  // workflow states). Retail gets a real-data "Sales Outcome" doughnut built
  // from the SAME full-range summary the backend already returns — completed
  // vs cancelled sales. No fabricated states, no new API.
  const orderStatusChartData = useMemo(() => {
    if (!isKitchenBusiness) {
      return {
        labels: ['Completed', 'Cancelled'],
        datasets: [{ data: [orderStatusSummary.COMPLETED, orderStatusSummary.CANCELLED],
          backgroundColor: [STATUS_COLORS.COMPLETED, STATUS_COLORS.CANCELLED],
          borderWidth: 0, cutout: '65%' }],
      };
    }
    return {
      labels: ['Completed', 'Preparing', 'Ready', 'Pending', 'Cancelled'],
      datasets: [{ data: [orderStatusSummary.COMPLETED, orderStatusSummary.PREPARING, orderStatusSummary.READY, orderStatusSummary.PENDING, orderStatusSummary.CANCELLED],
        backgroundColor: [STATUS_COLORS.COMPLETED, STATUS_COLORS.PREPARING, STATUS_COLORS.READY, STATUS_COLORS.PENDING, STATUS_COLORS.CANCELLED],
        borderWidth: 0, cutout: '65%' }],
    };
  }, [orderStatusSummary, isKitchenBusiness]);

  // Filter orders by status for sub-tabs
  const filteredOrders = useMemo(() => {
    if (subTab === 'completed') return orders.filter(o => o.status === 'COMPLETED');
    if (subTab === 'pending') return orders.filter(o => ['PENDING', 'PREPARING', 'READY'].includes(o.status));
    if (subTab === 'cancelled') return cancellationOrders; // Use dedicated cancellation report data
    return orders; // 'register' shows all
  }, [orders, cancellationOrders, subTab]);

  // Order Type aggregation
  const orderTypeData = useMemo(() => {
    const types = {};
    orders.forEach(o => {
      const t = o.orderType || 'Unknown';
      if (!types[t]) types[t] = { type: t, count: 0, totalSales: 0 };
      types[t].count += 1;
      types[t].totalSales += Number(o.totalAmount || 0);
    });
    return Object.values(types).sort((a, b) => b.count - a.count);
  }, [orders]);

  if (loading) return null;

  return (
    <div className="space-y-4">
      <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px] font-bold overflow-x-auto no-scrollbar">
        {subTabs.map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer shrink-0 ${subTab === t.key ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* KPI Cards — §7: restaurant workflow states only where the kitchen
          capability exists. Retail sees Completed / Cancelled / In Progress
          with real counts, never a kitchen "Pending" card. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Completed', value: orderStatusSummary.COMPLETED, icon: CheckCircle, color: 'border-emerald-200', textColor: 'text-[#16A34A]' },
          ...(isKitchenBusiness ? [{ label: 'Pending', value: orderStatusSummary.PENDING, icon: Clock, color: 'border-slate-200', textColor: 'text-slate-600' }] : []),
          { label: 'Cancelled', value: orderStatusSummary.CANCELLED, icon: XCircle, color: 'border-red-200', textColor: 'text-red-600' },
          // §9: "Kitchen" is food terminology — retail sees the neutral "In Progress"
          { label: isKitchenBusiness ? 'Kitchen' : 'In Progress', value: orderStatusSummary.PREPARING + orderStatusSummary.READY, icon: Timer, color: 'border-blue-200', textColor: 'text-blue-600' },
        ].map((kpi, idx) => (
          <div key={idx} className={`bg-white rounded-[18px] border ${kpi.color} p-4 shadow-xs`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] font-bold uppercase text-slate-500 tracking-wider">{kpi.label}</p>
              <kpi.icon className={`w-4 h-4 opacity-40 ${kpi.textColor}`} />
            </div>
            <p className={`text-2xl font-extrabold ${kpi.textColor}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
          <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-blue-600" /> {isKitchenBusiness ? 'Order Status' : 'Sales Outcome'}
          </h4>
          <div className="h-48 flex items-center justify-center">
            <Doughnut data={orderStatusChartData} options={{ ...chartDefaults, cutout: '60%', plugins: { ...chartDefaults.plugins, legend: { display: true, position: 'right', labels: { font: chartFont, color: '#475569', boxWidth: 10, padding: 8 } } } }} />
          </div>
        </div>
        {subTab === 'type' && (
          <div className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
            <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider mb-3">Orders by Type</h4>
            <div className="space-y-2">
              {orderTypeData.map(t => (
                <div key={t.type} className="flex items-center justify-between bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-700">{t.type}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-slate-600">{t.count} orders</span>
                    <span className="text-[10px] font-mono font-bold text-slate-800">{fcVal(t.totalSales)}</span>
                  </div>
                </div>
              ))}
              {orderTypeData.length === 0 && <p className="text-center text-slate-400 text-xs italic py-4">No order data</p>}
            </div>
          </div>
        )}
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-[18px] border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <p className="text-xs font-extrabold text-slate-800">{filteredOrders.length} orders</p>
          <ReportExportBar
            title={subTab === 'completed' ? 'Completed Orders' : subTab === 'pending' ? 'Pending Orders' : subTab === 'cancelled' ? 'Cancelled Orders' : subTab === 'type' ? 'Order Type Report' : 'Order Register'}
            columns={[
              { key: 'orderNo', label: 'Order No' }, { key: 'date', label: 'Date/Time' }, { key: 'orderType', label: 'Type' },
              // §7: Table column only for table-capable businesses
              ...(showTablesColumn ? [{ key: 'table', label: 'Table' }] : []),
              { key: 'customer', label: 'Customer' }, { key: 'itemsCount', label: 'Items', format: 'number' }, { key: 'status', label: 'Status' }, { key: 'subtotal', label: 'Subtotal', format: 'currency' }, { key: 'discount', label: 'Discount', format: 'currency' }, { key: 'taxAmount', label: 'Tax', format: 'currency' }, { key: 'totalAmount', label: 'Total', format: 'currency' }, { key: 'payment', label: 'Payment' }]
            }
            data={filteredOrders.map(o => ({ orderNo: `#${o.orderNo || o.id}`, date: `${fdVal(o.createdAt)} ${ftVal(o.createdAt)}`, orderType: o.orderType || '-', table: o.table?.tableNo ? `T${o.table.tableNo}` : (o.orderType === 'TAKEAWAY' ? 'TW' : '-'), customer: o.customer?.name || '-', itemsCount: o.itemsCount || '-', status: o.status, subtotal: o.subtotal || 0, discount: o.discount || 0, taxAmount: o.taxAmount || 0, totalAmount: o.totalAmount || 0, payment: o.bill?.paymentMethod || '-' }))}
            dateRange={{}}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead className="bg-slate-50">
              <tr>
                {['Order No', 'Date/Time', 'Type', ...(showTablesColumn ? ['Table'] : []), 'Customer', 'Items', 'Status', 'Subtotal', 'Discount', 'Tax', 'Total', 'Payment'].map(h => (
                  <th key={h} className={`py-2.5 px-3 text-[9px] font-bold uppercase text-slate-500 ${['Subtotal', 'Discount', 'Tax', 'Total'].includes(h) ? 'text-right' : ['Items', 'Status'].includes(h) ? 'text-center' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((o, idx) => (
                <tr key={o.id || idx} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2.5 px-3 font-bold text-slate-700 font-mono">#{o.orderNo || o.id}</td>
                  <td className="py-2.5 px-3 text-slate-500 text-[9px]">
                    <div>{fdVal(o.createdAt)}</div>
                    <div className="text-slate-400">{ftVal(o.createdAt)}</div>
                  </td>
                  <td className="py-2.5 px-3"><span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">{o.orderType || '-'}</span></td>
                  {showTablesColumn && <td className="py-2.5 px-3 text-slate-600">{o.table?.tableNo ? `T${o.table.tableNo}` : (o.orderType === 'TAKEAWAY' ? 'TW' : '-')}</td>}
                  <td className="py-2.5 px-3 text-slate-600 text-[9px]">{o.customer?.name || '-'}</td>
                  <td className="py-2.5 px-3 text-center font-mono text-slate-600">{o.itemsCount || '-'}</td>
                  <td className="py-2.5 px-3 text-center">
                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${o.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' : o.status === 'CANCELLED' ? 'bg-red-100 text-red-800' : o.status === 'PREPARING' ? 'bg-blue-100 text-blue-800' : o.status === 'READY' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{o.status}</span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-600">{fcVal(o.subtotal || 0)}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-green-600">{o.discount > 0 ? `-${fcVal(o.discount)}` : '-'}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-500">{fcVal(o.taxAmount || 0)}</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">{fcVal(o.totalAmount || 0)}</td>
                  <td className="py-2.5 px-3 text-center"><span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">{o.bill?.paymentMethod || '-'}</span></td>
                </tr>
              ))}
              {filteredOrders.length === 0 && <tr><td colSpan={showTablesColumn ? 12 : 11} className="py-10 text-center text-slate-400 italic">No orders found</td></tr>}
            </tbody>
          </table>
        </div>
        {orderReportData?.pagination && orderReportData.pagination.totalPages > 1 && (
          <div className="px-4 py-2.5 border-t border-slate-100 flex items-center justify-between text-[10px]">
            <span className="text-slate-500">Page {orderReportData.pagination.page} of {orderReportData.pagination.totalPages}</span>
            <div className="flex items-center gap-1">
              <button disabled={orderPage <= 1} onClick={() => setOrderPage(p => Math.max(1, p - 1))} className="p-1.5 hover:bg-slate-100 rounded-lg disabled:opacity-30 cursor-pointer"><ChevronLeft className="w-3.5 h-3.5" /></button>
              <button disabled={orderPage >= orderReportData.pagination.totalPages} onClick={() => setOrderPage(p => p + 1)} className="p-1.5 hover:bg-slate-100 rounded-lg disabled:opacity-30 cursor-pointer"><ChevronRight className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
