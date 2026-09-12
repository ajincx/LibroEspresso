import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:5000/api",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

export const SESSION_EXPIRED_CODES = new Set([
  "SESSION_EXPIRED_IDLE",
  "SESSION_EXPIRED_ABSOLUTE",
  "SESSION_REVOKED",
  "SESSION_USER_NOT_FOUND",
  "ACCOUNT_INACTIVE",
  "INVALID_SESSION",
]);

export function notifySessionExpired(message = "Your session has expired. Please sign in again.") {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem("libro.auth.message", message);
  window.dispatchEvent(new CustomEvent("libro:session-expired"));
}

export function subscribeToSessionExpired(handler: () => void) {
  window.addEventListener("libro:session-expired", handler);
  return () => window.removeEventListener("libro:session-expired", handler);
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const code = error.response?.data?.error?.code;
    const message = error.response?.data?.error?.message;
    if (message) error.message = message;
    if (error.response?.status === 401 && SESSION_EXPIRED_CODES.has(code)) {
      notifySessionExpired("Your session has expired. Please sign in again.");
    }
    return Promise.reject(error);
  },
);
