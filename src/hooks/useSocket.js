import { useEffect, useRef, useCallback } from 'react';
import { connectSocket, disconnectSocket, onSocketEvent } from '../services/socket';
import { useAuthStore } from '../store';

/**
 * Hook to subscribe to real-time events via Socket.IO.
 * Falls back to polling at the given interval if WebSocket disconnects.
 *
 * IMPORTANT: Pass pollFn on ONLY ONE useSocketEvent per page to avoid
 * duplicate polling intervals. The useSocket connection is managed
 * by useSocketConnection in AppShell.
 *
 * @param {object} options
 * @param {string} options.event - The event name to listen for (e.g. 'order:created')
 * @param {function} options.handler - Callback invoked with event data
 * @param {function} [options.pollFn] - Function to call as polling fallback (pass on ONE hook per page)
 * @param {number} [options.pollInterval=30000] - Polling interval in ms
 * @param {boolean} [options.enabled=true] - Whether to enable the listener
 */
export function useSocketEvent({ event, handler, pollFn, pollInterval = 30000, enabled = true }) {
  const handlerRef = useRef(handler);
  const pollFnRef = useRef(pollFn);
  const intervalRef = useRef(null);
  const mountedRef = useRef(true);

  handlerRef.current = handler;
  pollFnRef.current = pollFn;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!enabled || !event) return;

    // Subscribe to real-time event
    const unsubscribe = onSocketEvent(event, (data) => {
      handlerRef.current?.(data);
    });

    // Start polling if this hook has a pollFn
    if (pollFn) {
      // Fire the poll function immediately (once)
      pollFnRef.current?.();

      // Set up the polling interval
      intervalRef.current = setInterval(() => {
        if (mountedRef.current && pollFnRef.current) {
          pollFnRef.current();
        }
      }, pollInterval);
    }

    return () => {
      unsubscribe();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
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
