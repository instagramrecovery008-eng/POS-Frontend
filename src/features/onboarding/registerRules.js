/**
 * Pure client-side validation for the public registration form.
 *
 * Mirrors the backend registerSchema (name/email/phone/password + confirm) so
 * users get instant feedback. The backend validator remains authoritative.
 * Kept free of React/JSX so the node test runner can import it directly.
 *
 * Email uses the shared strict rule (utils/email.js) — far stronger than a
 * "contains @" check: it rejects "john", "john@", "@gmail.com", "john@gmail",
 * "john..smith@gmail.com", "john @gmail.com" and "john@gmail..com".
 */
import { EMAIL_RE as STRICT_EMAIL_RE, emailError } from '../../utils/email.js';
export const EMAIL_RE = STRICT_EMAIL_RE;
export const PHONE_RE = /^[+\d][\d\s\-()]*$/;

export function validateRegistration(form = {}) {
  const errors = {};
  const name = String(form.name || '').trim();
  const email = String(form.email || '').trim();
  const phone = String(form.phone || '').trim();
  const password = String(form.password || '');

  if (!name) errors.name = 'Name is required';
  else if (name.length < 2) errors.name = 'Name must be at least 2 characters';
  else if (name.length > 100) errors.name = 'Name must be at most 100 characters';

  const emailMsg = emailError(email);
  if (emailMsg) errors.email = emailMsg;

  if (!phone) errors.phone = 'Phone is required';
  else if (phone.length < 6 || phone.length > 25) errors.phone = 'Enter a valid phone number';
  else if (!PHONE_RE.test(phone)) errors.phone = 'Enter a valid phone number';

  if (!password) errors.password = 'Password is required';
  else if (password.length < 8) errors.password = 'Password must be at least 8 characters';
  else if (!/(?=.*[A-Za-z])(?=.*\d)/.test(password)) errors.password = 'Password must contain letters and numbers';

  if (String(form.confirmPassword || '') !== password) errors.confirmPassword = 'Passwords do not match';

  return errors;
}

export default validateRegistration;
