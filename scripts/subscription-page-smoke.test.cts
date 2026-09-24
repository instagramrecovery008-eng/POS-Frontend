/**
 * Runtime smoke test for SubscriptionPage — proves the page renders without
 * the "can't access lexical declaration 'activeCycle' before initialization"
 * ReferenceError (TDZ ordering bug).
 *
 * Uses require() exclusively so the stub interception below runs BEFORE the
 * page's module graph is loaded (top-level ESM imports would hoist past it).
 *
 * Run: npx tsx scripts/subscription-page-smoke.test.tsx
 */
const React = require('react');
const { renderToString } = require('react-dom/server');

// ── Stub modules BEFORE importing the page ─────────────────────────────────
const moduleCache = new Map();
const makeStub = (moduleId, factory) => moduleCache.set(moduleId, factory());

makeStub('../../../store', () => ({
  useAuthStore: () => ({
    subscription: { plan: 'PROFESSIONAL', planName: 'Professional', status: 'ACTIVE', daysRemaining: 358, billingCycle: 'YEARLY', expiryDate: '2027-08-07T00:00:00.000Z', planId: 3 },
    refreshSubscription: async () => true,
  }),
  useUiStore: () => ({ addToast: () => {}, goBack: () => {} }),
  useSettingsStore: () => ({ settings: { currencySymbol: '₹' } }),
  useCartStore: () => ({ setOrders: () => {} }),
}));

makeStub('../../../api/subscription.api', () => ({
  subscriptionApi: {
    getMySubscription: async () => ({ data: { plan: 'PROFESSIONAL', planName: 'Professional', planId: 3, status: 'ACTIVE', daysRemaining: 358, billingCycle: 'YEARLY', expiryDate: '2027-08-07T00:00:00.000Z', amount: 24990, startDate: '2026-08-07T00:00:00.000Z' } }),
    refresh: async () => ({ data: { plan: 'PROFESSIONAL' } }),
    listPlans: async () => ({
      data: [
        { id: 1, code: 'BASIC', name: 'Basic', price: 9990, monthlyPrice: 999, yearlyPrice: 9990, action: 'DOWNGRADE', expectedExpiry: '2027-09-07T00:00:00.000Z', billingCycle: 'YEARLY', limits: { maxUsers: 3, maxTables: 10, maxMenuItems: 100, maxOrdersPerMonth: 500 }, modules: [{ key: 'pos', name: 'POS', enabled: true }] },
        { id: 2, code: 'PRO', name: 'Professional', price: 24990, monthlyPrice: 2499, yearlyPrice: 24990, action: 'RENEWAL', expectedExpiry: '2028-08-07T00:00:00.000Z', billingCycle: 'YEARLY', limits: { maxUsers: 10, maxTables: 30, maxMenuItems: 500, maxOrdersPerMonth: 3000 }, modules: [{ key: 'pos', name: 'POS', enabled: true }] },
        { id: 3, code: 'PREMIUM', name: 'Premium', price: 20000, monthlyPrice: 0, yearlyPrice: 20000, action: 'UPGRADE', expectedExpiry: '2028-08-07T00:00:00.000Z', billingCycle: 'YEARLY', limits: { maxUsers: 50, maxTables: 100, maxMenuItems: 5000, maxOrdersPerMonth: 100000 }, modules: [{ key: 'pos', name: 'POS', enabled: true }] },
      ],
    }),
    getPaymentHistory: async () => ({ data: [] }),
    createCheckout: async () => { throw new Error('not in smoke test'); },
    verifyPayment: async () => { throw new Error('not in smoke test'); },
    scheduleDowngrade: async () => ({ data: {} }),
    cancelScheduledDowngrade: async () => ({ data: {} }),
  },
}));

makeStub('../../../hooks/useSocket', () => ({
  useSocketEvent: () => {},
}));

// ── Intercept require for the stubbed module ids ───────────────────────────
const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (moduleCache.has(request)) return request;
  return origResolve.call(this, request, ...rest);
};
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (moduleCache.has(request)) return moduleCache.get(request);
  return origLoad.call(this, request, ...rest);
};

// ── Import (CJS require, not hoisted ESM import) and render the page ───────
const SubscriptionPage = require('../src/features/subscription/pages/SubscriptionPage').default;

let pass = 0, fail = 0;
const check = (cond, msg) => { process.stdout.write(cond ? '  ✅ ' : '  ❌ '); console.log(msg); cond ? pass++ : fail++; };

let html = '';
try {
  html = renderToString(React.createElement(SubscriptionPage));
  check(true, 'SubscriptionPage renders without ReferenceError');
} catch (e) {
  check(false, `Render threw: ${e.message}`);
}

check(html.includes('Subscription & Billing'), 'Page header renders');
check(html.includes('Professional'), 'Current plan name renders');
check(html.includes('358'), 'Days remaining renders');
check(html.includes('Basic') && html.includes('Premium'), 'All plans from API render');
check(html.includes('Renew Plan'), 'RENEWAL action button renders for current plan');
check(html.includes('Upgrade Now'), 'UPGRADE action button renders for higher plan');
check(html.includes('Downgrade at Renewal'), 'DOWNGRADE action renders as schedule (no payment)');
check(html.includes('Yearly'), 'Billing cycle renders');
check(html.includes('2028-08-07') || html.includes('2028'), 'Backend expectedExpiry renders (no client expiry math)');

console.log(`\n  Smoke test → ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
