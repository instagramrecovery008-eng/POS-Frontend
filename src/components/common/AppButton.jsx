import React from 'react';
import { cn } from '../../lib/utils';

const variants = {
  primary: 'bg-[#16A34A] hover:bg-[#15803D] text-white shadow-sm',
  secondary: 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-700',
  danger: 'bg-red-50 hover:bg-red-100 border border-red-200 text-red-700',
  ghost: 'hover:bg-slate-100 text-slate-600',
  outline: 'border border-slate-200 hover:bg-slate-50 text-slate-700',
};

const sizes = {
  sm: 'h-8 px-2.5 text-[10px]',
  md: 'h-10 px-4 text-xs',
  lg: 'h-11 px-5 text-sm',
};

export default function AppButton({
  children,
  variant = 'primary',
  size = 'md',
  className,
  disabled,
  loading,
  icon,
  ...props
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 font-bold rounded-lg uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : icon ? (
        <span className="w-4 h-4">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
