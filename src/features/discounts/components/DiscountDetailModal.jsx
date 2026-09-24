import React from 'react';
import { X, Edit, Tag, Percent, Ticket, Users } from 'lucide-react';

const TYPE_META = {
  PERCENTAGE: { label: 'Percentage', icon: Percent },
  FIXED_AMOUNT: { label: 'Fixed Amount', icon: Tag },
  STAFF: { label: 'Staff', icon: Users },
  PROMO_CODE: { label: 'Promo Code', icon: Ticket },
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const maskToDays = (mask) => {
  if (!mask || Number(mask) === 127) return 'Every day';
  const days = DAY_LABELS.filter((_, i) => Number(mask) & (1 << i));
  return days.join(', ') || 'Every day';
};

const fmtDateTime = (d, t) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  const date = dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return t ? `${date} ${t}` : date;
};

const Row = ({ label, value }) => (
  <div className="flex justify-between gap-3 py-1.5 border-b border-slate-50 last:border-0">
    <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider shrink-0">{label}</span>
    <span className="text-[11px] font-semibold text-slate-700 text-right min-w-0 break-words">{value}</span>
  </div>
);

export default function DiscountDetailModal({ discount, currency = '₹', onClose, onEdit }) {
  const typeMeta = TYPE_META[discount.type] || TYPE_META.PERCENTAGE;
  const TypeIcon = typeMeta.icon;

  const scopeLabel =
    discount.scope === 'ENTIRE_ORDER'
      ? 'Entire Order'
      : discount.scope === 'CATEGORIES'
        ? 'Selected Categories'
        : 'Selected Products';

  const valueLabel =
    discount.type === 'PERCENTAGE' || discount.type === 'STAFF'
      ? `${Number(discount.discountValue)}%`
      : `${currency}${Number(discount.discountValue)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-sm rounded-xl shadow-xl border border-slate-100 max-h-[90vh] flex flex-col"
      >
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center rounded-t-xl shrink-0">
          <h4 className="font-extrabold text-xs uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
            <TypeIcon className="w-3.5 h-3.5 text-[#16A34A]" /> Discount Details
          </h4>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 text-xs">
          <div className="mb-3">
            <p className="text-sm font-extrabold text-slate-800">{discount.name}</p>
            {discount.description && <p className="text-[10px] text-slate-500 mt-0.5">{discount.description}</p>}
            {discount.promoCode && (
              <p className="text-[10px] font-mono font-bold text-purple-600 mt-1">Code: {discount.promoCode.code}</p>
            )}
          </div>

          <div className="space-y-0">
            <Row label="Type" value={typeMeta.label} />
            <Row label="Value" value={valueLabel} />
            {discount.maximumDiscountAmount != null && (
              <Row label="Maximum Discount" value={`${currency}${Number(discount.maximumDiscountAmount)}`} />
            )}
            <Row label="Applies To" value={scopeLabel} />
            <Row label="Valid From" value={fmtDateTime(discount.startDate, discount.startTime)} />
            <Row label="Valid Until" value={fmtDateTime(discount.endDate, discount.endTime)} />
            <Row label="Valid Days" value={maskToDays(discount.applicableDays)} />
            <Row
              label="Minimum Order"
              value={discount.minimumOrderAmount > 0 ? `${currency}${Number(discount.minimumOrderAmount)}` : 'None'}
            />
            <Row
              label="Usage"
              value={discount.usageLimit != null ? `${discount.usageCount} of ${discount.usageLimit}` : `${discount.usageCount} (unlimited)`}
            />
            <Row label="Stackable" value={discount.stackable ? 'Yes' : 'No'} />
            <Row label="Max Per Order" value={String(discount.maxDiscountsPerOrder ?? 1)} />
            {discount.type === 'STAFF' && (
              // §13: a STAFF discount is ONE common discount for ALL active
              // staff — no role/member eligibility configuration is shown,
              // even for legacy records that still carry old targeting data.
              <Row label="Eligibility" value="All Active Staff" />
            )}
            <Row label="Status" value={discount.effectiveStatus || discount.status} />
          </div>
        </div>

        <div className="px-4 py-3 border-t border-slate-100 flex gap-2 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 h-9 bg-white hover:bg-slate-50 border border-slate-200 text-slate-500 font-bold rounded-lg text-xs uppercase cursor-pointer"
          >
            Close
          </button>
          <button
            onClick={onEdit}
            className="flex-1 h-9 bg-[#16A34A] hover:bg-[#15803D] text-white font-bold rounded-lg text-xs uppercase cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Edit className="w-3.5 h-3.5" /> Edit
          </button>
        </div>
      </div>
    </div>
  );
}
