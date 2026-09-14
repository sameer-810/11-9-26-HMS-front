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

// Some RN engines lack `atob`, used below to read the JWT expiry.
const runtimeGlobal = globalThis as unknown as { atob?: typeof decode };
if (!runtimeGlobal.atob) runtimeGlobal.atob = decode;

export interface Hospital {
  id: string;
  name: string;
  code: string;
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

  setAuth: (user: AuthUser, hospital: Hospital, token: string, refreshToken: string) => void;
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

/**
 * SecureStore on native (Keychain / Keystore), localStorage on web.
 *
 * A session token here reaches a patient record, so on a device it belongs in
 * the OS keystore rather than AsyncStorage.
 */
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
        set((state) => ({ user: state.user ? { ...state.user, ...patch } : null })),

      updateTokens: (token, refreshToken) => set({ token, refreshToken, isAuthenticated: true }),

      logout: async () => {
        const { refreshToken } = get();
        if (refreshToken) {
          try {
            await axios.post(`${environment.apiUrl}/auth/logout`, { refreshToken });
          } catch {
            // The session TTL reclaims the slot regardless.
          }
        }
        await secureStorage.removeItem(STORAGE_KEY);
        // A shared ward tablet must not show the next person what the last one
        // read: the saved records go, and so does everything held in memory.
        // Queued vitals and notes are NOT dropped — they belong to the nurse
        // who charted them and send when that nurse signs in again.
        await clearMirrors();
        queryClient.clear();
        set({
          user: null,
          hospital: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      },

      hasPermission: (permission) => {
        const { user } = get();
        if (!user) return false;
        // No role short-circuit, deliberately — it mirrors the server, where an
        // administrator holds governance permissions and no clinical ones.
        return Array.isArray(user.permissions) && user.permissions.includes(permission);
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
            const rs = await axios.post(`${environment.apiUrl}/auth/refresh`, { refreshToken });
            const { accessToken, refreshToken: newRefresh } = rs.data.data;
            updateTokens(accessToken, newRefresh);
            return accessToken;
          } catch (err) {
            // Only a genuine rejection clears the session. A network failure
            // must not sign a nurse out mid-shift during a WiFi dropout —
            // that is how a ward loses access to the record it needs.
            const status = (err as { response?: { status?: number } })?.response?.status;
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
          // Credentials surviving the attempt means it was a network failure,
          // not a rejection — boot with the cached user so the offline record
          // mirror is reachable.
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
