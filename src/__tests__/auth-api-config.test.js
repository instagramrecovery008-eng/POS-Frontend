/**
 * Login transport configuration + credential hygiene — frontend tests.
 * Standalone: node src/__tests__/auth-api-config.test.js
 *
 * Why this exists: a POS that cannot reach its backend reports login failures
 * that look like credential problems. These source invariants keep the three
 * ways that happens from coming back:
 *
 *   1. API base URL — the deployed HTTPS backend is used, and a build that
 *      would embed `localhost` (an Android/APK bundle) is caught here.
 *   2. Error surfacing — 400 / 401 / 403 / 500 responses keep their HTTP status
 *      and the server's message, so a disabled account or a server error is
 *      never displayed as "Invalid credentials".
 *   3. Credential hygiene — only the token and the user record are persisted;
 *      no password is written to localStorage.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..');
const ROOT = path.resolve(SRC, '..');
const read = (rel) => readFileSync(path.join(SRC, rel), 'utf8');
const readRoot = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

let pass = 0, fail = 0;
function section(t) { console.log(`\n${'='.repeat(60)}\n  ${t}\n${'='.repeat(60)}`); }
function check(cond, msg) { process.stdout.write(cond ? '  ✅ ' : '  ❌ '); console.log(msg); cond ? pass++ : fail++; }

const apiConfig = read('config/apiConfig.js');
const axiosSrc = read('api/axios.js');
const authStore = read('store/authStore.js');
const loginPage = read('features/auth/pages/LoginPage.jsx');
const loginForm = read('features/auth/components/LoginForm.jsx');
const forcePage = read('features/auth/pages/ForceChangePasswordPage.jsx');
const pkg = JSON.parse(readRoot('package.json'));

// ═══ 1. API base URL ═══
section('1. API BASE URL (Railway HTTPS backend)');
check(/VITE_API_URL/.test(apiConfig), 'the base URL comes from VITE_API_URL (build-time configuration)');
check(/https:\/\//.test(apiConfig) && /Mixed Content|mixed-content|upgraded/.test(apiConfig), 'an http:// base URL is upgraded to https:// when the page is https (mixed-content guard)');
check(/baseURL:\s*API_BASE_URL/.test(axiosSrc), 'the axios client uses the resolved base URL for every request');
check(/import\.meta\.env\.VITE_API_URL/.test(apiConfig), 'the env var is read through import.meta.env (Vite)');

section('1b. Android / APK bundle never embeds localhost');
const androidScript = pkg.scripts['android:sync'] || '';
check(/--mode android/.test(androidScript), `android:sync builds with --mode android (got: ${androidScript || 'missing'})`);
const androidEnvPath = path.join(ROOT, '.env.android');
if (existsSync(androidEnvPath)) {
  const androidEnv = readRoot('.env.android');
  // Only the ACTIVE (uncommented) assignment counts — the file's comments
  // legitimately mention localhost while explaining what to avoid.
  const activeUrl = (androidEnv.match(/^\s*VITE_API_URL=(.+)$/m) || [])[1] || '';
  check(/^https:\/\//.test(activeUrl.trim()), `.env.android uses an https backend (got: ${activeUrl.trim() || 'none'})`);
  check(!/localhost|127\.0\.0\.1/.test(activeUrl), '.env.android does not point at localhost (an APK cannot reach the build machine)');
} else {
  console.log('  • .env.android not present (git-ignored local file) — skipped');
}

// ═══ 2. Login request + error surfaces ═══
section('2. LOGIN REQUEST + DISTINCT ERROR HANDLING');
check(/authApi\.login\(email, password\)/.test(authStore), 'the login action posts the intended email + password');
check(/processedError\.status = error\.response\?\.status/.test(axiosSrc), 'the HTTP status is attached to every failed request');
check(/data\?\.message/.test(axiosSrc), "the server's message is preferred over a generic axios message");
check(/status = 0/.test(axiosSrc), 'a network failure is distinguishable from a server error (status 0)');
check(/APPLICATION_PENDING/.test(authStore) && /APPLICATION_REJECTED/.test(authStore), 'applicant states surface the backend message instead of "Invalid credentials"');
check(/authError\.status = e\.status/.test(authStore), 'the login action preserves the status for the UI');
check(/localError|error/.test(loginPage) && /LoginForm/.test(loginPage), 'the login page renders the authentication error from the store');
check(!/Invalid credentials['"]\s*\)\s*:/.test(loginPage), 'the login page does not hardcode "Invalid credentials" for every failure');
check(/onSubmit=\{/.test(loginPage) && /login/.test(loginPage), 'the login form submits through the auth store');

// ═══ 3. Forced password change ═══
section('3. FORCED PASSWORD CHANGE');
check(/mustChangePassword/.test(authStore), 'the forced-change flag is tracked by the auth store');
check(/authApi\.changePassword\(currentPassword, newPassword\)/.test(forcePage), 'the forced-change screen calls change-password with the current + new password');
check(/logout\(\)/.test(forcePage), 'a successful change clears the session (fresh sign-in with the new credential)');
check(/Enter your temporary password/.test(forcePage), 'the screen asks for the temporary password the admin handed over');

// ═══ 4. No password is ever persisted ═══
section('4. CREDENTIAL HYGIENE');
check(/localStorage\.setItem\(STORAGE_KEY_TOKEN/.test(authStore), 'the session token is persisted');
check(/localStorage\.setItem\(STORAGE_KEY_USER, JSON\.stringify\(resp\.user\)\)/.test(authStore), 'the user record is persisted');
check(!/localStorage\.setItem\([^)]*password/i.test(authStore), 'no password is written to localStorage');
check(!/sessionStorage\.setItem\([^)]*password/i.test(authStore), 'no password is written to sessionStorage');
check(/autoComplete="current-password"/.test(loginForm) && /type=\{showPassword \? 'text' : 'password'\}/.test(loginForm), 'the password field is masked by default with the right autocomplete hint');

section('RESULT');
console.log(`  auth-api-config: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
