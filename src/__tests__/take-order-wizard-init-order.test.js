/**
 * POS Ordering wizard — initialization order regression suite.
 *
 * The wizard crashed repeatedly with:
 *   ReferenceError: Cannot access 'grantLoaded' before initialization
 *   ReferenceError: Cannot access 'orderType' before initialization
 *   ReferenceError: Cannot access 'currentStep' before initialization
 *
 * All three were the same defect class: a value read (directly, inside a
 * callback, or via a hook DEPENDENCY ARRAY, which is evaluated during render)
 * before its `const` declaration — legal-looking code that throws at runtime
 * and that `tsc --noEmit` cannot see because .jsx files are not type-checked.
 *
 * This suite encodes the invariant so the class of bug cannot come back:
 *   1. no component-scope identifier is referenced above its declaration;
 *   2. every identifier in a hook dependency array is declared before the hook;
 *   3. every state value used has a useState declaration (a lost declaration
 *      made `currentStep` undefined);
 *   4. no component-scope declaration appears twice.
 *
 * Standalone: node src/__tests__/take-order-wizard-init-order.test.js
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..');
const FILE = 'features/pos/workspace/components/TakeOrderWizard.jsx';

const results = { pass: 0, fail: 0 };
function section(title) {
  console.log(`\n${'='.repeat(60)}\n  ${title}\n${'='.repeat(60)}`);
}
function check(condition, message) {
  process.stdout.write(condition ? '  ✅ ' : '  ❌ ');
  console.log(message);
  condition ? results.pass++ : results.fail++;
}

const raw = readFileSync(path.join(SRC, FILE), 'utf8');
// Strip comments AND string literals so prose or a `'tables'` string can never
// be mistaken for a read of a binding (both are masked, newlines preserved so
// line numbers stay accurate).
const source = raw
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length))
  .replace(/'(?:[^'\\\n]|\\.)*'/g, (m) => "'" + ' '.repeat(Math.max(0, m.length - 2)) + "'")
  .replace(/"(?:[^"\\\n]|\\.)*"/g, (m) => '"' + ' '.repeat(Math.max(0, m.length - 2)) + '"');

const lines = source.split('\n');
const componentStart = lines.findIndex((l) => /export default function TakeOrderWizard/.test(l));
check(componentStart > -1, 'the TakeOrderWizard component was found');
const body = lines.slice(componentStart);

// ── Component-scope declarations (exactly two leading spaces) ──────────────
const declarations = new Map(); // name -> line index within `body`
const duplicates = [];
body.forEach((line, idx) => {
  if (!/^ {2}(const|let|function) /.test(line)) return;
  const arrayMatch = line.match(/^ {2}const \[([^\]]+)\]/);
  const objectMatch = line.match(/^ {2}const \{([^}]+)\}/);
  const plainMatch = line.match(/^ {2}(?:const|let|function) ([A-Za-z_$][\w$]*)/);
  const names = [];
  if (arrayMatch) {
    names.push(...arrayMatch[1].split(',').map((n) => n.trim().split(':').pop().trim()).filter(Boolean));
  } else if (objectMatch) {
    names.push(...objectMatch[1].split(',').map((n) => n.trim().split(':').pop().trim()).filter(Boolean));
  } else if (plainMatch) {
    names.push(plainMatch[1]);
  }
  names.forEach((name) => {
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) return;
    if (declarations.has(name)) duplicates.push(name);
    else declarations.set(name, idx);
  });
});

section('1. Every component-scope declaration happens exactly once');
check(duplicates.length === 0, `no duplicate component-scope declarations${duplicates.length ? ': ' + [...new Set(duplicates)].join(', ') : ''}`);

section('2. No identifier is read above its declaration (temporal dead zone)');
const tokenUseRegex = (name) => new RegExp(`(^|[^\\w$.])${name.replace(/\$/g, '\\$')}(?![\\w$])`);
const tdzViolations = [];
declarations.forEach((declLine, name) => {
  const re = tokenUseRegex(name); // ONE regex per name (a fresh one per
  for (let i = 0; i < declLine; i++) { // exec() call would loop forever)
    const line = body[i];
    // Only RENDER-TIME statements matter here. Lines indented past the
    // component scope live inside function bodies (`loadInitialData()`,
    // `resetWizard()`, effects) that run AFTER every declaration exists —
    // calling a later-declared function from them is legal and common.
    if (!/^ {2}\S/.test(line)) continue;
    const match = re.exec(line);
    if (!match) continue;
    const after = line.slice(match.index + match[0].length).trimStart();
    // `name:` is an object key / label, not a read of the binding.
    if (after.startsWith(':')) continue;
    tdzViolations.push(`${name} (used line ${i + 1}, declared line ${declLine + 1})`);
  }
});
check(
  tdzViolations.length === 0,
  `no read-before-initialization${tdzViolations.length ? ': ' + tdzViolations.slice(0, 6).join(' | ') : ''}`
);

section('3. Hook dependency arrays only reference declared values');
const hookDepViolations = [];
const hookRegex = /\}, \[([^\]]*)\]\)/g;
let hookMatch;
while ((hookMatch = hookRegex.exec(source)) !== null) {
  const hookLine = source.slice(0, hookMatch.index).split('\n').length;
  hookMatch[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((dep) => {
      const root = dep.split(/[.[]/)[0].trim();
      if (!declarations.has(root)) return; // store value / import / global
      const declLine = componentStart + declarations.get(root) + 1;
      if (declLine > hookLine) hookDepViolations.push(`${root} (dep line ${hookLine}, declared ${declLine})`);
    });
}
check(
  hookDepViolations.length === 0,
  `every dependency is initialized before its hook${hookDepViolations.length ? ': ' + hookDepViolations.slice(0, 6).join(' | ') : ''}`
);

section('4. Every state value used has a useState declaration');
// Setters provided by the stores / imports / platform (never local useState).
const EXTERNAL_SETTERS = new Set([
  'setScreen', 'setShowTakeOrderWizard', 'setActiveOrderTakingId', 'setPendingTable',
  'setCheckoutOrderId', 'setOrden', 'setTimeout', 'setInterval', 'setChipRowRef', 'setItem',
]);
const usedSetters = new Set();
body.forEach((line) => {
  const m = line.match(/\bset[A-Z][\w$]*(?=\()/g);
  if (m) m.forEach((s) => usedSetters.add(s));
});
const missingSetters = [...usedSetters].filter((s) => !declarations.has(s) && !EXTERNAL_SETTERS.has(s));
check(
  missingSetters.length === 0,
  `no state setter is used without a declaration${missingSetters.length ? ': ' + missingSetters.join(', ') : ''}`
);

section('5. The specific values from the reported crashes');
const requiresOrder = [
  ['orderType', ['isTakeaway', 'needsTable', 'maxStep', 'tableFlowReturnScreen', 'advanceOnce']],
  ['currentStep', ['advanceOnce', 'goNext', 'goBack', 'displayStep', 'isMenuStep']],
  ['grantLoaded', ['orderTypeResolution']],
];
requiresOrder.forEach(([source_, dependents]) => {
  const sourceLine = declarations.get(source_);
  check(sourceLine !== undefined, `${source_} has a declaration`);
  dependents.forEach((dep) => {
    const depLine = declarations.get(dep);
    check(
      sourceLine !== undefined && depLine !== undefined && sourceLine < depLine,
      `${dep} is declared after ${source_} (dependency order preserved)`
    );
  });
});

check(/const \[currentStep, setCurrentStep\] = useState\(/.test(raw), 'currentStep is a useState value (resetWizard/goNext/goBack set it)');
check(/const \[orderType, setOrderType\] = useState\(/.test(raw), 'orderType is a useState value');
check(/const isExemptRole = /.test(raw) && raw.indexOf('const isExemptRole =') < raw.indexOf('const grantLoaded ='),
  'isExemptRole is declared before grantLoaded reads it');

section('6. Hook calls are unconditional and at the top level');
// The component crashed with "React has detected a change in the order of
// Hooks" because a store hook was short-circuited inside `&&`: when the
// barcode scanner was unavailable the hook was skipped, so the next render
// called a different sequence (updateCallback). These checks lock the rule in.
const HOOK_CALL = /\buse[A-Z][A-Za-z0-9_$]*\s*\(/;
const hookLines = [];
body.forEach((line, idx) => { if (HOOK_CALL.test(line)) hookLines.push(idx); });
check(hookLines.length > 0, `hook calls are found (${hookLines.length})`);

const expressionHooks = body
  .map((line, idx) => [idx, line])
  .filter(([, line]) => /(&&|\|\||\?\?|\?)\s*use[A-Z][A-Za-z0-9_$]*\s*\(/.test(line))
  .map(([idx]) => idx + componentStart + 1);
check(
  expressionHooks.length === 0,
  `no hook is called inside a boolean/ternary expression${expressionHooks.length ? ' (line ' + expressionHooks.join(', ') + ')' : ''}`
);

const nestedHooks = hookLines
  .filter((idx) => !/^ {2}\S/.test(body[idx]) && !/^ {2}$/.test(body[idx]))
  .map((idx) => idx + componentStart + 1);
check(
  nestedHooks.length === 0,
  `every hook call is a component-scope statement, never nested in a block/callback${nestedHooks.length ? ' (line ' + nestedHooks.join(', ') + ')' : ''}`
);

const lastHookIdx = hookLines.length ? Math.max(...hookLines) : -1;
const returnsBeforeHooks = body
  .slice(0, Math.max(0, lastHookIdx))
  .map((line, idx) => [idx, line])
  .filter(([, line]) => /^ {2}(if \(|return\b)/.test(line))
  .map(([idx]) => idx + componentStart + 1);
check(
  returnsBeforeHooks.length === 0,
  `no conditional return runs before the last hook (hooks stay unconditional)${returnsBeforeHooks.length ? ' (line ' + returnsBeforeHooks.join(', ') + ')' : ''}`
);

// The reported bug, specifically: the barcode flag must be read unconditionally
// and combined afterwards, never fetched through an inline hook call.
check(
  /^ {2}const barcodeEnabled = useSettingsStore\(\(s\) => s\.settings\?\.barcodeScannerEnabled === true\);$/m.test(raw),
  'the barcode-scanner flag is read by its own unconditional store hook'
);
check(
  /^ {2}const canScanBarcode = barcodeAvailable && barcodeSupported && barcodeEnabled;$/m.test(raw),
  'canScanBarcode combines the flags AFTER the hooks (no inline hook in the expression)'
);

section('7. Every value rendered by the JSX exists before the render');
const returnIdx = body.findIndex((l) => /^ {2}return \(/.test(l));
check(returnIdx > -1, 'the component render block was found');
['wizardCaps', 'skipFloorMgmtResolved', 'grantLoaded', 'orderTypeResolution', 'acNonAcPricing',
 'currency', 'isPageMode', 'orderType', 'currentStep', 'isTakeaway', 'needsTable', 'maxStep',
 'tableFlowReturnScreen', 'isEditing'].forEach((name) => {
  const declLine = declarations.get(name);
  check(declLine !== undefined && declLine < returnIdx, `${name} is initialized before the JSX render`);
});

console.log(`\n${'='.repeat(60)}`);
console.log(`RESULTS: PASSED ${results.pass}  FAILED ${results.fail}`);
if (results.fail) process.exit(1);
