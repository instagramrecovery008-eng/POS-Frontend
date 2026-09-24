import React, { useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Users, Activity, Tag } from 'lucide-react';
import { formatCurrency } from '../../../lib/utils';
import ReportExportBar from '../../../components/common/ReportExportBar';
import { useSettingsStore } from '../../../store';
import { getRoleDisplayName } from '../../../utils/permissions';

const chartFont = { family: "'Inter', 'Segoe UI', sans-serif", size: 9 };
const chartDefaults = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } };

export default function StaffReports({ staffSales, staffActivity, staffDiscountCancellation, loading, formatCurrency: fc }) {
  const [subTab, setSubTab] = useState('sales');
  const fcVal = fc || formatCurrency;
  const { settings } = useSettingsStore();
  const currencySymbol = settings?.currencySymbol || '₹';

  if (loading) return null;

  const sales = staffSales || [];
  const activity = staffActivity || [];
  const dc = staffDiscountCancellation || {};
  const discounts = dc.discounts || [];
  const cancellations = dc.cancellations || [];

  const staffChartData = {
    labels: sales.slice(0, 8).map(s => s.name),
    datasets: [{ label: 'Sales', data: sales.slice(0, 8).map(s => s.totalSales), backgroundColor: 'rgba(22,163,74,0.7)', borderRadius: 4, borderSkipped: false }],
  };

  return (
    <div className="space-y-4">
      <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px] font-bold">
        {[{ key: 'sales', label: 'Staff Sales' }, { key: 'activity', label: 'Staff Activity' }, { key: 'dc', label: 'Discount/Cancellation' }].map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${subTab === t.key ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'sales' && (
        <div className="space-y-4">
          {sales.length > 0 && (
            <div className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
              <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#16A34A]" /> Staff Sales Performance
              </h4>
              <div className="h-48"><Bar data={staffChartData} options={{ ...chartDefaults, scales: { x: { grid: { display: false }, ticks: { font: chartFont } }, y: { beginAtZero: true, ticks: { font: chartFont, callback: v => currencySymbol + v } } } }} /></div>
            </div>
          )}
          <div className="bg-white rounded-[18px] border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between"><p className="text-xs font-extrabold text-slate-800">Staff Sales ({sales.length})</p>
              <ReportExportBar title="Staff Sales" columns={[{ key: 'name', label: 'Staff' }, { key: 'role', label: 'Role' }, { key: 'orderCount', label: 'Orders', format: 'number' }, { key: 'totalSales', label: 'Total Sales', format: 'currency' }, { key: 'averageOrder', label: 'Avg Order', format: 'currency' }]} data={sales.map(s => ({ ...s, role: getRoleDisplayName(s.role) || s.role }))} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead className="bg-slate-50">
                  <tr>
                    {['Staff', 'Role', 'Orders', 'Total Sales', 'Avg Order'].map(h => (
                      <th key={h} className={`py-2.5 px-3 text-[9px] font-bold uppercase text-slate-500 ${['Total Sales', 'Avg Order'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s, i) => (
                    <tr key={s.staffId || i} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-bold text-slate-700">{s.name}</td>
                      <td className="py-2.5 px-3"><span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">{getRoleDisplayName(s.role)}</span></td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{s.orders}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">{fcVal(s.totalSales)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">{fcVal(s.averageOrder)}</td>
                    </tr>
                  ))}
                  {sales.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-slate-400 italic">No staff sales data</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {subTab === 'activity' && (
        <div className="bg-white rounded-[18px] border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-blue-600" />
              <p className="text-xs font-extrabold text-slate-800">Staff Activity ({activity.length})</p>
            </div>
            <ReportExportBar title="Staff Activity" columns={[{ key: 'name', label: 'Staff' }, { key: 'role', label: 'Role' }, { key: 'ordersServed', label: 'Orders Served', format: 'number' }, { key: 'totalSales', label: 'Total Sales', format: 'currency' }, { key: 'lastActive', label: 'Last Active' }]} data={activity.map(a => ({ name: a.name || '-', role: getRoleDisplayName(a.role) || '-', ordersServed: a.ordersServed || a.orderCount || 0, totalSales: a.totalSales || 0, lastActive: a.lastActive || '-' }))} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="py-2.5 px-3 text-[9px] font-bold uppercase text-slate-500 text-left">Staff</th>
                  <th className="py-2.5 px-3 text-[9px] font-bold uppercase text-slate-500 text-left">Role</th>
                  <th className="py-2.5 px-3 text-[9px] font-bold uppercase text-slate-500 text-left">Activity Breakdown</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((a, i) => (
                  <tr key={a.staffId || i} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-bold text-slate-700">{a.name}</td>
                    <td className="py-2.5 px-3"><span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">{getRoleDisplayName(a.role)}</span></td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(a.actions || {}).map(([key, count]) => (
                          <span key={key} className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700">{key}: {count}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
                {activity.length === 0 && <tr><td colSpan={3} className="py-10 text-center text-slate-400 italic">No activity data</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'dc' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-[18px] border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tag className="w-3.5 h-3.5 text-purple-600" />
                <p className="text-xs font-extrabold text-slate-800">Discount by Staff ({discounts.length})</p>
              </div>
              <ReportExportBar title="Discount/Cancellation Activity" columns={[{ key: 'name', label: 'Staff' }, { key: 'discountCount', label: 'Discounts', format: 'number' }, { key: 'totalAmount', label: 'Total Amount', format: 'currency' }]} data={discounts.map(d => ({ name: d.name || '-', discountCount: d.count || d.discountCount || 0, totalAmount: d.totalAmount || d.amount || 0 }))} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead className="bg-slate-50">
                  <tr>
                    {['Staff', 'Discounts', 'Total Amount'].map(h => (
                      <th key={h} className={`py-2.5 px-3 text-[9px] font-bold uppercase text-slate-500 ${h === 'Total Amount' ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {discounts.map((d, i) => (
                    <tr key={d.staffId || i} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-bold text-slate-700">{d.name || 'Unknown'}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{d.discountCount}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-red-600">{fcVal(d.totalDiscount)}</td>
                    </tr>
                  ))}
                  {discounts.length === 0 && <tr><td colSpan={3} className="py-10 text-center text-slate-400 italic">No discount data</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div className="bg-white rounded-[18px] border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <Tag className="w-3.5 h-3.5 text-red-600" />
              <p className="text-xs font-extrabold text-slate-800">Cancellations by Staff ({cancellations.length})</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead className="bg-slate-50">
                  <tr>
                    {['Staff', 'Cancellations'].map(h => <th key={h} className="py-2.5 px-3 text-[9px] font-bold uppercase text-slate-500 text-left">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {cancellations.map((c, i) => (
                    <tr key={c.staffId || i} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-bold text-slate-700">{c.name || 'Unknown'}</td>
                      <td className="py-2.5 px-3 font-mono text-red-600 font-bold">{c.cancelCount}</td>
                    </tr>
                  ))}
                  {cancellations.length === 0 && <tr><td colSpan={2} className="py-10 text-center text-slate-400 italic">No cancellation data</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
