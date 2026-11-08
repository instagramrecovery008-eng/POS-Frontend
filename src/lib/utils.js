import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// ─── Currency (company-configured, ISO 4217) ───────────────────────────────
// ONE place decides how money is shown. The active currency is the authenticated
// company's setting (pushed here by the settings store whenever it loads or
// changes). Nothing in the app hardcodes a symbol, country or locale.
let activeCurrency = '';
const NUMBER_LOCALE = 'en-US';
const fmtCache = new Map();

const normalizeCode = (code) => {
  const c = String(code || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : '';
};

export const setActiveCurrency = (code) => {
  activeCurrency = normalizeCode(code);
};
export const getActiveCurrency = () => activeCurrency;

// Company timezone (IANA). Empty → the device's own zone. Never a country default.
let activeTimezone = '';
export const setActiveTimezone = (tz) => {
  try { if (tz) new Intl.DateTimeFormat('en', { timeZone: tz }); activeTimezone = tz || ''; } catch { activeTimezone = ''; }
};
export const getActiveTimezone = () => activeTimezone || undefined;

const getFormatter = (code) => {
  if (!fmtCache.has(code)) {
    let f = null;
    try {
      f = new Intl.NumberFormat(NUMBER_LOCALE, { style: 'currency', currency: code });
    } catch { f = null; }
    fmtCache.set(code, f);
  }
  return fmtCache.get(code);
};

/** Minor-unit digits for a currency (JPY 0, AED/USD 2, KWD 3). */
export const getCurrencyDigits = (code) => {
  const f = getFormatter(normalizeCode(code || activeCurrency) || 'USD');
  return f ? f.resolvedOptions().maximumFractionDigits : 2;
};

/** Format an amount in the company's currency (or an explicit ISO code). */
export const formatCurrency = (amount, currencyCode) => {
  const n = Number(amount);
  const value = Number.isFinite(n) ? n : 0;
  const code = normalizeCode(currencyCode) || activeCurrency;
  const f = code ? getFormatter(code) : null;
  return f ? f.format(value) : value.toFixed(2);
};

/** Currency prefix for `${symbol}${number}` call sites — always from the ISO code. */
export const getCurrencySymbol = (currencyCode) => {
  const code = normalizeCode(currencyCode) || activeCurrency;
  const f = code ? getFormatter(code) : null;
  if (!f) return '';
  const part = f.formatToParts(0).find((p) => p.type === 'currency');
  const sym = part ? part.value : code;
  // Alphabetic symbols (AED, SAR, CHF…) need a separator: "AED 150.00".
  return /^[A-Za-z]/.test(sym) ? `${sym} ` : sym;
};

/** All ISO currencies the runtime supports, for settings pickers. */
export const listCurrencies = () => {
  let codes = [];
  try { codes = Intl.supportedValuesOf('currency'); } catch { codes = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'SAR', 'SGD', 'AUD', 'JPY']; }
  let names = null;
  try { names = new Intl.DisplayNames([NUMBER_LOCALE], { type: 'currency' }); } catch { names = null; }
  return codes.map((c) => ({ value: c, label: `${c} — ${names ? names.of(c) : c}` }));
};

/** Money math in integer minor units (no float drift). */
export const toMinor = (amount, currencyCode) =>
  Math.round(Number(amount || 0) * 10 ** getCurrencyDigits(currencyCode) + Number.EPSILON * Math.sign(Number(amount || 0)));
export const fromMinor = (minor, currencyCode) => Number(minor) / 10 ** getCurrencyDigits(currencyCode);
export const roundMoney = (amount, currencyCode) => fromMinor(toMinor(amount, currencyCode), currencyCode);

export const formatDate = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-IN', {
    timeZone: getActiveTimezone(),
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export const formatTime = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleTimeString('en-IN', {
    timeZone: getActiveTimezone(),
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const getInitials = (firstName, lastName) => {
  return ((firstName?.charAt(0) || '') + (lastName?.charAt(0) || '')).toUpperCase();
};
