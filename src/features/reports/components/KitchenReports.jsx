import React, { useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Timer, ChefHat, BarChart3 } from 'lucide-react';
import { formatCurrency, formatDate, formatTime } from '../../../lib/utils';
import ReportExportBar from '../../../components/common/ReportExportBar';

const chartFont = { family: "'Inter', 'Segoe UI', sans-serif", size: 9 };
const chartDefaults = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } };

export default function KitchenReports({ kotRegister, kotSummary, kitchenPerformance, loading, formatCurrency: fc, formatDate: fd, formatTime: ft }) {
  const [subTab, setSubTab] = useState('summary');
  const fcVal = fc || formatCurrency;
  const fdVal = fd || formatDate;
  const ftVal = ft || formatTime;

  if (loading) return null;

  const summary = kotSummary?.summary || {};
  const kots = kotRegister?.kots || [];
  const perf = kitchenPerformance || {};
  const hourly = perf.hourlyVolume || [];

  const hourlyData = {
    labels: hourly.map(h => h.label),
    datasets: [{ label: 'KOTs', data: hourly.map(h => h.total), backgroundColor: 'rgba(37,99,235,0.7)', borderRadius: 4, borderSkipped: false }],
  };

  return (
    <div className="space-y-4">
      <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px] font-bold">
        {[{ key: 'summary', label: 'KOT Summary', icon: BarChart3 }, { key: 'register', label: 'KOT Register', icon: Timer }, { key: 'performance', label: 'Performance', icon: ChefHat }].map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${subTab === t.key ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}>
            <t.icon className="w-3 h-3" /> {t.label}
          </button>
        ))}
      </div>

      {subTab === 'summary' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total KOTs', value: summary.totalKots || 0, color: 'blue' },
              { label: 'Completed', value: summary.completed || 0, color: 'emerald' },
              { label: 'Pending', value: (summary.pending || 0) + (summary.preparing || 0), color: 'amber' },
              { label: 'Avg Prep Time', value: summary.averagePrepTimeMinutes != null ? `${summary.averagePrepTimeMinutes} min` : 'N/A', color: 'slate' },
            ].map((kpi, idx) => (
              <div key={idx} className={`bg-white rounded-[18px] border border-${kpi.color}-200 p-4 shadow-xs`}>
                <p className="text-[9px] font-bold uppercase text-slate-500 tracking-wider mb-2">{kpi.label}</p>
                <p className={`text-lg font-extrabold text-${kpi.color}-600`}>{kpi.value}</p>
              </div>
            ))}
          </div>
          {summary.fastestPrepTimeMinutes != null && (
            <div className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
              <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider mb-3">Preparation Time Analysis</h4>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100 text-center">
                  <p className="text-[9px] font-bold uppercase text-emerald-500">Fastest</p>
                  <p className="text-lg font-extrabold text-emerald-700">{summary.fastestPrepTimeMinutes} min</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-3 border border-blue-100 text-center">
                  <p className="text-[9px] font-bold uppercase text-blue-500">Average</p>
                  <p className="text-lg font-extrabold text-blue-700">{summary.averagePrepTimeMinutes} min</p>
                </div>
                <div className="bg-red-50 rounded-xl p-3 border border-red-100 text-center">
                  <p className="text-[9px] font-bold uppercase text-red-500">Slowest</p>
                  <p className="text-lg font-extrabold text-red-700">{summary.slowestPrepTimeMinutes} min</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {subTab === 'register' && (
        <div className="bg-white rounded-[18px] border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-xs font-extrabold text-slate-800">KOT Register ({kots.length})</p>
            <ReportExportBar
              title="KOT Register"
              columns={[{ key: 'kotNo', label: 'KOT No' }, { key: 'orderNo', label: 'Order' }, { key: 'table', label: 'Table' }, { key: 'created', label: 'Created' }, { key: 'prepTime', label: 'Prep Time' }, { key: 'status', label: 'Status' }]}
              data={kots.map(k => ({ kotNo: k.kotNo, orderNo: k.order?.orderNo || '-', table: k.order?.table?.tableNo ? `T${k.order.table.tableNo}` : '-', created: fdVal(k.createdAt), prepTime: k.prepTimeMinutes != null ? `${k.prepTimeMinutes} min` : '-', status: k.status || '-' }))}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead className="bg-slate-50">
                <tr>
                  {['KOT No', 'Order', 'Table', 'Created', 'Prep Time', 'Status'].map(h => (
                    <th key={h} className="py-2.5 px-3 text-[9px] font-bold uppercase text-slate-500 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {kots.map((k, i) => (
                  <tr key={k.id || i} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-bold text-slate-700 font-mono">#{k.kotNo}</td>
                    <td className="py-2.5 px-3 text-slate-500 font-mono">{k.orderNo || '-'}</td>
                    <td className="py-2.5 px-3 text-slate-600">{k.tableNo ? `T${k.tableNo}` : '-'}</td>
                    <td className="py-2.5 px-3 text-slate-500 text-[9px]">{fdVal(k.createdAt)}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">{k.prepTimeMinutes != null ? `${k.prepTimeMinutes} min` : '-'}</td>
                    <td className="py-2.5 px-3"><span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${k.status === 'READY' || k.status === 'SERVED' ? 'bg-emerald-100 text-emerald-800' : k.status === 'CANCELLED' ? 'bg-red-100 text-red-800' : k.status === 'PREPARING' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'}`}>{k.status}</span></td>
                  </tr>
                ))}
                {kots.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-slate-400 italic">No KOT data</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'performance' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total KOTs', value: perf.summary?.totalKots || 0, color: 'blue' },
              { label: 'Completed', value: perf.summary?.completedKots || 0, color: 'emerald' },
              { label: 'Avg Prep Time', value: perf.summary?.averagePrepTimeMinutes != null ? `${perf.summary.averagePrepTimeMinutes} min` : 'N/A', color: 'slate' },
              { label: 'Delayed (>30min)', value: perf.summary?.delayedKots || 0, color: 'red' },
            ].map((kpi, idx) => (
              <div key={idx} className={`bg-white rounded-[18px] border border-${kpi.color}-200 p-4 shadow-xs`}>
                <p className="text-[9px] font-bold uppercase text-slate-500 tracking-wider mb-2">{kpi.label}</p>
                <p className={`text-lg font-extrabold text-${kpi.color}-600`}>{kpi.value}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
            <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider mb-3">Hourly KOT Volume</h4>
            <div className="h-48">
              {hourly.length > 0 ? <Bar data={hourlyData} options={{ ...chartDefaults, scales: { x: { grid: { display: false }, ticks: { font: { ...chartFont, size: 7 }, maxTicksLimit: 12 } }, y: { beginAtZero: true, ticks: { font: chartFont } } } }} /> :
                <div className="h-full flex items-center justify-center text-xs text-slate-400 italic">No data</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
