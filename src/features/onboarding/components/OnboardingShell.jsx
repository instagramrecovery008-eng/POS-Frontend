import React from 'react';
import { Check, X } from 'lucide-react';
import { PROGRESS_STEPS, progressIndexForPage } from '../onboarding.lib';

/**
 * Shared full-screen onboarding layout: platform brand header, the 7-step
 * progress indicator (Account → Business → Documents → Legal → Plan → Review
 * → Complete — no Payment step), and the active step content. Steps are
 * data-driven — completed/current/upcoming states come from the
 * backend-derived page.
 */
export default function OnboardingShell({ page, children, banner, onLogout }) {
  const currentIndex = progressIndexForPage(page);

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col select-none font-sans">
      {/* ── Platform brand header ── */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-[#16A34A] rounded-[10px] flex items-center justify-center">
            <span className="text-white text-base font-extrabold font-serif leading-none">N</span>
          </div>
          <div>
            <h1 className="text-sm font-extrabold tracking-tight text-[#16A34A] uppercase leading-none">
              Nirka POS
            </h1>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
              Business Onboarding
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <p className="hidden sm:block text-[10px] font-semibold text-slate-400">
            Create your restaurant account in a few steps
          </p>
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="text-[10px] font-bold text-slate-400 hover:text-red-500 uppercase tracking-wider cursor-pointer"
            >
              Log out
            </button>
          )}
        </div>
      </header>

      {/* ── Progress indicator ── */}
      <div className="bg-white border-b border-slate-100 px-3 sm:px-8 py-3 shrink-0 overflow-x-auto no-scrollbar">
        <div className="flex items-center justify-center gap-1 min-w-max mx-auto">
          {PROGRESS_STEPS.map((step, i) => {
            const isDone = currentIndex != null && i < currentIndex;
            const isCurrent = currentIndex != null && i === currentIndex;
            return (
              <React.Fragment key={step.key}>
                {i > 0 && (
                  <div className={`h-0.5 w-5 sm:w-8 md:w-12 rounded ${isDone ? 'bg-[#16A34A]' : 'bg-slate-200'}`} />
                )}
                <div className="flex flex-col items-center gap-1 px-0.5">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-extrabold transition-all ${
                      isDone
                        ? 'bg-[#16A34A] text-white'
                        : isCurrent
                          ? 'bg-[#16A34A]/10 text-[#16A34A] border-2 border-[#16A34A]'
                          : 'bg-slate-100 text-slate-400 border border-slate-200'
                    }`}
                  >
                    {isDone ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <span className={`text-[8px] sm:text-[9px] font-bold uppercase tracking-wider whitespace-nowrap ${isCurrent ? 'text-[#16A34A]' : isDone ? 'text-slate-500' : 'text-slate-400'}`}>
                    {step.label}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Optional status banner (documents rejected, payment unavailable, …) */}
      {banner && <div className="px-4 sm:px-8 pt-4">{banner}</div>}

      {/* ── Active step ── */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 overflow-y-auto">
        {children}
      </main>

      <footer className="shrink-0 py-3 text-center">
        <p className="text-[10px] text-slate-400 font-medium">
          &copy; 2026 Nirka POS. All rights reserved.
        </p>
      </footer>
    </div>
  );
}

/** Small dismissible inline notice used above step content. */
export function Notice({ tone = 'info', children, onClose }) {
  const tones = {
    info: 'bg-blue-50 border-blue-200 text-blue-700',
    warn: 'bg-amber-50 border-amber-200 text-amber-700',
    error: 'bg-red-50 border-red-200 text-red-700',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  };
  return (
    <div className={`flex items-start gap-2 border rounded-xl px-4 py-3 text-xs font-semibold ${tones[tone] || tones.info}`}>
      <span className="flex-1 leading-relaxed">{children}</span>
      {onClose && (
        <button onClick={onClose} className="shrink-0 p-0.5 opacity-60 hover:opacity-100 cursor-pointer" aria-label="Dismiss">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

/** White content card with a title row — the wizard's main building block. */
export function StepCard({ icon: Icon, title, subtitle, children, className = '' }) {
  return (
    <section className={`bg-white rounded-[20px] border border-slate-200 shadow-sm p-5 sm:p-6 ${className}`}>
      {(title || subtitle) && (
        <div className="flex items-center gap-3 mb-5">
          {Icon && (
            <div className="w-9 h-9 rounded-xl bg-[#16A34A]/10 flex items-center justify-center shrink-0">
              <Icon className="w-4.5 h-4.5 text-[#16A34A]" />
            </div>
          )}
          <div>
            <h2 className="text-sm font-extrabold text-slate-800">{title}</h2>
            {subtitle && <p className="text-[10px] text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
        </div>
      )}
      {children}
    </section>
  );
}
