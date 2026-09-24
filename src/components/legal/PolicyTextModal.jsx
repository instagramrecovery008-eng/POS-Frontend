import { X } from 'lucide-react';

/**
 * Platform policy texts — the SAME Terms & Conditions and Privacy Policy are
 * shown from the login page and the new-user self-serve registration flow.
 * One source of truth, no duplicate policy pages.
 */
export const POLICY_CONTENT = {
  TERMS_OF_SERVICE: {
    title: 'Terms & Conditions',
    body: `Welcome to Nirka POS. These Terms & Conditions govern your use of the platform.

1. Service. Nirka POS provides cloud restaurant management software (billing, orders, kitchen display, reports) under the plan you select.
2. Your account. You are responsible for safeguarding your login credentials and for all activity under your account. Business information you provide must be accurate.
3. Subscriptions & billing. Plans are billed yearly in advance. Your workspace activates only after payment has been verified by the platform. Refunds are governed by the platform's refund policy.
4. Acceptable use. You agree not to misuse the platform, attempt unauthorised access, or interfere with other tenants.
5. Suspension. The platform may suspend or terminate access for violation of these terms, fraud, or non-payment.
6. Changes. We may update these terms from time to time; continued use after changes constitutes acceptance.`,
  },
  PRIVACY_POLICY: {
    title: 'Privacy Policy',
    body: `Your privacy matters to us.

1. Data we collect. Registration and business details, uploaded verification documents, and operational data needed to run your POS.
2. How data is used. To provide and improve the service, verify your business, process payments, and communicate with you.
3. Tenant isolation. Each restaurant's data is stored in an isolated workspace. Your business documents are never shared with other tenants.
4. Security. Documents are stored privately and are accessible only through authorised, authenticated downloads.
5. Retention & deletion. You may request export or deletion of your data in line with applicable law.
6. Contact. Reach us through the support channel provided on the platform.`,
  },
};

/**
 * Full-text policy modal for the shared platform policy texts.
 * Used by the login page footer links; the self-serve registration Legal step
 * embeds its own acceptance variant.
 */
export default function PolicyTextModal({ type, onClose }) {
  const content = POLICY_CONTENT[type];
  if (!content) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-3" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[85vh] flex flex-col animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <h3 className="text-sm font-extrabold text-slate-800">{content.title}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg cursor-pointer" aria-label="Close">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto text-xs leading-relaxed text-slate-600 space-y-3">
          {content.body.split('\n\n').map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 shrink-0 flex justify-end">
          <button
            onClick={onClose}
            className="h-9 px-4 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
