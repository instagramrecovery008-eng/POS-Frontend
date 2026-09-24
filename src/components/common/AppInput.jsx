import React from 'react';
import { cn } from '../../lib/utils';

export default function AppInput({
  label,
  error,
  icon,
  className,
  ...props
}) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            {icon}
          </span>
        )}
        <input
          className={cn(
            'w-full h-10 bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-[#16A34A] focus:bg-white rounded-xl outline-none text-xs font-semibold transition-all',
            icon && 'pl-9',
            error && 'border-red-300 focus:border-red-500 bg-red-50',
            className
          )}
          {...props}
        />
      </div>
      {error && (
        <p className="text-[10px] font-semibold text-red-600">{error}</p>
      )}
    </div>
  );
}
