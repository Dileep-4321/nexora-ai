import { io } from "socket.io-client";
import { getApiBaseUrl } from "./api";

let activeSocket = null;
let currentToken = null;

export function getSocketHost() {
  const apiBase = getApiBaseUrl();
  // Strip trailing /api/v1 or /api
  return apiBase.replace(/\/api(\/v1)?\/?$/, "");
}

/**
 * Initializes or returns an authenticated singleton Socket.io instance
 * @param {string} token - JWT bearer token
 * @param {function} onStatusChange - optional callback for connection state changes
 */
export function getSocket(token, onStatusChange = null) {
  if (typeof window === "undefined") return null;

  if (!token) {
    if (activeSocket) {
      activeSocket.disconnect();
      activeSocket = null;
    }
    if (onStatusChange) onStatusChange("disconnected");
    return null;
  }

  // If already connected with same token, reuse existing socket
  if (activeSocket && currentToken === token) {
    if (onStatusChange) {
      onStatusChange(activeSocket.connected ? "connected" : "connecting");
    }
    return activeSocket;
  }

  // Disconnect previous socket if token changed
  if (activeSocket) {
    activeSocket.disconnect();
    activeSocket = null;
  }

  currentToken = token;
  const socketHost = getSocketHost();

  activeSocket = io(socketHost, {
    auth: { token },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    autoConnect: true,
  });

  if (onStatusChange) {
    onStatusChange("connecting");

    activeSocket.on("connect", () => {
      onStatusChange("connected");
    });

    activeSocket.on("disconnect", (reason) => {
      onStatusChange(reason === "io client disconnect" ? "disconnected" : "fallback");
    });

    activeSocket.on("connect_error", () => {
      onStatusChange("fallback");
    });

    activeSocket.io.on("reconnect_attempt", () => {
      onStatusChange("reconnecting");
    });

    activeSocket.io.on("reconnect", () => {
      onStatusChange("connected");
    });
  }

  return activeSocket;
}

/**
 * Subscribes the socket to a specific project room with server-side authorization check
 */
export function subscribeToProject(socket, projectId, callback = null) {
  if (!socket || !socket.connected || !projectId) return;

  socket.emit("project:join", { projectId }, (response) => {
    if (callback) callback(response);
  });
}

/**
 * Unsubscribes the socket from a project room
 */
export function unsubscribeFromProject(socket, projectId) {
  if (!socket || !projectId) return;
  socket.emit("project:leave", { projectId });
}

/**
 * Disconnects and cleans up active socket
 */
export function disconnectSocket() {
  if (activeSocket) {
    activeSocket.disconnect();
    activeSocket = null;
    currentToken = null;
  }
}
