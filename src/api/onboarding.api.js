import apiClient from './axios';

/**
 * Self-serve onboarding API.
 *
 * Backend contracts (see restaurant-pos-backend/src/routes/onboarding.routes.js):
 *  - /config and /plans are PUBLIC.
 *  - Everything else requires the applicant JWT issued at registration/login
 *    (onboardingAuth middleware — never grants POS access).
 */
export const onboardingApi = {
  // ── Public flow config (business types, document types, policy versions) ──
  getConfig: () =>
    apiClient.get('/onboarding/config'),

  // Public purchasable plans (yearly-only billing).
  // ?businessType is a display convenience — the BACKEND resolves the mode
  // from the stored application businessType on every assignment, so a
  // tampered query param can never make an ineligible plan purchasable.
  getPlans: (businessType) =>
    apiClient.get('/onboarding/plans', { params: businessType ? { businessType } : undefined }),

  // ── Applicant state + steps ──
  // Canonical payload: { account:{status,step,label}, restaurant, steps,
  //   documents, legal, selectedPlan, payment, review }
  getStatus: () =>
    apiClient.get('/onboarding/status'),

  // Business details (creates the Restaurant row on first submission; the
  // response is the full canonical payload).
  submitBusiness: (data) =>
    apiClient.post('/onboarding/business', data),

  // Business documents (multipart; 10MB max; PDF/JPG/JPEG/PNG).
  uploadDocument: (formData) =>
    apiClient.post('/onboarding/documents', formData),

  listDocuments: () =>
    apiClient.get('/onboarding/documents'),

  // Legal acceptance — ALL required policies must be accepted in one payload.
  acceptLegal: (acceptances) =>
    apiClient.post('/onboarding/legal', { acceptances }),

  // Plan selection (yearly only).
  selectPlan: (planId) =>
    apiClient.post('/onboarding/plan', { planId }),

  // Final submission — REVIEW → SUBMIT APPLICATION. Validates prerequisites
  // server-side and freezes the application at MANUAL_PENDING. No payment is
  // collected during onboarding.
  submitApplication: () =>
    apiClient.post('/onboarding/submit'),

  // ─── Manual payment flow (new simplified onboarding) ──────────────────────
  // Start a new manual payment application (replaces the multi-step flow)
  startManualApplication: (data) =>
    apiClient.post('/onboarding/manual/start', data),

  // QR config/generation endpoints removed — no payment screen is shown to the
  // applicant; payment is verified manually by the Super Admin.

  // Mark payment as received (Super Admin)
  markPaymentReceived: (data) =>
    apiClient.post('/onboarding/manual/payment/receive', data),

  // Get manual application detail
  getManualApplicationDetail: (id) =>
    apiClient.get(`/onboarding/manual/application/${id}`),

  // ─── Email verification (OTP) ───────────────────────────────────────────
  // NOTE: never pass emailVerified from the client — the backend determines
  // verification state server-side. These endpoints are rate-limited.
  sendEmailOtp: (email) =>
    apiClient.post('/onboarding/email/send-otp', { email }),

  verifyEmailOtp: (email, otp) =>
    apiClient.post('/onboarding/email/verify-otp', { email, otp }),

  // Current server-side verification state for an email (public route).
  emailVerificationStatus: (email) =>
    apiClient.get('/onboarding/email/verification-status', { params: { email } }),
};

export default onboardingApi;
