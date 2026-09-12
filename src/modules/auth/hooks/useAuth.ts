import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi } from "@modules/auth/api/authApi";
import { useAuthStore } from "@shared/store/useAuthStore";

export const useLogin = () => {
  const setAuth = useAuthStore((s) => s.setAuth);
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => {
      setAuth(data.user, data.hospital, data.accessToken, data.refreshToken);
    },
  });
};

/** Looked up before signing in, so a user with two accounts is asked which. */
export const useHospitalsForEmail = () =>
  useMutation({ mutationFn: authApi.hospitalsForEmail });

export const useChangePassword = () => {
  const updateUser = useAuthStore((s) => s.updateUser);
  const updateTokens = useAuthStore((s) => s.updateTokens);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: authApi.changePassword,
    onSuccess: (data) => {
      // Adopt the fresh pair FIRST. The password change invalidated every token
      // minted before it, including the one still in the store — using it for
      // even one more request produces a 401 that recovers silently but lands
      // in the audit trail as a failed authentication.
      if (data.accessToken && data.refreshToken) {
        updateTokens(data.accessToken, data.refreshToken);
      }
      // The whole app is gated on this flag, so it has to clear the moment the
      // change lands — otherwise the user sits on the change-password screen
      // having already changed it.
      updateUser({ mustChangePassword: false });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
};

export const useForgotPassword = () => useMutation({ mutationFn: authApi.forgotPassword });

export const useResetPassword = () => useMutation({ mutationFn: authApi.resetPassword });

export const useMe = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: ["me"],
    queryFn: authApi.me,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
};

export const useSessions = () =>
  useQuery({ queryKey: ["sessions"], queryFn: authApi.listSessions });

export const useRevokeSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: authApi.revokeSession,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });
};

export const useSignOutOthers = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: authApi.signOutOthers,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });
};
