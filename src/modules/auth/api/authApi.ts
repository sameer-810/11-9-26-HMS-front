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
   * Hospitals these credentials open, for the picker.
   * The server needs the password so an email alone cannot reveal where someone works.
   */
  hospitalsForEmail: async (params: {
    identifier: string;
    password: string;
  }) => {
    const res = await apiClient.post<{ data: { hospitals: HospitalChoice[] } }>(
      "/auth/hospitals",
      params,
    );
    return res.data.data.hospitals;
  },

  /** `identifier` is an email address or an employee ID. */
  login: async (params: {
    identifier: string;
    password: string;
    hospitalId?: string;
  }) => {
    const res = await apiClient.post<{ data: LoginResult }>("/auth/login", {
      ...params,
      deviceId: await getDeviceId(),
      deviceName: getDeviceName(),
    });
    return res.data.data;
  },

  /** Bare axios, not `apiClient`: its 401 interceptor calls refresh and could loop. */
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
    const res = await apiClient.get<{
      data: { user: AuthUser; hospital: Hospital };
    }>("/auth/me");
    return res.data.data;
  },

  changePassword: async (params: {
    currentPassword: string;
    newPassword: string;
  }) => {
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
    const res = await apiClient.get<{ data: SessionSummary[] }>(
      "/auth/sessions",
    );
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
