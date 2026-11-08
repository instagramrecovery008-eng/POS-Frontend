/**
 * Subdomain workspaces (frontend).
 *
 *  1. Hostname → workspace detection matches the backend rules.
 *  2. The API client sends the workspace hint on every request.
 *  3. The login page renders the workspace identity, handles unknown/inactive
 *     workspaces explicitly and never offers platform sign-up inside a tenant.
 *  4. A stored session from another restaurant is logged out on the wrong host.
 *  5. Super Admin can set the workspace subdomain; numeric settings stay text
 *     while editing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const section = (t) => console.log(`\n${'='.repeat(68)}\n  ${t}\n${'='.repeat(68)}`);
const sub = (t) => console.log(`\n-- ${t}`);
const check = (cond, msg) => { process.stdout.write(cond ? '  ✅ ' : '  ❌ '); console.log(msg); cond ? pass++ : fail++; };
const eq = (actual, expected, label) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  process.stdout.write(ok ? '  ✅ ' : '  ❌ ');
  console.log(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  ok ? pass++ : fail++;
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_ROOT = path.resolve(ROOT, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readProject = (rel) => fs.readFileSync(path.join(PROJECT_ROOT, rel), 'utf8');

// ═══ 1. Hostname detection ══════════════════════════════════════════════════
section('1. Browser hostname → workspace');
const {
  resolveTenantHost,
  isValidSubdomainLabel,
  getTenantOrigin,
  PLATFORM_ROOT_DOMAIN,
} = await import(pathToFileURL(path.join(ROOT, 'config/tenantConfig.js')).href);

eq(PLATFORM_ROOT_DOMAIN, 'klargopos.in', 'default platform root domain');

sub('Platform hosts');
eq(resolveTenantHost('klargopos.in').mode, 'platform', 'root domain');
eq(resolveTenantHost('www.klargopos.in').mode, 'platform', 'www');
eq(resolveTenantHost('api.klargopos.in').mode, 'platform', 'api');
eq(resolveTenantHost('localhost').mode, 'platform', 'localhost');
eq(resolveTenantHost('127.0.0.1').mode, 'platform', 'loopback');
eq(resolveTenantHost('admin.klargopos.in').mode, 'admin', 'admin portal');

sub('Restaurant workspaces');
eq(resolveTenantHost('grill.klargopos.in'), { mode: 'tenant', slug: 'grill', host: 'grill.klargopos.in' }, 'tenant host');
eq(resolveTenantHost('PUNCH.klargopos.in').slug, 'punch', 'case-insensitive');
eq(resolveTenantHost('grill.klargopos.in:3000').slug, 'grill', 'port stripped');
eq(resolveTenantHost('grill.localhost:3000').slug, 'grill', 'local workspace preview');

sub('Explicit failures, never guesses');
eq(resolveTenantHost('a.b.klargopos.in').mode, 'unknown', 'nested subdomain is unknown');
eq(resolveTenantHost('notklargopos.in').mode, 'platform', 'foreign domain falls back to platform');

sub('Labels / URLs');
check(isValidSubdomainLabel('grill-2'), 'hyphenated label valid');
check(!isValidSubdomainLabel('-grill'), 'leading hyphen rejected');
check(!isValidSubdomainLabel('a_b'), 'underscore rejected');
eq(getTenantOrigin('grill'), 'https://grill.klargopos.in', 'tenant origin');

// ═══ 2. API client attaches the workspace ═══════════════════════════════════
section('2. API client workspace header');
const axiosSource = read('api/axios.js');
check(axiosSource.includes("getCurrentTenantSlug"), 'axios resolves the workspace from the hostname');
check(axiosSource.includes("X-Tenant-Slug"), 'axios sends X-Tenant-Slug');
check(/tenant:\s*tenant/.test(axiosSource) || axiosSource.includes('${tenant}'), 'request dedup key includes the workspace');

// ═══ 3. Login page ══════════════════════════════════════════════════════════
section('3. Login page workspace branding + error states');
const loginSource = read('features/auth/pages/LoginPage.jsx');
check(loginSource.includes('useTenantStore'), 'login page uses the tenant store');
check(loginSource.includes('loadTenant()'), 'login page loads the workspace on mount');
check(loginSource.includes('TENANT_INACTIVE'), 'inactive workspace has a dedicated message');
check(loginSource.includes('Try again') && loginSource.includes("force: true"), 'workspace error offers retry');
check(loginSource.includes('workspaceLabel'), 'login page shows the workspace address');
check(loginSource.includes('Create New Account') && loginSource.includes('href={getPlatformOrigin()}'),
  'tenant host links to platform sign-up');
check(loginSource.includes('getPlatformOrigin'), 'platform origin helper used');
check(!loginSource.includes('emailApi'), 'no unrelated API client added');
check(loginSource.includes('A product by Infinixo Technologies') || loginSource.includes('{COMPANY.attribution}'),
  'the Infinixo attribution is rendered without a logo plate');
check(loginSource.includes('BrandLogo'), 'the QWIKOUT POS logo is rendered through the shared component');

// ═══ 4. Session/workspace guard ═════════════════════════════════════════════
section('4. App shell refuses a session from another workspace');
const shellSource = read('components/layout/app-shell/AppShell.jsx');
check(shellSource.includes('useTenantStore'), 'app shell resolves the workspace');
check(shellSource.includes('Number(user.restaurantId) !== Number(tenant.id)'), 'membership is checked');
check(shellSource.includes('does not belong to the'), 'mismatch explains the logout');
check(shellSource.includes('TENANT_NOT_FOUND') && shellSource.includes('TENANT_INACTIVE'), 'rejected workspaces clear the session');

// ═══ 5. Super Admin + numeric settings ═══════════════════════════════════════
section('5. Super Admin workspace + numeric inputs');
const restaurantForm = read('features/super-admin/components/RestaurantForm.jsx');
check(restaurantForm.includes('Workspace Subdomain'), 'restaurant form exposes the subdomain');
check(restaurantForm.includes("subdomain: cleanSubdomain || undefined"), 'edits submit the subdomain');
check(restaurantForm.includes('PLATFORM_ROOT_DOMAIN'), 'form shows the platform suffix');

const systemSettings = read('features/super-admin/pages/SystemSettings.jsx');
check(systemSettings.includes('sanitizeNumeric'), 'numeric settings use the shared sanitizer');
check(!systemSettings.includes("Number(e.target.value)"), 'no per-keystroke Number() conversion remains');
check(systemSettings.includes('validateNumericFields'), 'numeric settings validate at submit');
check(systemSettings.includes("port < 1 || port > 65535"), 'SMTP port is range-checked');

// ═══ 6. Backend contract sanity ═════════════════════════════════════════════
section('6. Backend contract');
const serverSource = readProject('backend/src/routes/tenant.routes.js');
check(serverSource.includes('/resolve'), 'public resolve route exists');
const schema = readProject('backend/prisma/schema.prisma');
check(schema.includes('subdomain        String?          @unique'), 'restaurant subdomain is unique');
const migration = readProject('backend/prisma/migrations/20261023000000_add_restaurant_subdomain/migration.sql');
check(migration.includes('CREATE UNIQUE INDEX "Restaurant_subdomain_key"'), 'migration adds the unique index');
const authMiddleware = readProject('backend/src/middleware/auth.middleware.js');
check(authMiddleware.includes('TENANT_MISMATCH'), 'auth middleware rejects cross-workspace tokens');
check(authMiddleware.includes('req.tenant'), 'auth middleware consumes the resolved workspace');

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
