import React, { useMemo } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { CreditCard, Smartphone, PieChart } from 'lucide-react';
import { formatCurrency, formatDate, formatTime } from '../../../lib/utils';
import ReportExportBar from '../../../components/common/ReportExportBar';

const chartFont = { family: "'Inter', 'Segoe UI', sans-serif", size: 9 };
const chartDefaults = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } };

export default function PaymentReports({ paymentData, loading, formatCurrency: fc, formatDate: fd, formatTime: ft }) {
  const fcVal = fc || formatCurrency;
  const fdVal = fd || formatDate;
  const ftVal = ft || formatTime;

  const summary = paymentData?.summary || {};
  const payments = paymentData?.payments || [];

  const totalAmount = summary.totalAmount || 0;
  const totalPayments = summary.totalPayments || 0;

  const methodBreakdown = useMemo(() => {
    const methods = {};
    payments.forEach(p => {
      const m = p.paymentMethod || 'OTHER';
      if (!methods[m]) methods[m] = { method: m, count: 0, amount: 0 };
      methods[m].count += 1;
      methods[m].amount += Number(p.amount || 0);
    });
    return Object.values(methods).sort((a, b) => b.amount - a.amount);
  }, [payments]);

  const paymentChartData = useMemo(() => ({
    labels: methodBreakdown.map(m => m.method),
    datasets: [{
      data: methodBreakdown.map(m => m.amount),
      backgroundColor: ['rgba(22,163,74,0.85)', 'rgba(37,99,235,0.85)', 'rgba(124,58,237,0.85)', 'rgba(217,119,6,0.85)', 'rgba(100,116,139,0.85)'],
      borderWidth: 0, cutout: '70%',
    }],
  }), [methodBreakdown]);

  const knownMethods = [
    { key: 'CASH', label: 'Cash', color: 'emerald', icon: CreditCard },
    { key: 'CARD', label: 'Card', color: 'blue', icon: CreditCard },
    { key: 'UPI', label: 'UPI', color: 'purple', icon: Smartphone },
  ];

  if (loading) return null;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5 text-blue-600" /> Payment Collection
          </h4>
          <ReportExportBar
            title="Payment Collection"
            columns={[{ key: 'method', label: 'Payment Method' }, { key: 'count', label: 'Transactions', format: 'number' }, { key: 'amount', label: 'Amount', format: 'currency' }, { key: 'percentage', label: '% of Total' }]}
            data={methodBreakdown.map(m => ({ method: m.method, count: m.count, amount: m.amount, percentage: totalAmount > 0 ? `${Math.round((m.amount / totalAmount) * 100)}%` : '0%' }))}
            kpis={[{ label: 'Total Collection', value: totalAmount }, { label: 'Total Transactions', value: totalPayments }]}
          />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {knownMethods.map(m => {
            const val = summary[m.key] || methodBreakdown.find(x => x.method === m.key)?.amount || 0;
            return (
              <div key={m.key} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <div className="flex items-center gap-2 mb-2">
                  <m.icon className={`w-4 h-4 text-${m.color}-600`} />
                  <p className="text-[9px] font-bold uppercase text-slate-500">{m.label}</p>
                </div>
                <p className={`text-lg font-extrabold text-${m.color}-600`}>{fcVal(val)}</p>
                <p className="text-[9px] text-slate-400 font-semibold mt-0.5">
                  {totalAmount > 0 ? `${Math.round((val / totalAmount) * 100)}%` : '0%'}
                </p>
              </div>
            );
          })}
          {methodBreakdown.filter(m => !['CASH', 'CARD', 'UPI'].includes(m.method)).map(m => (
            <div key={m.method} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard className="w-4 h-4 text-slate-600" />
                <p className="text-[9px] font-bold uppercase text-slate-500">{m.method}</p>
              </div>
              <p className="text-lg font-extrabold text-slate-600">{fcVal(m.amount)}</p>
              <p className="text-[9px] text-slate-400 font-semibold mt-0.5">
                {totalAmount > 0 ? `${Math.round((m.amount / totalAmount) * 100)}%` : '0%'}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-500">Total Collection ({totalPayments} transactions)</span>
          <span className="text-sm font-extrabold text-slate-800 font-mono">{fcVal(totalAmount)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
          <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <PieChart className="w-3.5 h-3.5 text-blue-600" /> Distribution
          </h4>
          <div className="flex items-center justify-center gap-8">
            <div className="w-36 h-36 shrink-0">
              {totalAmount > 0 ? <Doughnut data={paymentChartData} options={{ ...chartDefaults, cutout: '70%' }} /> :
                <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400 italic">No data</div>}
            </div>
            <div className="space-y-2 text-[10px]">
              {methodBreakdown.map((m, i) => (
                <div key={m.method} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ['rgba(22,163,74,0.85)', 'rgba(37,99,235,0.85)', 'rgba(124,58,237,0.85)', 'rgba(217,119,6,0.85)', 'rgba(100,116,139,0.85)'][i % 5] }} />
                  <span className="font-semibold text-slate-600 min-w-[40px]">{m.method}</span>
                  <span className="font-mono font-bold text-slate-800">{fcVal(m.amount)}</span>
                  <span className="text-slate-400">({totalAmount > 0 ? Math.round((m.amount / totalAmount) * 100) : 0}%)</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[18px] border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-extrabold text-slate-800">Payment Register ({payments.length})</p>
          </div>
          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-[10px]">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="text-left py-2 px-3 text-[9px] font-bold uppercase text-slate-500">Payment ID</th>
                  <th className="text-left py-2 px-3 text-[9px] font-bold uppercase text-slate-500">Date</th>
                  <th className="text-left py-2 px-3 text-[9px] font-bold uppercase text-slate-500">Bill</th>
                  <th className="text-left py-2 px-3 text-[9px] font-bold uppercase text-slate-500">Method</th>
                  <th className="text-right py-2 px-3 text-[9px] font-bold uppercase text-slate-500">Amount</th>
                  <th className="text-center py-2 px-3 text-[9px] font-bold uppercase text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.slice(0, 50).map((p, i) => (
                  <tr key={p.id || i} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2 px-3 font-mono text-slate-700">#{p.paymentNo || p.id}</td>
                    <td className="py-2 px-3 text-slate-500 text-[9px]">{fdVal(p.createdAt)}</td>
                    <td className="py-2 px-3 text-slate-600 font-mono">{p.bill?.billNo || '-'}</td>
                    <td className="py-2 px-3"><span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">{p.paymentMethod}</span></td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">{fcVal(p.amount)}</td>
                    <td className="py-2 px-3 text-center"><span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${p.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{p.status}</span></td>
                  </tr>
                ))}
                {payments.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-slate-400 italic">No payment data</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
