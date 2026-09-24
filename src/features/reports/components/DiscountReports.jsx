import React, { useState } from 'react';
import { formatCurrency, formatDate } from '../../../lib/utils';
import { Tag, Receipt } from 'lucide-react';
import ReportExportBar from '../../../components/common/ReportExportBar';

export default function DiscountReports({ discountData, cancellationData, loading, formatCurrency: fc, formatDate: fd }) {
  const subTab = 'discounts';
  const fcVal = fc || formatCurrency;
  const fdVal = fd || formatDate;

  if (loading) return null;

  const dSummary = discountData?.summary || {};
  const dByType = discountData?.discountByType || {};
  const dBills = discountData?.bills || [];
  // Discounts & Promotions breakdown (§31) — real OrderDiscount history grouped
  // by promotion type. Amounts are historical snapshots, never recalculated.
  const promoBreakdown = discountData?.promotionBreakdown || null;
  const promoCounts = discountData?.promotionCounts || null;

  return (
    <div className="space-y-4">
      <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px] font-bold">
        <button className="px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 bg-white text-slate-800 shadow-xs">
          <Tag className="w-3 h-3" /> Discount Report
        </button>
      </div>

      {subTab === 'discounts' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Discounted Orders', value: dSummary.totalDiscountedOrders || 0 },
              { label: 'Total Discount', value: fcVal(dSummary.totalDiscount || 0) },
              { label: 'Average Discount', value: fcVal(dSummary.averageDiscount || 0) },
              { label: 'Discount Rate', value: `${(dSummary.discountPercentage || 0).toFixed(1)}%` },
              { label: 'Sales Before Discount', value: fcVal(dSummary.salesBeforeDiscount || 0) },
              { label: 'Sales After Discount', value: fcVal(dSummary.salesAfterDiscount || 0) },
            ].map((kpi, idx) => (
              <div key={idx} className="bg-white rounded-[18px] border border-purple-200 p-4 shadow-xs">
                <p className="text-[9px] font-bold uppercase text-slate-500 tracking-wider mb-2">{kpi.label}</p>
                <p className="text-lg font-extrabold text-purple-600">{kpi.value}</p>
              </div>
            ))}
          </div>

          {promoBreakdown && (promoBreakdown.promotion > 0 || promoBreakdown.staff > 0 || promoBreakdown.promoCode > 0 || promoBreakdown.manual > 0) && (
            <div className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
              <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider mb-3">Discounts &amp; Promotions Breakdown</h4>
              <div className="flex flex-wrap gap-3">
                {[
                  { key: 'promotion', label: 'Promotion Discount', color: 'text-emerald-600' },
                  { key: 'staff', label: 'Staff Discount', color: 'text-indigo-600' },
                  { key: 'promoCode', label: 'Promo Code Discount', color: 'text-purple-600' },
                  { key: 'manual', label: 'Manual Discount', color: 'text-amber-600' },
                ].map(({ key, label, color }) => (
                  <div key={key} className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex-1 min-w-[140px]">
                    <p className="text-[9px] font-bold uppercase text-slate-400">{label}</p>
                    <p className={`text-sm font-extrabold ${color}`}>{fcVal(promoBreakdown[key] || 0)}</p>
                    <p className="text-[10px] font-mono text-slate-500">{promoCounts?.[key] || 0} applied</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.keys(dByType).length > 0 && (
            <div className="bg-white rounded-[18px] border border-slate-200 p-4 shadow-xs">
              <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider mb-3">Discount by Type</h4>
              <div className="flex gap-3">
                {Object.entries(dByType).map(([type, data]) => (
                  <div key={type} className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex-1">
                    <p className="text-[9px] font-bold uppercase text-slate-400">{type}</p>
                    <p className="text-sm font-extrabold text-slate-800">{data.count} orders</p>
                    <p className="text-[10px] font-mono text-slate-600">{fcVal(data.amount)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-[18px] border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <p className="text-xs font-extrabold text-slate-800">Discounted Bills ({dBills.length})</p>
              <ReportExportBar
                title="Discount Report"
                columns={[{ key: 'billNo', label: 'Bill No' }, { key: 'orderNo', label: 'Order' }, { key: 'date', label: 'Date' }, { key: 'type', label: 'Type' }, { key: 'reason', label: 'Reason' }, { key: 'discount', label: 'Discount Amount', format: 'currency' }, { key: 'total', label: 'Grand Total', format: 'currency' }]}
                data={dBills.map(b => ({ billNo: `#${b.billNo || b.id}`, orderNo: b.orderNo || '-', date: fdVal(b.createdAt), type: b.discountType || '-', reason: b.discountReason || '-', discount: b.discountAmount || b.discount || 0, total: b.grandTotal || 0 }))}
                kpis={[{ label: 'Discounted Orders', value: dSummary.totalDiscountedOrders || 0 }, { label: 'Total Discount', value: dSummary.totalDiscount || 0 }]}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead className="bg-slate-50">
                  <tr>
                    {['Bill No', 'Order', 'Date', 'Type', 'Reason', 'Discount Amount', 'Grand Total'].map(h => (
                      <th key={h} className={`py-2.5 px-3 text-[9px] font-bold uppercase text-slate-500 ${['Discount Amount', 'Grand Total'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dBills.map((b, i) => (
                    <tr key={b.id || i} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-bold text-slate-700 font-mono">#{b.billNo || b.id}</td>
                      <td className="py-2.5 px-3 text-slate-500 font-mono">{b.order?.orderNo || '-'}</td>
                      <td className="py-2.5 px-3 text-slate-500 text-[9px]">{fdVal(b.createdAt)}</td>
                      <td className="py-2.5 px-3"><span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-800">{b.discountType || 'FLAT'}</span></td>
                      <td className="py-2.5 px-3 text-slate-600 text-[9px]">{b.discountReason || '-'}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-red-600">-{fcVal(b.discount || 0)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">{fcVal(b.grandTotal || 0)}</td>
                    </tr>
                  ))}
                  {dBills.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-slate-400 italic">No discounted bills found</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
