import React, { useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { LayoutGrid, TrendingUp } from 'lucide-react';
import { formatCurrency } from '../../../lib/utils';
import ReportExportBar from '../../../components/common/ReportExportBar';
import { useSettingsStore } from '../../../store';

const chartFont = { family: "'Inter', 'Segoe UI', sans-serif", size: 9 };
const chartDefaults = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } };
const STATUS_COLORS = { AVAILABLE: 'bg-emerald-100 text-emerald-800', OCCUPIED: 'bg-red-100 text-red-800', RESERVED: 'bg-blue-100 text-blue-800', CLEANING: 'bg-amber-100 text-amber-800' };

export default function TableReports({ tableSales, tableOccupancy, loading, formatCurrency: fc }) {
  const [subTab, setSubTab] = useState('sales');
  const fcVal = fc || formatCurrency;
  const { settings } = useSettingsStore();
  const currencySymbol = settings?.currencySymbol || '₹';

  if (loading) return null;

  const tables = tableSales || [];
  const occ = tableOccupancy || {};
  const occSummary = occ.summary || {};
  const occTables = occ.tables || [];

  const tableChartData = {
    labels: tables.slice(0, 10).map(t => `T${t.tableNo}`),
    datasets: [{ label: 'Sales', data: tables.slice(0, 10).map(t => t.totalSales), backgroundColor: 'rgba(22,163,74,0.7)', borderRadius: 4, borderSkipped: false }],
  };

  return (
    <div className="space-y-4">
      <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px] font-bold">
        {[{ key: 'sales', label: 'Table Sales' }, { key: 'occupancy', label: 'Table Occupancy' }].map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${subTab === t.key ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'sales' && (
        <div className="space-y-4">
          {tables.length > 0 && (
            <div className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
              <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-[#16A34A]" /> Table Sales Distribution
              </h4>
              <div className="h-48"><Bar data={tableChartData} options={{ ...chartDefaults, scales: { x: { grid: { display: false }, ticks: { font: chartFont } }, y: { beginAtZero: true, ticks: { font: chartFont, callback: v => currencySymbol + v } } } }} /></div>
            </div>
          )}
          <div className="bg-white rounded-[18px] border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between"><p className="text-xs font-extrabold text-slate-800">Table Sales ({tables.length})</p>
              <ReportExportBar title="Table Sales" columns={[{ key: 'tableNo', label: 'Table' }, { key: 'floor', label: 'Floor' }, { key: 'orderCount', label: 'Orders', format: 'number' }, { key: 'totalSales', label: 'Total Sales', format: 'currency' }, { key: 'averageBill', label: 'Avg Bill', format: 'currency' }]} data={tables.map(t => ({ tableNo: `T${t.tableNo}`, floor: t.floorName || '-', orderCount: t.orderCount || 0, totalSales: t.totalSales || 0, averageBill: t.averageBill || 0 }))} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead className="bg-slate-50">
                  <tr>
                    {['Table', 'Floor', 'Orders', 'Total Sales', 'Avg Bill'].map(h => (
                      <th key={h} className={`py-2.5 px-3 text-[9px] font-bold uppercase text-slate-500 ${['Total Sales', 'Avg Bill'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tables.map((t, i) => (
                    <tr key={t.tableId || i} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-bold text-slate-700">T{t.tableNo}</td>
                      <td className="py-2.5 px-3 text-slate-500">{t.floorName}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{t.orderCount}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">{fcVal(t.totalSales)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">{fcVal(t.averageBill)}</td>
                    </tr>
                  ))}
                  {tables.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-slate-400 italic">No table sales data</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {subTab === 'occupancy' && (
        <div className="space-y-4">
          <div className="flex justify-end"><ReportExportBar title="Table Occupancy" columns={[{ key: 'tableNo', label: 'Table' }, { key: 'status', label: 'Status' }, { key: 'seats', label: 'Seats', format: 'number' }]} data={occTables.map(t => ({ tableNo: `T${t.tableNo || t.number}`, status: t.status || '-', seats: t.capacity || t.seats || 0 }))} kpis={[{ label: 'Total Tables', value: occSummary.total || 0 }, { label: 'Available', value: occSummary.available || 0 }, { label: 'Occupied', value: occSummary.occupied || 0 }]} /></div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Tables', value: occSummary.total || 0, color: 'slate' },
              { label: 'Available', value: occSummary.available || 0, color: 'emerald' },
              { label: 'Occupied', value: occSummary.occupied || 0, color: 'red' },
              { label: 'Reserved', value: (occSummary.reserved || 0) + (occSummary.cleaning || 0), color: 'amber' },
            ].map((kpi, idx) => (
              <div key={idx} className={`bg-white rounded-[18px] border border-${kpi.color}-200 p-4 shadow-xs`}>
                <p className="text-[9px] font-bold uppercase text-slate-500 tracking-wider mb-2">{kpi.label}</p>
                <p className={`text-lg font-extrabold text-${kpi.color}-600`}>{kpi.value}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-[18px] border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100"><p className="text-xs font-extrabold text-slate-800">All Tables ({occTables.length})</p></div>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead className="bg-slate-50">
                  <tr>
                    {['Table', 'Floor', 'Capacity', 'Status'].map(h => <th key={h} className="py-2.5 px-3 text-[9px] font-bold uppercase text-slate-500 text-left">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {occTables.map((t, i) => (
                    <tr key={t.id || i} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-bold text-slate-700">T{t.tableNo}</td>
                      <td className="py-2.5 px-3 text-slate-500">{t.floorName}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{t.capacity}</td>
                      <td className="py-2.5 px-3"><span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-600'}`}>{t.status}</span></td>
                    </tr>
                  ))}
                  {occTables.length === 0 && <tr><td colSpan={4} className="py-10 text-center text-slate-400 italic">No table data</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
