// Socket.IO real-time connection.
// Uses dynamic import so missing socket.io-client doesn't crash the app.
// Polling fallback in useSocket hook handles data refresh when socket is down.

import API_BASE_URL from '../config/apiConfig';

let io = null;
let ioPromise = null;

/** Lazy-load socket.io-client — returns null if unavailable */
async function getIO() {
  if (io) return io;
  if (ioPromise) return ioPromise;
  ioPromise = import('socket.io-client').then(
    (mod) => { io = mod.io; return io; },
    () => { io = null; return null; } // not installed → silent fallback
  );
  return ioPromise;
}

let socket = null;
let connectPromise = null;
let listeners = {};

/**
 * Connect to the Socket.IO server.
 * Ensures only ONE connection attempt runs at a time, even with StrictMode
 * double-mounting, by caching the promise returned from the first call.
 * @param {string} token - JWT auth token
 * @returns {Promise<object|null>} socket instance | null
 */
export async function connectSocket(token) {
  // Already connected — return existing socket
  if (socket?.connected) return socket;

  // Connection already in progress — return the existing promise
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    const ioClient = await getIO();
    if (!ioClient) {
      connectPromise = null;
      return null;
    }

    // API_BASE_URL already applies the mixed-content HTTPS guard (Part 12).
    let apiUrl = import.meta.env.VITE_SOCKET_URL || API_BASE_URL;
    if (
      typeof window !== 'undefined' &&
      window.location?.protocol === 'https:' &&
      apiUrl.startsWith('http://')
    ) {
      apiUrl = `https://${apiUrl.slice('http://'.length)}`;
    }
    const serverUrl = apiUrl.replace(/\/api$/, '');

    socket = ioClient(serverUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 5000,
      reconnectionDelayMax: 15000,
      timeout: 5000,
    });

    // Production: no noisy success logs. Development diagnostics via getSocketStatus().
    socket.on('connect', () => {});
    socket.on('disconnect', () => {});

    // Connection errors are expected when backend is temporarily unavailable.
    // Polling fallback handles data refresh. No console spam.
    socket.on('connect_error', () => {});

    connectPromise = null;
    return socket;
  })();

  return connectPromise;
}

/**
 * Disconnect the socket.
 */
export function disconnectSocket() {
  if (socket) {
    Object.keys(listeners).forEach((event) => {
      socket.off(event);
    });
    listeners = {};
    socket.disconnect();
    socket = null;
  }
}

/**
 * Subscribe to a real-time event.
 * @param {string} event - Event name (e.g. 'order:created', 'kot:updated')
 * @param {function} callback - Handler function
 * @returns {function} unsubscribe function
 */
export function onSocketEvent(event, callback) {
  // Socket may not be connected yet (async init) — polling handles data
  if (!socket) {
    return () => {};
  }

  socket.on(event, callback);
  listeners[event] = listeners[event] || [];
  listeners[event].push(callback);

  return () => {
    socket.off(event, callback);
    listeners[event] = listeners[event]?.filter((cb) => cb !== callback);
  };
}

/**
 * Get the current socket connection state.
 */
export function getSocketStatus() {
  return {
    connected: socket?.connected || false,
    id: socket?.id || null,
  };
}

export default {
  connectSocket,
  disconnectSocket,
  onSocketEvent,
  getSocketStatus,
};
