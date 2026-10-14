import { useEffect } from 'react';

/**
 * Lock DOCUMENT-level scrolling while a modal/dialog overlay is open.
 *
 * The overlay itself is a fixed element covering the viewport, so background
 * scrolling must be prevented explicitly on mobile browsers (dynamic toolbars /
 * rubber-band scrolling can still move the document behind a fixed overlay).
 *
 * Only the document scroller is locked — the dialog's own internal scroll
 * container (`overflow-y-auto overscroll-contain`) is untouched, so long
 * dialogs stay scrollable. `touch-action` is deliberately NOT set: it would
 * disable panning for every descendant, including the dialog's scroll area.
 * The previous inline values are restored on close/unmount.
 *
 * @param {boolean} active - true while the overlay is open
 */
export function useBodyScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, [active]);
}

export default useBodyScrollLock;
