import { useEffect, useRef } from 'react';

/**
 * Keyboard-wedge barcode scanner capture (USB/Bluetooth HID).
 *
 * A wedge scanner behaves like a very fast typist: it types the code and
 * presses Enter. This hook reconstructs that burst WITHOUT stealing input from
 * real typing:
 *
 *   • the target element decides: keystrokes aimed at ANY text-entry surface
 *     (input / textarea / select / contenteditable) are never captured, so the
 *     search box, a password field or a notes box keep working normally;
 *   • the burst must arrive scanner-fast — every inter-key gap ≤ MAX_GAP_MS
 *     and the whole burst ≤ MAX_DURATION_MS. Human typing is far slower and is
 *     left alone, so a manual search is never mistaken for a scan;
 *   • Enter only submits the buffer as a scan when it is ≥ MIN_LENGTH (real
 *     barcodes are long), so a stray fast keystroke + Enter cannot add an item;
 *   • modifiers (Ctrl/Alt/Meta/Tab/Escape) break the burst and are ignored;
 *   • `enabled: false` attaches NO listener at all — with the scanner off (or
 *     unsupported for this business type) ordering is exactly as before.
 *
 * Nothing here knows about the menu: the caller decides what a resolved code
 * does (add to cart, …), keeping the POS order engine single-sourced.
 */

export const MAX_GAP_MS = 50;      // max gap between two scanner keystrokes
export const MAX_DURATION_MS = 1500; // max total burst length
export const MIN_LENGTH = 4;       // shortest string treated as a barcode

/** True when the element is a surface the user types into by hand. */
export function isTextEntryTarget(target) {
  if (!target) return false;
  const tag = String(target.tagName || '').toLowerCase();
  if (tag === 'textarea' || tag === 'select') return true;
  if (tag === 'input') {
    // Non-text inputs (checkbox/radio/button/submit/…) are not text entry.
    const type = String(target.type || 'text').toLowerCase();
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image'].includes(type);
  }
  return target.isContentEditable === true;
}

/**
 * Pure burst classifier — exported for tests (no DOM, no React).
 * @returns {{handleKeydown: (e: object) => string|null, reset: () => void}}
 */
export function createWedgeBuffer({ onScan, minGap = MAX_GAP_MS, maxDuration = MAX_DURATION_MS, minLength = MIN_LENGTH } = {}) {
  let buffer = '';
  let lastAt = 0;
  let startedAt = 0;

  const reset = () => { buffer = ''; lastAt = 0; startedAt = 0; };

  const handleKeydown = (e) => {
    if (!e) return null;
    // Never capture from a text field (search box, password, notes…).
    if (isTextEntryTarget(e.target)) { reset(); return null; }
    if (e.ctrlKey || e.altKey || e.metaKey) { reset(); return null; }

    const isEnter = e.key === 'Enter';
    const isPrintable = typeof e.key === 'string' && e.key.length === 1;

    if (!isEnter && !isPrintable) { reset(); return null; }

    const now = Date.now();
    // A gap longer than a scanner can produce ends the burst (human typing).
    if (buffer && (now - lastAt) > minGap) reset();
    if (!buffer) startedAt = now;
    else if ((now - startedAt) > maxDuration) { reset(); return null; }

    lastAt = now;

    if (!isPrintable) {
      // Enter: submit the buffer only when it looks like a real barcode.
      if (buffer.length >= minLength) {
        const code = buffer;
        reset();
        onScan?.(code);
        return code;
      }
      reset();
      return null;
    }

    buffer += e.key;
    return null;
  };

  return { handleKeydown, reset };
}

/**
 * @param {object} params
 * @param {boolean} params.enabled  plan entitlement AND business capability AND
 *                                  the tenant's scanner toggle
 * @param {(code: string) => void} params.onScan  resolved code handler
 */
export default function useKeyboardWedgeScanner({ enabled, onScan }) {
  const cbRef = useRef(onScan);
  cbRef.current = onScan;

  useEffect(() => {
    if (!enabled) return undefined; // scanning disabled → no listener at all

    const { handleKeydown, reset } = createWedgeBuffer({
      onScan: (code) => cbRef.current?.(code),
    });

    const listener = (e) => handleKeydown(e);
    // bubble phase on purpose: a handler on a text field can still run first
    // and stopPropagation() to keep its own input.
    document.addEventListener('keydown', listener);
    // A focus change mid-burst must not leave a stale buffer behind.
    window.addEventListener('blur', reset);

    return () => {
      document.removeEventListener('keydown', listener);
      window.removeEventListener('blur', reset);
    };
  }, [enabled]);
}
