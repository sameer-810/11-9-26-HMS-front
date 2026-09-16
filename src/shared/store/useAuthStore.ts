import { create } from "zustand";
import { persist, createJSONStorage, StateStorage } from "zustand/middleware";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { decode } from "base-64";
import axios from "axios";
import { environment } from "@config/env";
import type { Role } from "../permissions";
import { clearMirrors } from "../offline/mirror";
import { queryClient } from "../api/queryClient";
import { useSessionNotice } from "../session/sessionNotice";

// Some RN engines lack `atob`, used below to read the JWT expiry.
const runtimeGlobal = globalThis as unknown as { atob?: typeof decode };
if (!runtimeGlobal.atob) runtimeGlobal.atob = decode;

export interface Hospital {
  id: string;
  name: string;
  code: string;
  /** US-01: minutes without activity before a screen signs itself out. */
  sessionIdleMinutes?: number;
}

export interface AuthUser {
  id: string;
  hospitalId: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  avatarUrl?: string;
  role: Role;
  designation: string;
  departmentId: string | null;
  departmentName?: string;
  permissions: string[];
  icuAuthorized: boolean;
  /** US-23: the wards a nurse is allocated to. */
  wardIds?: string[];
  mustChangePassword: boolean;
  isActive: boolean;
}

interface AuthState {
  user: AuthUser | null;
  hospital: Hospital | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isHydrated: boolean;
  isAuthChecked: boolean;

  setAuth: (
    user: AuthUser,
    hospital: Hospital,
    token: string,
    refreshToken: string,
  ) => void;
  updateUser: (patch: Partial<AuthUser>) => void;
  updateTokens: (token: string, refreshToken: string) => void;
  logout: () => Promise<void>;
  initializeAuth: () => Promise<void>;
  refreshSession: () => Promise<string | null>;

  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (...permissions: string[]) => boolean;
  isRole: (role: Role) => boolean;
  isAdmin: () => boolean;
}

export const isTokenExpired = (token: string | null) => {
  if (!token) return true;
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    const { exp } = JSON.parse(json);
    return exp * 1000 < Date.now() + 30_000; // 30s buffer
  } catch {
    return true;
  }
};

/** SecureStore (OS keystore) on native, not AsyncStorage; localStorage on web. */
const secureStorage: StateStorage = {
  getItem: async (name) => {
    if (Platform.OS === "web") {
      try {
        return localStorage.getItem(name);
      } catch {
        return null;
      }
    }
    return await SecureStore.getItemAsync(name);
  },
  setItem: async (name, value) => {
    if (Platform.OS === "web") {
      try {
        localStorage.setItem(name, value);
      } catch {
        /* private window, quota — the session just will not persist */
      }
      return;
    }
    await SecureStore.setItemAsync(name, value);
  },
  removeItem: async (name) => {
    if (Platform.OS === "web") {
      try {
        localStorage.removeItem(name);
      } catch {
        /* nothing to do */
      }
      return;
    }
    await SecureStore.deleteItemAsync(name);
  },
};

/** Single-flight guard — a burst of 401s must trigger one refresh, not twenty. */
let refreshPromise: Promise<string | null> | null = null;

const STORAGE_KEY = "hms-auth-storage";

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      hospital: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isHydrated: false,
      isAuthChecked: false,

      setAuth: (user, hospital, token, refreshToken) =>
        set({ user, hospital, token, refreshToken, isAuthenticated: true }),

      updateUser: (patch) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...patch } : null,
        })),

      updateTokens: (token, refreshToken) =>
        set({ token, refreshToken, isAuthenticated: true }),

      logout: async () => {
        const { refreshToken } = get();
        // Wipe mirrors and cache before the (possibly hanging) revoke call.
        // Queued outbox ops are kept; they send when their author signs in again.
        const wiping = clearMirrors();
        set({
          user: null,
          hospital: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
        });
        queryClient.clear();
        await Promise.all([secureStorage.removeItem(STORAGE_KEY), wiping]);
        if (refreshToken) {
          try {
            await axios.post(
              `${environment.apiUrl}/auth/logout`,
              { refreshToken },
              { timeout: 10_000 },
            );
          } catch {
            // The session TTL reclaims the slot regardless.
          }
        }
      },

      hasPermission: (permission) => {
        const { user } = get();
        if (!user) return false;
        // No admin short-circuit: as on the server, admins hold no clinical permissions.
        return (
          Array.isArray(user.permissions) &&
          user.permissions.includes(permission)
        );
      },

      hasAnyPermission: (...permissions) => {
        const { hasPermission } = get();
        return permissions.some((p) => hasPermission(p));
      },

      isRole: (role) => get().user?.role === role,

      isAdmin: () => get().user?.role === "admin",

      refreshSession: async () => {
        if (refreshPromise) return refreshPromise;
        refreshPromise = (async () => {
          try {
            const { refreshToken, updateTokens, logout } = get();
            if (!refreshToken) {
              await logout();
              return null;
            }
            const rs = await axios.post(`${environment.apiUrl}/auth/refresh`, {
              refreshToken,
            });
            const { accessToken, refreshToken: newRefresh } = rs.data.data;
            updateTokens(accessToken, newRefresh);
            return accessToken;
          } catch (err) {
            // Only a 401/403 clears the session; a network failure must not sign anyone out.
            const response = (
              err as {
                response?: {
                  status?: number;
                  data?: { error?: { code?: string; message?: string } };
                };
              }
            )?.response;
            const status = response?.status;
            // Signed out by the server for inactivity: say so on the sign-in screen.
            if (response?.data?.error?.code === "SESSION_IDLE") {
              useSessionNotice
                .getState()
                .setNotice(
                  response.data.error.message ??
                    "You were signed out after a period without activity.",
                );
            }
            if (status === 401 || status === 403) await get().logout();
            return null;
          } finally {
            refreshPromise = null;
          }
        })();
        return refreshPromise;
      },

      initializeAuth: async () => {
        const { token, refreshToken, refreshSession } = get();
        if (!token && !refreshToken) {
          set({ isAuthChecked: true });
          return;
        }
        if (!isTokenExpired(token)) {
          set({ isAuthenticated: true, isAuthChecked: true });
          return;
        }
        if (refreshToken) {
          await refreshSession();
          // Refresh token survived, so it was a network failure: boot offline with the cached user.
          if (get().refreshToken) {
            set({ isAuthenticated: true, isAuthChecked: true });
            return;
          }
        }
        set({ isAuthChecked: true });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        user: state.user,
        hospital: state.hospital,
        token: state.token,
        refreshToken: state.refreshToken,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.isHydrated = true;
      },
    },
  ),
);
