/**
 * Pure helpers for the self-serve onboarding wizard.
 *
 * Kept free of React/API side effects so the logic can be unit-tested by the
 * frontend test runner (src/__tests__/run.js). The BACKEND status is always
 * the source of truth — every page decision is derived from the canonical
 * onboarding payload returned by the API.
 */
import { getDefaultScreenForRole } from '../../utils/permissions.js';


// ─── Wizard pages (route targets inside the onboarding flow) ───────────────
// There is NO payment page: after PLAN the applicant reviews their
// application and SUBMITS it for manual Super Admin approval.
export const WIZARD_PAGES = [
  'business',
  'documents',
  'legal',
  'plan',
  'review',
  'pending',
  'under_review',
  'provisioning',
  'complete',
  'blocked',
];

// Progress indicator — 7 labelled steps shown above the wizard content.
export const PROGRESS_STEPS = [
  { key: 'account', label: 'Account' },
  { key: 'business', label: 'Business' },
  { key: 'documents', label: 'Documents' },
  { key: 'legal', label: 'Legal' },
  { key: 'plan', label: 'Plan' },
  { key: 'review', label: 'Review' },
  { key: 'complete', label: 'Complete' },
];

// Wizard page → progress chip index (which of the 7 steps is "current").
// 'account' is used by the standalone registration screen (step 1).
// Status pages shown after submission sit on the final "Complete" chip.
const PROGRESS_INDEX = {
  account: 0,
  business: 1,
  documents: 2,
  legal: 3,
  plan: 4,
  review: 5,
  pending: 6, // application submitted — waiting on Super Admin
  under_review: 6,
  provisioning: 6, // workspace setup = final "Complete" step in motion
  complete: 6,
};

// Account page (index 0) is always done once the wizard is reached.
export const progressIndexForPage = (page) =>
  PROGRESS_INDEX[page] == null ? null : PROGRESS_INDEX[page];

/**
 * Map a stored backend onboarding status to the wizard page that must be
 * shown. Mirrors STEP_BY_STAGE on the backend — resume always lands on the
 * correct step for the account's current state.
 */
export const pageForStatus = (status) => {
  switch (status) {
    case 'REGISTERED':
    case 'ONBOARDING':
      return 'business';
    case 'DOCUMENTS_PENDING':
    case 'DOCUMENT_REJECTED':
      return 'documents';
    case 'LEGAL_PENDING':
      return 'legal';
    case 'PLAN_PENDING':
      return 'plan';
    // After the plan is selected the applicant reviews + submits — there is
    // no payment step. Legacy PAYMENT_* accounts land on the same review
    // screen so they can submit for manual approval (never a payment UI).
    case 'PLAN_SELECTED':
    case 'PAYMENT_PENDING':
    case 'PAYMENT_SUCCESS':
    case 'PAYMENT_FAILED':
      return 'review';
    case 'UNDER_REVIEW':
      return 'under_review';
    // Manual-review flow after SUBMIT APPLICATION.
    case 'MANUAL_PENDING':
    case 'MANUAL_PAYMENT_PENDING':
    case 'MANUAL_PAYMENT_RECEIVED':
      return 'pending';
    case 'MANUAL_APPROVED':
      return 'complete';
    case 'MANUAL_REJECTED':
      return 'blocked';
    case 'PROVISIONING':
      return 'provisioning';
    case 'ACTIVE':
      return 'complete';
    case 'REJECTED':
    case 'SUSPENDED':
    case 'EXPIRED':
      return 'blocked';
    default:
      return 'business';
  }
};

/**
 * A payload describes an active self-serve applicant (needs the wizard) only
 * when ALL of the following hold:
 *   1. a payload with an account exists (came from /auth/login|register|profile
 *      or /onboarding/status — i.e. the backend classified this account),
 *   2. the restaurant is actually a SELF-SERVE application (a Super
 *      Admin-created restaurant's ADMIN is a normal POS user and must NEVER be
 *      classified as an applicant — that misclassification is exactly what
 *      sent approved users into the wizard and produced 403 loops), and
 *   3. the status is a real in-progress lifecycle state (not ACTIVE,
 *      not terminal SUSPENDED/EXPIRED — those users are POS users with a
 *      problem, not applicants mid-registration).
 * Rejected applications still count (the applicant must see WHY they were
 * rejected on the wizard's blocked screen).
 */
export const isSelfServeOnboarding = (onboarding) => {
  if (!onboarding || !onboarding.account) return false;
  const status = onboarding.account.status;
  if (!status) return false;
  // A restaurant that did NOT come through self-serve registration is never an
  // applicant — even if some status leaked into the payload.
  if (onboarding.restaurant && onboarding.restaurant.selfServe === false) return false;
  if (status === 'ACTIVE') return false;
  if (['SUSPENDED', 'EXPIRED'].includes(status)) return false;
  return true;
};

/**
 * The wizard should poll /onboarding/status ONLY while the application is in
 * one of these wait states (or the pre-submit review page). Any other status —
 * ACTIVE, rejected, blocked, unknown — must never trigger polling.
 */
export const shouldPollOnboardingStatus = (status) =>
  [
    'MANUAL_PENDING',
    'MANUAL_PAYMENT_PENDING',
    'MANUAL_PAYMENT_RECEIVED',
    'UNDER_REVIEW',
    'PROVISIONING',
  ].includes(status);

/** Landing screen after login/profile for a user + optional onboarding. */
export const resolveHomeScreen = (user, onboarding) => {
  if (!user) return 'login';
  if (isSelfServeOnboarding(onboarding)) return 'onboarding';
  return getDefaultScreenForRole(user.role);
};

/** A document counts toward the ≥1 rule while uploaded/under review/verified. */
export const VALID_DOCUMENT_STATUSES = ['PENDING', 'UNDER_REVIEW', 'VERIFIED'];

export const hasValidDocument = (documents) =>
  Array.isArray(documents) &&
  documents.some((d) => VALID_DOCUMENT_STATUSES.includes(d.status));

export const countValidDocuments = (documents) =>
  Array.isArray(documents) ? documents.filter((d) => VALID_DOCUMENT_STATUSES.includes(d.status)).length : 0;

/**
 * Yearly-only rule — the onboarding config advertises exactly one billing
 * cycle (YEARLY) and every purchasable plan carries a yearly price.
 */
export const isYearlyOnly = (config) => {
  const cycles = (config && Array.isArray(config.billingCycles) && config.billingCycles) || [];
  return cycles.length === 1 && String(cycles[0].value) === 'YEARLY';
};

export const formatINR = (amount) =>
  `₹${Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: Number.isInteger(Number(amount || 0)) ? 0 : 2 })}`;

export default {
  WIZARD_PAGES,
  PROGRESS_STEPS,
  progressIndexForPage,
  pageForStatus,
  isSelfServeOnboarding,
  shouldPollOnboardingStatus,
  resolveHomeScreen,
  VALID_DOCUMENT_STATUSES,
  hasValidDocument,
  countValidDocuments,
  isYearlyOnly,
  formatINR,
};
