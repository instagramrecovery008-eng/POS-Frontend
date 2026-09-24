import React from 'react';
import { Loader2, ChevronLeft, ChevronRight, LogIn } from 'lucide-react';
import { cn } from '../../../lib/utils';

/* ─── Text / email / phone input ─────────────────────────────────────────── */
export function Field({ label, error, required, hint, className, ...props }) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <input
        className={cn(
          'w-full h-10 px-3 bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-[#16A34A] focus:bg-white rounded-xl outline-none text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed',
          error && 'border-red-300 focus:border-red-500 bg-red-50',
          className
        )}
        {...props}
      />
      {error ? (
        <p className="text-[10px] font-semibold text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-[9px] text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

/* ─── Select ─────────────────────────────────────────────────────────────── */
export function Select({ label, error, required, children, className, ...props }) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <select
        className={cn(
          'w-full h-10 px-3 bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-[#16A34A] focus:bg-white rounded-xl outline-none text-xs font-semibold transition-all disabled:opacity-50',
          error && 'border-red-300 bg-red-50',
          className
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-[10px] font-semibold text-red-600">{error}</p>}
    </div>
  );
}

/* ─── Bottom action bar (Back / primary Continue) ───────────────────────── */
export function StepActions({ onBack, backDisabled, onContinue, continueDisabled, loading, continueLabel = 'Continue', children, onExitToLogin }) {
  return (
    <div className="flex items-center justify-between gap-3 mt-6 pt-5 border-t border-slate-100">
      <div className="flex items-center">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            disabled={backDisabled || loading}
            className="h-10 px-4 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Back
          </button>
        )}
        {onExitToLogin && (
          <button
            type="button"
            onClick={onExitToLogin}
            className="ml-2 h-10 px-4 bg-white border border-slate-200 text-slate-500 rounded-xl text-xs font-bold hover:bg-slate-50 hover:text-slate-700 transition-all cursor-pointer inline-flex items-center gap-1.5"
          >
            <LogIn className="w-3.5 h-3.5" /> Return to Login
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        {children}
        {onContinue && (
          <button
            type="button"
            onClick={onContinue}
            disabled={continueDisabled || loading}
            aria-busy={loading}
            className="h-10 px-5 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5 shadow-sm"
          >
            {loading ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {loading}</>
            ) : (
              <>{continueLabel} <ChevronRight className="w-3.5 h-3.5" /></>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Config-driven label helpers ───────────────────────────────────────── */
export const configLabel = (config, key) => {
  const list = (config && Array.isArray(config[key]) && config[key]) || [];
  const map = {};
  list.forEach((item) => { map[item.value] = item.label; });
  return map;
};

export const humanize = (value) =>
  String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
