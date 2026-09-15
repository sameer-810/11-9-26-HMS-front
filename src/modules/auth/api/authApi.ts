import axios from "axios";
import { apiClient } from "@api/apiClient";
import { getDeviceId, getDeviceName } from "@api/deviceId";
import { environment } from "@config/env";
import type { AuthUser, Hospital } from "@shared/store/useAuthStore";

export interface LoginResult {
  user: AuthUser;
  hospital: Hospital;
  accessToken: string;
  refreshToken: string;
}

export interface HospitalChoice {
  hospitalId: string;
  hospitalName: string;
  hospitalCode: string;
}

export interface SessionSummary {
  id: string;
  deviceId: string;
  deviceName: string;
  ip: string;
  lastUsedAt: string;
  createdAt: string;
  isCurrent: boolean;
}

export const authApi = {
  /**
   * Which hospitals these credentials open, for the picker.
   *
   * The password is required by the server: an email alone used to be enough,
   * which let anyone look up where a named member of staff works.
   */
  hospitalsForEmail: async (params: { email: string; password: string }) => {
    const res = await apiClient.post<{ data: { hospitals: HospitalChoice[] } }>(
      "/auth/hospitals",
      params,
    );
    return res.data.data.hospitals;
  },

  login: async (params: { email: string; password: string; hospitalId?: string }) => {
    const res = await apiClient.post<{ data: LoginResult }>("/auth/login", {
      ...params,
      deviceId: await getDeviceId(),
      deviceName: getDeviceName(),
    });
    return res.data.data;
  },

  /**
   * Deliberately uses a bare axios call rather than `apiClient`.
   *
   * The shared client's 401 interceptor calls refresh — so refreshing through
   * it risks a loop where a failing refresh triggers another refresh. Keeping
   * this one off the interceptor chain makes that impossible by construction.
   */
  refresh: async (refreshToken: string) => {
    const res = await axios.post<{
      data: { accessToken: string; refreshToken: string };
    }>(`${environment.apiUrl}/auth/refresh`, { refreshToken });
    return res.data.data;
  },

  logout: async (refreshToken?: string) => {
    const res = await apiClient.post("/auth/logout", { refreshToken });
    return res.data;
  },

  me: async () => {
    const res = await apiClient.get<{ data: { user: AuthUser; hospital: Hospital } }>(
      "/auth/me",
    );
    return res.data.data;
  },

  changePassword: async (params: { currentPassword: string; newPassword: string }) => {
    const res = await apiClient.post<{
      data: { message: string; accessToken?: string; refreshToken?: string };
    }>("/auth/change-password", {
      ...params,
      deviceId: await getDeviceId(),
    });
    return res.data.data;
  },

  forgotPassword: async (params: { email: string; hospitalId?: string }) => {
    const res = await apiClient.post<{ data: { message: string } }>(
      "/auth/forgot-password",
      params,
    );
    return res.data.data;
  },

  resetPassword: async (params: {
    email: string;
    code: string;
    newPassword: string;
    hospitalId?: string;
  }) => {
    const res = await apiClient.post<{ data: { message: string } }>(
      "/auth/reset-password",
      params,
    );
    return res.data.data;
  },

  listSessions: async () => {
    const res = await apiClient.get<{ data: SessionSummary[] }>("/auth/sessions");
    return res.data.data;
  },

  revokeSession: async (id: string) => {
    const res = await apiClient.delete(`/auth/sessions/${id}`);
    return res.data;
  },

  signOutOthers: async () => {
    const res = await apiClient.post("/auth/sessions/sign-out-others", {
      deviceId: await getDeviceId(),
    });
    return res.data;
  },
};
