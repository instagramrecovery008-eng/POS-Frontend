/**
 * Shared email validation + normalization (frontend mirror of the backend
 * utils/email.js). ONE rule set for every identity input:
 *   - registration (self-serve Account step)
 *   - login
 *   - staff creation
 *   - Super Admin restaurant creation
 *
 * Normalization = trim surrounding whitespace + lowercase ONLY.
 * No provider-specific transforms (no Gmail dot removal, no +tag stripping).
 * Passwords are never touched.
 */

export const EMAIL_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;

/** Canonical form: trim → lowercase. */
export const normalizeEmail = (email) =>
  email === null || email === undefined ? email : String(email).trim().toLowerCase();

/** Strict format check (whitespace/case tolerated — normalize for storage). */
export const isValidEmail = (email) => {
  const value = normalizeEmail(email);
  return !!value && EMAIL_RE.test(value);
};

/**
 * Returns null when valid, else the exact user-facing message:
 *   empty   → "Email is required."
 *   invalid → "Please enter a valid email address."
 */
export const emailError = (email) => {
  const value = normalizeEmail(email);
  if (!value) return 'Email is required.';
  if (!EMAIL_RE.test(value)) return 'Please enter a valid email address.';
  return null;
};

/**
 * Optional-field variant: "", null, undefined pass; a non-empty value must be
 * a valid email address.
 */
export const emailOptionalError = (email) => {
  const value = normalizeEmail(email);
  if (!value) return null;
  if (!EMAIL_RE.test(value)) return 'Please enter a valid email address.';
  return null;
};

export default { EMAIL_RE, normalizeEmail, isValidEmail, emailError, emailOptionalError };
