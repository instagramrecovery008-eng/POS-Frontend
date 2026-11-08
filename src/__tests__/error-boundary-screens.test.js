/**
 * Regression guard — no screen may render the ErrorBoundary fallback.
 *
 * The fallback ("Something went wrong") is a safety net, never a normal state.
 * This test locks down the two things that let it leak into the product:
 *
 *   1. The boundary itself — exercised for real (transformed JSX, instantiated
 *      class) so a change that stops catching errors, that keeps stale error
 *      state, or that leaks details in production fails here.
 *   2. The screen mounting structure — every screen must render inside a
 *      boundary KEYED by the current screen, and every screen in the router map
 *      must resolve to a component whose chunk exists on disk.
 *
 * It also asserts the whole-app browser audit (scripts/page-error-audit.mjs)
 * still opens every main screen and exits non-zero when one shows the fallback,
 * because that is the only place the screens are really rendered.
 *
 * Standalone: node src/__tests__/error-boundary-screens.test.js
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { transformWithEsbuild } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(__dirname, '../..');
const SRC = path.resolve(__dirname, '..');

const read = (rel) => readFileSync(path.join(SRC, rel), 'utf8');
const readFromFrontend = (rel) => readFileSync(path.join(FRONTEND, rel), 'utf8');

const results = { pass: 0, fail: 0 };
function section(title) { console.log(`\n${'='.repeat(64)}\n  ${title}\n${'='.repeat(64)}`); }
function sub(title) { console.log(`\n  --- ${title} ---`); }
function check(cond, msg) { process.stdout.write(cond ? '  ✅ ' : '  ❌ '); console.log(msg); cond ? results.pass++ : results.fail++; }

// ── Collect every string a React element tree would render ──
function collectText(node, out = []) {
  if (node == null || node === false) return out;
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out; }
  if (Array.isArray(node)) { node.forEach((n) => collectText(n, out)); return out; }
  if (node.props) collectText(node.props.children, out);
  return out;
}

// ── Load the real ErrorBoundary (JSX → JS via Vite's esbuild transform) ──
async function loadErrorBoundary() {
  const source = read('components/common/ErrorBoundary.jsx');
  const { code } = await transformWithEsbuild(source, 'ErrorBoundary.jsx', {
    loader: 'jsx',
    jsx: 'automatic',
  });
  const cacheDir = path.join(FRONTEND, 'node_modules/.cache/kgo-test');
  mkdirSync(cacheDir, { recursive: true });
  const file = path.join(cacheDir, `ErrorBoundary.${process.pid}.mjs`);
  writeFileSync(file, code, 'utf8');
  try {
    const mod = await import(pathToFileURL(file).href);
    return mod.default;
  } finally {
    rmSync(file, { force: true });
  }
}

/**
 * Instantiate the class the way React would, without a DOM: `setState` is
 * applied synchronously so `state` reflects what React would re-render with.
 */
function mount(ErrorBoundaryComponent, props) {
  const instance = new ErrorBoundaryComponent(props);
  instance.setState = (next) => {
    instance.state = { ...instance.state, ...(typeof next === 'function' ? next(instance.state) : next) };
  };
  return instance;
}

const ErrorBoundary = await loadErrorBoundary();

section('1. THE BOUNDARY ACTUALLY CATCHES — a screen error becomes the fallback');

sub('Healthy render returns the screen untouched');
{
  const instance = mount(ErrorBoundary, { children: 'SCREEN_CONTENT' });
  check(instance.render() === 'SCREEN_CONTENT', 'children render verbatim while hasError is false');
}

sub('A thrown error is converted into fallback state');
{
  const error = new Error('Cannot access orderType before initialization');
  const derived = ErrorBoundary.getDerivedStateFromError(error);
  check(derived.hasError === true, 'getDerivedStateFromError sets hasError');
  check(derived.error === error, 'getDerivedStateFromError keeps the real error');
  check(typeof ErrorBoundary.prototype.componentDidCatch === 'function', 'componentDidCatch is implemented');
}

sub('The fallback replaces the broken screen (never renders it again)');
{
  const error = new Error('boom');
  const instance = mount(ErrorBoundary, { children: 'BROKEN_SCREEN_CONTENT' });
  instance.setState(ErrorBoundary.getDerivedStateFromError(error));
  const tree = instance.render();
  const text = collectText(tree).join(' | ');
  check(text.includes('Something went wrong'), 'the fallback says "Something went wrong"');
  check(!text.includes('BROKEN_SCREEN_CONTENT'), 'the crashed children are NOT rendered');
  check(/Try Again/.test(text) && /Go Back/.test(text), 'both recovery actions are offered');
}

sub('Try Again / Go Back clear the error so the screen can render again');
{
  const instance = mount(ErrorBoundary, { children: 'SCREEN_CONTENT' });
  instance.setState(ErrorBoundary.getDerivedStateFromError(new Error('boom')));
  const realConsoleError = console.error;
  console.error = () => {};
  try {
    instance.componentDidCatch(new Error('boom'), { componentStack: '\n    at Screen' });
  } finally {
    console.error = realConsoleError;
  }
  instance.handleReset();
  check(instance.state.hasError === false, 'hasError is cleared');
  check(instance.state.error === null, 'the error is cleared');
  check(instance.state.errorInfo === null, 'the component stack is cleared');
  check(instance.render() === 'SCREEN_CONTENT', 'children render again after the reset');
}

sub('Error details are development-only (production stays actionable, not noisy)');
{
  const production = mount(ErrorBoundary, { children: 'SCREEN' });
  production.setState(ErrorBoundary.getDerivedStateFromError(new Error('secret internal failure')));
  const prodText = collectText(production.render()).join(' ');
  check(!prodText.includes('secret internal failure'), 'production fallback hides the raw error');
  check(/Try Again|reload/i.test(prodText), 'production fallback still tells the user what to do');

  const development = mount(ErrorBoundary, { children: 'SCREEN', showError: true });
  development.setState(ErrorBoundary.getDerivedStateFromError(new Error('real cause here')));
  // The boundary logs the failure for whoever debugs it; capture instead of
  // letting the expected error pollute this test's output.
  const logged = [];
  const realConsoleError = console.error;
  console.error = (...args) => logged.push(args.map(String).join(' '));
  try {
    development.componentDidCatch(new Error('real cause here'), { componentStack: 'at TakeOrderWizard' });
  } finally {
    console.error = realConsoleError;
  }
  check(logged.some((line) => line.includes('real cause here')), 'the failure is logged for diagnosis');
  const devText = collectText(development.render()).join(' ');
  check(devText.includes('real cause here'), 'development fallback shows the real message');
  check(devText.includes('at TakeOrderWizard'), 'development fallback shows the component stack');
}

section('2. EVERY SCREEN IS MOUNTED INSIDE A KEYED BOUNDARY (fresh error state per screen)');

const appShell = read('components/layout/app-shell/AppShell.jsx');

check(appShell.includes("import ErrorBoundary from '../../common/ErrorBoundary'"),
  'AppShell imports the shared ErrorBoundary');
check(/<ErrorBoundary key=\{currentScreen\}>[\s\S]{0,300}<ScreenComponent \/>[\s\S]{0,60}<\/ErrorBoundary>/.test(appShell),
  'the active screen renders inside <ErrorBoundary key={currentScreen}>');
check(!/<ErrorBoundary>\s*<Suspense fallback=\{<ScreenFallback \/>\}>\s*<ScreenComponent \/>/.test(appShell),
  'the screen boundary is never left unkeyed (a stale error would survive navigation)');
check(/<ErrorBoundary>[\s\S]{0,120}<TakeOrderWizard \/>[\s\S]{0,40}<\/ErrorBoundary>/.test(appShell),
  'the ordering overlay has its own boundary (a wizard crash cannot blank the page)');
check(/Suspense fallback=\{<ScreenFallback \/>\}/.test(appShell),
  'the Suspense loading fallback is preserved inside the boundary');

section('3. SCREEN MAP INTEGRITY — every route resolves to a real component');

const screenBlock = appShell.slice(
  appShell.indexOf('const ScreenRenderer = {'),
  appShell.indexOf('};', appShell.indexOf('const ScreenRenderer = {'))
);
const screenEntries = [...screenBlock.matchAll(/^\s{2}([a-z_]+):\s*([A-Za-z0-9_]+),/gm)]
  .map(([, key, ident]) => ({ key, ident }));

check(screenEntries.length >= 25, `the screen map is parsed (${screenEntries.length} screens)`);
check(!screenEntries.some((e) => /^(undefined|null)$/.test(e.ident)),
  'no screen maps to undefined/null (which would render the ErrorBoundary after a throw)');

const localComponents = new Set(
  [...appShell.matchAll(/^(?:function|const)\s+([A-Z][A-Za-z0-9_]*)\s*[=(]/gm)].map(([, n]) => n)
);
const importedComponents = new Set(
  [...appShell.matchAll(/^import\s+(?:[\w*{}\s,]+from\s+)?[^\n]*$/gm)]
    .flatMap(([line]) => {
      const def = line.match(/^import\s+([A-Za-z0-9_]+)(?:,|\s+from)/);
      const named = line.match(/\{([^}]+)\}/);
      const out = [];
      if (def) out.push(def[1]);
      if (named) named[1].split(',').forEach((part) => out.push(part.trim().split(/\s+as\s+/).pop()));
      return out;
    })
    .filter(Boolean)
);
const lazyComponents = new Set(
  [...appShell.matchAll(/const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*lazy\(\(\)\s*=>\s*import\('([^']+)'\)\)/g)]
    .map(([, name, spec]) => name)
);

const unknown = screenEntries.filter(
  (e) => !localComponents.has(e.ident) && !importedComponents.has(e.ident) && !lazyComponents.has(e.ident)
);
check(unknown.length === 0,
  `every screen identifier is imported or declared locally${unknown.length ? ` (missing: ${unknown.map((u) => u.ident).join(', ')})` : ''}`);

const lazyChunks = [...appShell.matchAll(/lazy\(\(\)\s*=>\s*import\('([^']+)'\)\)/g)].map(([, spec]) => spec);
const missingChunks = lazyChunks.filter((spec) => !existsSync(path.resolve(SRC, 'components/layout/app-shell', `${spec}.jsx`)));
check(lazyChunks.length > 10, `lazy screen chunks are declared (${lazyChunks.length})`);
check(missingChunks.length === 0,
  `every lazy screen chunk exists on disk${missingChunks.length ? ` (missing: ${missingChunks.join(', ')})` : ''}`);

sub('Every restaurant screen is reachable by some role');
{
  const perms = read('utils/permissions.js');
  const permBlock = perms.slice(perms.indexOf('export const SCREEN_PERMISSIONS'), perms.indexOf('};', perms.indexOf('export const SCREEN_PERMISSIONS')));
  const permKeys = new Set([...permBlock.matchAll(/^\s{2}([a-z_]+):\s*\[/gm)].map(([, k]) => k));
  const systemScreens = new Set(['login', 'expired_locked']);
  const restaurantScreens = screenEntries
    .map((e) => e.key)
    .filter((k) => !k.startsWith('sa_') && !systemScreens.has(k));
  const unroutable = restaurantScreens.filter((k) => !permKeys.has(k));
  check(restaurantScreens.length > 10, `restaurant screens are enumerated (${restaurantScreens.length})`);
  check(unroutable.length === 0,
    `every restaurant screen has a role permission entry${unroutable.length ? ` (missing: ${unroutable.join(', ')})` : ''}`);
}

section('4. THE LIVE AUDIT MUST FAIL ON A FALLBACK SCREEN');

const auditPath = path.join(FRONTEND, 'scripts/page-error-audit.mjs');
check(existsSync(auditPath), 'a whole-app browser audit script exists');
const audit = existsSync(auditPath) ? readFromFrontend('scripts/page-error-audit.mjs') : '';

check(/Something went wrong/i.test(audit), 'the audit detects the ErrorBoundary fallback text');
check(/process\.exit\(1\)/.test(audit), 'the audit exits non-zero when a screen is broken');
check(/boundary:\s*\/Something went wrong\/i\.test\(body\)/.test(audit), 'the boundary flag is read from the rendered page');
check(/REQUIRED_SCREENS/.test(audit) && /required screen could not be opened/.test(audit),
  'a required screen that cannot be opened counts as broken (no silent skips)');

const auditedScreens = [...audit.matchAll(/^  '([^']+)',$/gm)].map(([, s]) => s);
for (const screen of ['Dashboard Overview', 'POS Ordering', 'Floors & Tables', 'Menu & Stock', 'Staff Roster',
  'Active Orders', 'Reports & Sales', 'POS Settings', 'Discounts & Promotions']) {
  check(auditedScreens.includes(screen), `audit covers ${screen}`);
}

const pkg = JSON.parse(readFromFrontend('package.json'));
check(pkg.scripts['verify:page-errors'] === 'node scripts/page-error-audit.mjs',
  'the audit is runnable as `npm run verify:page-errors`');
check(pkg.scripts.test.includes('error-boundary-screens.test.js'),
  'this regression test is part of `npm test`');

section('5. FALLBACK COPY IS WIRED, NOT DEAD');

const boundarySource = read('components/common/ErrorBoundary.jsx');
check(/static getDerivedStateFromError\(error\)/.test(boundarySource), 'the boundary is a real React error boundary');
check(/if \(this\.state\.hasError\)/.test(boundarySource), 'the fallback is gated on hasError');
check(/return this\.props\.children;/.test(boundarySource), 'healthy renders return children');
check(/componentDidCatch\(error, errorInfo\)/.test(boundarySource) && /componentStack/.test(boundarySource),
  'the component stack is captured for diagnosis');
check(/import\.meta\.env\?\.DEV === true/.test(boundarySource), 'raw details are gated on the dev environment');

console.log(`\n${'='.repeat(64)}`);
console.log(`RESULTS: PASSED ${results.pass}  FAILED ${results.fail}`);
if (results.fail) process.exit(1);
