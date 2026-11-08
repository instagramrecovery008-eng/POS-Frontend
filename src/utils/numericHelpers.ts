// ── Numeric input helpers ─────────────────────────────────────────────────────
// Single source of truth for controlled numeric inputs across the POS.
//
// Problem they solve:
//   - A controlled input with type="number" whose value is a numeric state
//     variable (e.g. 0) will collapse empty text to "0" on every keystroke,
//     which produces the classic leading-zero artifacts and makes a cleared
//     field impossible to type into correctly.
//   - The fix: keep the STATE as a STRING (matching the DOM), sanitize only
//     the visual artifact side (unnecessary leading zeros), and convert to a
//     real number ONLY at the submit boundary.
//
// Behavior:
//   - sanitizeNumeric: string in, string out. Empty stays empty. The raw text
//     the user sees is preserved; only invisible leading-zero padding is
//     stripped ("00219" → "219"). A lone leading dot becomes "0.5".
//   - toNumber: string in, number out. Empty → 0. Non-finite (NaN/Infinity)
//     → 0. Everywhere a numeric field is submitted, sanitizeNumeric is applied
//     first, then toNumber. Forms that intentionally keep an ID/ticket as a
//     string (e.g. TablePage tableNo, printer port fallbacks) must NOT pass
//     through toNumber unless the field is genuinely numeric.
//
// NOTE: Empty is NOT coerced to 0 while the user is typing — the input value
//       always matches the string state. Coercion to 0 only happens when the
//       field is intentionally treated as "not yet entered, default 0" at the
//       submit boundary (per-field decision in each form).

/** Strip unnecessary leading zeros while keeping the string representation. */
export function sanitizeNumeric(raw: unknown): string {
  if (raw == null) return '';
  const value = String(raw).trim();
  if (value === '') return '';

  // Strip leading zeros that precede a digit: "00219" -> "219", "0005" -> "5".
  // Keeps "0" and "0.5" intact (the latter: /^0+\d/ is false because 0 is not
  // followed by a digit — the dot breaks the pattern).
  if (/^0+\d/.test(value)) {
    return value.replace(/^0+/, '');
  }

  // A leading dot with no integer part reads as "0.5" semantically; restore it.
  if (value.startsWith('.')) {
    return '0' + value;
  }

  return value;
}

/** Convert a sanitized numeric string to a finite number. Empty -> 0. */
export function toNumber(value: unknown): number {
  if (value === '' || value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
