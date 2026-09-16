import { apiClient } from "@api/apiClient";
import type {
  AuditFilters,
  AuditListResponse,
  BreakGlassGrant,
  GrantListResponse,
  GrantReviewBody,
  GrantStatus,
} from "@modules/audit/types";

export const auditApi = {
  list: async (params: AuditFilters) =>
    (await apiClient.get<AuditListResponse>("/audit", { params })).data,

  /** The break-the-glass review queue lives under /access, not /audit. */
  grants: async (params: {
    status?: GrantStatus;
    page?: number;
    limit?: number;
  }) =>
    (await apiClient.get<GrantListResponse>("/access/grants", { params })).data,

  review: async (id: string, body: GrantReviewBody) =>
    (
      await apiClient.post<{ data: BreakGlassGrant }>(
        `/access/grants/${id}/review`,
        body,
      )
    ).data.data,
};
