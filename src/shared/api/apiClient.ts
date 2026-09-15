import axios, { CanceledError, InternalAxiosRequestConfig } from "axios";
import { environment } from "@config/env";
import { useAuthStore } from "../store/useAuthStore";
import { getDeviceId } from "./deviceId";
import { useNetworkStore, isNetworkError } from "../offline/network";

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
  /** Who was signed in when this request was first sent. */
  _userId?: string | null;
}

export const apiClient = axios.create({
  baseURL: environment.apiUrl,
  headers: { "Content-Type": "application/json" },
  timeout: 30_000,
});

/**
 * A request belongs to the person who made it. On a shared ward tablet the
 * next nurse can sign in while the last one's request is still waiting on a bad
 * connection; its 401-and-retry must not go out again carrying the new
 * session's token, which would file the first nurse's vitals under the second
 * nurse's name.
 */
const signedInAs = () => useAuthStore.getState().user?.id ?? null;

apiClient.interceptors.request.use(async (config) => {
  const pinned = config as RetryableConfig;
  if (pinned._userId === undefined) pinned._userId = signedInAs();
  else if (pinned._userId !== signedInAs()) {
    throw new CanceledError("The signed-in user changed before this request was sent", undefined, config);
  }
  // Read from the store directly rather than through React, so this works
  // outside a component tree (background sync, the offline outbox).
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers["x-device-id"] = await getDeviceId();
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    useNetworkStore.getState().setOnline(true);
    return response;
  },
  async (error) => {
    // Any answer, even a refusal, proves the server is reachable. No answer at
    // all is the fastest signal the device has that it is not.
    if (error?.response) useNetworkStore.getState().setOnline(true);
    else if (isNetworkError(error)) useNetworkStore.getState().setOnline(false);

    const originalRequest = error.config as RetryableConfig | undefined;
    if (!originalRequest) return Promise.reject(error);

    // Never try to refresh the refresh call, and never loop.
    if (originalRequest.url?.includes("/auth/refresh") || originalRequest._retry) {
      return Promise.reject(error);
    }

    const { token, refreshToken } = useAuthStore.getState();
    if (!token && !refreshToken) return Promise.reject(error);
    // Someone else's session now: nothing of theirs to refresh for this request.
    if (originalRequest._userId && originalRequest._userId !== signedInAs()) return Promise.reject(error);

    if (error.response?.status === 401) {
      originalRequest._retry = true;
      const newToken = await useAuthStore.getState().refreshSession();
      if (newToken) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      }
    }

    return Promise.reject(error);
  },
);

/** The server's machine-readable code, when it sent one. */
export function apiErrorCode(err: unknown): string | undefined {
  return (err as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error
    ?.code;
}

/** The structured detail the server attached to a refusal, when it sent any. */
export function apiErrorDetails<T>(err: unknown): T | undefined {
  return (err as { response?: { data?: { error?: { details?: T } } } })?.response?.data?.error?.details;
}

/** Turns a Zod path into something a receptionist can act on. */
function fieldLabel(path: (string | number)[]) {
  const parts = path.filter((p) => p !== "body" && p !== "query" && p !== "params");
  const idx = parts.findIndex((p) => typeof p === "number");
  const name = parts.filter((p) => typeof p === "string").pop();
  if (!name) return "";
  const pretty = String(name)
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
  return idx >= 0 ? `Item ${Number(parts[idx]) + 1} — ${pretty}` : pretty;
}

/**
 * One readable sentence out of any failure shape.
 *
 * Validation issues are unpacked into the specific fields rather than showing
 * "Validation error", because the person reading it is standing at a desk with
 * a patient in front of them and needs to know which box is wrong.
 */
export function apiErrorMessage(err: unknown, fallback = "Something went wrong") {
  const e = err as {
    code?: string;
    message?: string;
    response?: {
      data?: {
        error?: {
          message?: string;
          details?: { issues?: { path: (string | number)[]; message: string }[] };
        };
      };
    };
  };

  // No response at all means the request never arrived.
  if (!e?.response) {
    if (e?.code === "ECONNABORTED") return "That took too long. Check the connection and try again.";
    if (err instanceof Error && /Network/i.test(err.message)) {
      return "No connection to the hospital server.";
    }
  }

  const error = e?.response?.data?.error;
  const plain = !error && err instanceof Error && err.message ? err.message : "";
  const message = error?.message || plain || fallback;

  const issues = error?.details?.issues;
  if (issues?.length) {
    const seen = new Set<string>();
    const detail = issues
      .map((i) => {
        const label = fieldLabel(i.path || []);
        return label ? `${label}: ${i.message}` : i.message;
      })
      .filter((d) => !seen.has(d) && seen.add(d))
      .slice(0, 4)
      .join(" · ");
    if (detail) {
      const more = issues.length > 4 ? ` (+${issues.length - 4} more)` : "";
      return `${message} — ${detail}${more}`;
    }
  }

  return message;
}
