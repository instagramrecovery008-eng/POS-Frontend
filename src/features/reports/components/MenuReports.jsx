import React, { useState, useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { Package, Trophy, AlertTriangle, BarChart3 } from 'lucide-react';
import { formatCurrency } from '../../../lib/utils';
import { PLACEHOLDER_IMAGE } from '../../../lib/imagePlaceholder';
import ReportExportBar from '../../../components/common/ReportExportBar';
import { useSettingsStore } from '../../../store';
import { catalogNaming } from '../../../utils/businessCapabilities';

const chartFont = { family: "'Inter', 'Segoe UI', sans-serif", size: 9 };
const chartDefaults = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } };

export default function MenuReports({ menuPerformance, topSelling, lowSelling, categoryPerformance, loading, formatCurrency: fc }) {
  const [subTab, setSubTab] = useState('performance');
  const [sortBy, setSortBy] = useState('quantity');
  const fcVal = fc || formatCurrency;
  const { settings } = useSettingsStore();
  const currencySymbol = settings?.currencySymbol || '₹';
  // §10: catalog-aware wording — "Menu" for food verticals, "Products" for
  // retail (via the centralized catalogNaming utility, no businessType checks).
  const naming = catalogNaming(settings?.businessType);
  const itemLabel = naming.itemLabel;

  if (loading) return null;

  const items = menuPerformance || [];
  const topItems = topSelling?.items || [];
  const lowItems = lowSelling?.items || [];
  const threshold = lowSelling?.threshold || 5;
  const cats = categoryPerformance || [];

  const topChartData = useMemo(() => ({
    labels: topItems.slice(0, 10).map(i => i.itemName),
    datasets: [{ label: sortBy === 'revenue' ? 'Revenue' : 'Qty Sold', data: topItems.slice(0, 10).map(i => sortBy === 'revenue' ? i.revenue : i.quantitySold),
      backgroundColor: 'rgba(22,163,74,0.7)', borderRadius: 4, borderSkipped: false }],
  }), [topItems, sortBy]);

  const catChartData = useMemo(() => ({
    labels: cats.slice(0, 8).map(c => c.categoryName),
    datasets: [{ label: 'Revenue', data: cats.slice(0, 8).map(c => c.revenue),
      backgroundColor: ['rgba(22,163,74,0.8)', 'rgba(37,99,235,0.8)', 'rgba(217,119,6,0.8)', 'rgba(124,58,237,0.8)',
        'rgba(220,38,38,0.8)', 'rgba(13,148,136,0.8)', 'rgba(234,88,12,0.8)', 'rgba(100,116,139,0.8)'],
      borderRadius: 4, borderSkipped: false }],
  }), [cats]);

  return (
    <div className="space-y-4">
      <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px] font-bold overflow-x-auto no-scrollbar">
        {[{ key: 'performance', label: `${itemLabel} Performance` }, { key: 'top', label: 'Top Selling' }, { key: 'low', label: 'Low Selling' }, { key: 'category', label: 'Category Performance' }].map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer shrink-0 ${subTab === t.key ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'performance' && (
        <div className="bg-white rounded-[18px] border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-xs font-extrabold text-slate-800">All {itemLabel} ({items.length})</p>
            <ReportExportBar
              title={`${itemLabel} Performance`}
              columns={[{ key: 'name', label: 'Item' }, { key: 'category', label: 'Category' }, { key: 'quantitySold', label: 'Qty Sold', format: 'number' }, { key: 'revenue', label: 'Revenue', format: 'currency' }, { key: 'orderCount', label: 'Orders', format: 'number' }, { key: 'averageSellingPrice', label: 'Avg Price', format: 'currency' }]}
              data={items}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead className="bg-slate-50">
                <tr>
                  {['Item', 'Category', 'Price', 'Qty Sold', 'Revenue', 'Avg Price', '% Contribution'].map(h => (
                    <th key={h} className={`py-2.5 px-2.5 text-[9px] font-bold uppercase text-slate-500 ${['Revenue', 'Avg Price', '% Contribution', 'Price'].includes(h) ? 'text-right' : ['Qty Sold'].includes(h) ? 'text-center' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.slice(0, 100).map((i, idx) => (
                  <tr key={i.menuItemId || idx} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2 px-2.5 font-bold text-slate-700">
                      <span className="flex items-center gap-2">
                        <img src={i.image || PLACEHOLDER_IMAGE} alt={i.itemName} onError={e => { e.target.src = PLACEHOLDER_IMAGE; }} className="w-7 h-7 rounded object-cover shrink-0 bg-white border border-slate-200" loading="lazy" />
                        <span className="truncate max-w-[160px]">{i.itemName}</span>
                      </span>
                    </td>
                    <td className="py-2 px-2.5 text-slate-500">{i.category || '-'}</td>
                    <td className="py-2 px-2.5 text-right font-mono text-slate-600">{fcVal(i.currentPrice)}</td>
                    <td className="py-2 px-2.5 text-center font-mono">{i.quantitySold}</td>
                    <td className="py-2 px-2.5 text-right font-mono font-bold text-slate-800">{fcVal(i.revenue)}</td>
                    <td className="py-2 px-2.5 text-right font-mono text-slate-600">{fcVal(i.averageSellingPrice)}</td>
                    <td className="py-2 px-2.5 text-right"><span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{i.contributionPercentage}%</span></td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-slate-400 italic">No data</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'top' && (
        <div className="space-y-4">
          <div className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-amber-600" /> Top Selling Items
              </h4>
              <div className="flex bg-slate-100 p-0.5 rounded-lg gap-0.5">
                {['quantity', 'revenue'].map(m => (
                  <button key={m} onClick={() => setSortBy(m)}
                    className={`px-2 py-0.5 text-[8px] font-bold rounded-md cursor-pointer ${sortBy === m ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500'}`}>
                    {m === 'quantity' ? 'By Quantity' : 'By Revenue'}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-56">
              {topChartData.labels.length > 0 ? <Bar data={topChartData} options={{ ...chartDefaults, indexAxis: 'y', scales: { x: { beginAtZero: true, ticks: { font: chartFont } }, y: { grid: { display: false }, ticks: { font: { ...chartFont, size: 8 } } } } }} /> :
                <div className="h-full flex items-center justify-center text-xs text-slate-400 italic">No data</div>}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {topItems.slice(0, 9).map((item, idx) => (
              <div key={item.menuItemId || idx} className="bg-white rounded-[18px] border border-slate-200 p-3 shadow-xs flex items-center gap-3">
                <span className="w-7 h-7 bg-[#16A34A] text-white text-[10px] font-extrabold rounded-lg flex items-center justify-center shrink-0">{idx + 1}</span>
                <img src={item.image || PLACEHOLDER_IMAGE} alt={item.itemName} onError={e => { e.target.src = PLACEHOLDER_IMAGE; }} className="w-10 h-10 rounded-lg object-cover shrink-0 bg-white border border-slate-200" loading="lazy" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-slate-800 truncate">{item.itemName}</p>
                  <p className="text-[9px] text-slate-500 font-mono">{item.quantitySold} sold · {fcVal(item.revenue)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {subTab === 'low' && (
        <div className="bg-white rounded-[18px] border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <p className="text-xs font-extrabold text-slate-800">Low Selling Items (≤ {threshold} sold) — {lowItems.length} items</p>
            </div>
            <ReportExportBar
              title="Low Selling Items"
              columns={[{ key: 'name', label: 'Item' }, { key: 'category', label: 'Category' }, { key: 'quantitySold', label: 'Qty Sold', format: 'number' }, { key: 'revenue', label: 'Revenue', format: 'currency' }, { key: 'averageSellingPrice', label: 'Avg Price', format: 'currency' }]}
              data={lowItems}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead className="bg-slate-50">
                <tr>
                  {['Item', 'Category', 'Qty Sold', 'Revenue', 'Avg Price'].map(h => (
                    <th key={h} className={`py-2.5 px-2.5 text-[9px] font-bold uppercase text-slate-500 ${['Revenue', 'Avg Price'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lowItems.map((i, idx) => (
                  <tr key={i.menuItemId || idx} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2.5 px-2.5 font-bold text-slate-700">{i.itemName}</td>
                    <td className="py-2.5 px-2.5 text-slate-500">{i.category}</td>
                    <td className="py-2.5 px-2.5 font-mono text-amber-600">{i.quantitySold}</td>
                    <td className="py-2.5 px-2.5 text-right font-mono font-bold text-slate-800">{fcVal(i.revenue)}</td>
                    <td className="py-2.5 px-2.5 text-right font-mono text-slate-600">{fcVal(i.averageSellingPrice)}</td>
                  </tr>
                ))}
                {lowItems.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-slate-400 italic">No low-selling items found</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'category' && (
        <div className="space-y-4">
          <div className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
            <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-amber-600" /> Category Revenue
            </h4>
            <div className="h-48">
              {catChartData.labels.length > 0 ? <Bar data={catChartData} options={{ ...chartDefaults, scales: { x: { grid: { display: false }, ticks: { font: chartFont } }, y: { beginAtZero: true, ticks: { font: chartFont, callback: v => currencySymbol + v } } } }} /> :
                <div className="h-full flex items-center justify-center text-xs text-slate-400 italic">No data</div>}
            </div>
          </div>
          <div className="bg-white rounded-[18px] border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between"><p className="text-xs font-extrabold text-slate-800">Category Performance ({cats.length})</p><ReportExportBar title="Category Performance" columns={[{ key: 'categoryName', label: 'Category' }, { key: 'quantitySold', label: 'Items Sold', format: 'number' }, { key: 'revenue', label: 'Revenue', format: 'currency' }, { key: 'orderCount', label: 'Orders', format: 'number' }]} data={cats} /></div>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead className="bg-slate-50">
                  <tr>
                    {['Category', 'Items', 'Qty Sold', 'Orders', 'Revenue', '% Contribution'].map(h => (
                      <th key={h} className={`py-2.5 px-2 text-[9px] font-bold uppercase text-slate-500 ${['Revenue', '% Contribution'].includes(h) ? 'text-right' : ['Items', 'Qty Sold', 'Orders'].includes(h) ? 'text-center' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cats.map((c, i) => (
                    <tr key={c.categoryId || i} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2.5 px-2 font-bold text-slate-700">{c.categoryName}</td>
                      <td className="py-2.5 px-2 text-center font-mono text-slate-600">{c.itemCount}</td>
                      <td className="py-2.5 px-2 text-center font-mono text-slate-600">{c.quantitySold}</td>
                      <td className="py-2.5 px-2 text-center font-mono text-slate-600">{c.orderCount}</td>
                      <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-800">{fcVal(c.revenue)}</td>
                      <td className="py-2.5 px-2 text-right"><span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{c.contributionPercentage}%</span></td>
                    </tr>
                  ))}
                  {cats.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-slate-400 italic">No category data</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
