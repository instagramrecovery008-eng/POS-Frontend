import { useEffect, useRef, useCallback } from 'react';
import { connectSocket, disconnectSocket, onSocketEvent } from '../services/socket';
import { useAuthStore } from '../store';

/**
 * Default data-refresh cadence for screens that fall back to polling when the
 * socket is unavailable. A poll only ever refreshes THIS component's data — it
 * never navigates, reloads the page or resets the user's tab/search/selection.
 */
export const DEFAULT_POLL_INTERVAL_MS = 30000;

/**
 * Hook to subscribe to real-time events via Socket.IO.
 * Falls back to polling at the given interval if WebSocket disconnects.
 *
 * IMPORTANT: Pass pollFn on ONLY ONE useSocketEvent per page to avoid
 * duplicate polling intervals. The useSocket connection is managed
 * by useSocketConnection in AppShell.
 *
 * Polling contract (spec §3):
 *   - exactly ONE interval per hook, always cleared on unmount;
 *   - never overlaps: a tick is skipped while the previous poll is in flight;
 *   - never runs for a hidden tab (data refreshes on return instead);
 *   - a rejected poll is swallowed here — the screen owns its non-blocking
 *     error state. Polling can never navigate or reload the page.
 *
 * @param {object} options
 * @param {string} options.event - The event name to listen for (e.g. 'order:created')
 * @param {function} options.handler - Callback invoked with event data
 * @param {function} [options.pollFn] - Function to call as polling fallback (pass on ONE hook per page)
 * @param {number} [options.pollInterval=DEFAULT_POLL_INTERVAL_MS] - Polling interval in ms
 * @param {boolean} [options.enabled=true] - Whether to enable the listener
 */
export function useSocketEvent({
  event,
  handler,
  pollFn,
  pollInterval = DEFAULT_POLL_INTERVAL_MS,
  enabled = true,
}) {
  const handlerRef = useRef(handler);
  const pollFnRef = useRef(pollFn);
  const intervalRef = useRef(null);

  handlerRef.current = handler;
  pollFnRef.current = pollFn;

  useEffect(() => {
    if (!enabled || !event) return undefined;

    // Subscribe to real-time event
    const unsubscribe = onSocketEvent(event, (data) => {
      handlerRef.current?.(data);
    });

    if (!pollFn) {
      return () => unsubscribe();
    }

    let cancelled = false;
    let inFlight = false;

    const pollNow = async () => {
      if (cancelled || inFlight) return; // no overlapping requests
      // A hidden tab does not need background refreshes; refresh on return.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        await pollFnRef.current?.();
      } catch {
        // The screen owns its own (non-blocking) error state. A failed poll
        // must never navigate, reload, or clear the current screen.
      } finally {
        inFlight = false;
      }
    };

    // Initial load for the screen (also the first poll).
    pollNow();
    intervalRef.current = setInterval(pollNow, pollInterval);

    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        pollNow();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    return () => {
      cancelled = true;
      unsubscribe();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }, [event, enabled, pollInterval]);
}

/**
 * Hook to manage socket connection lifecycle based on auth state.
 * Call this once at the app root level (AppShell.jsx does this).
 * Do NOT call connectSocket from anywhere else.
 */
export function useSocketConnection() {
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (token) {
      connectSocket(token).catch(() => {});
    }
    return () => {
      disconnectSocket();
    };
  }, [token]);
}

export default useSocketEvent;
