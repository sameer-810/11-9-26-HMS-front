import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiErrorCode } from "@api/apiClient";
import { auditApi } from "@modules/audit/api/auditApi";
import type { AuditFilters, GrantReviewBody, GrantStatus } from "@modules/audit/types";

export const AUDIT_PAGE_SIZE = 30;
export const GRANT_PAGE_SIZE = 20;

export const useAuditLog = (params: AuditFilters) =>
  useQuery({
    queryKey: ["audit", params],
    queryFn: () => auditApi.list({ ...params, limit: AUDIT_PAGE_SIZE }),
    // Paging and filtering keep the old page visible until the new one lands,
    // rather than collapsing the list to a skeleton on every keystroke.
    placeholderData: keepPreviousData,
  });

export const useGrants = (params: { status: GrantStatus; page: number }) =>
  useQuery({
    queryKey: ["access-grants", params],
    queryFn: () => auditApi.grants({ ...params, limit: GRANT_PAGE_SIZE }),
  });

/** The number on the tab. One row fetched; only the total is read. */
export const usePendingGrantCount = () =>
  useQuery({
    queryKey: ["access-grants", "pending-count"],
    queryFn: async () => (await auditApi.grants({ status: "pending", page: 1, limit: 1 })).meta.total,
  });

/**
 * A review changes the grant queue (it leaves "pending") and writes an audit
 * entry of its own, so both lists reload.
 */
export const useReviewGrant = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: GrantReviewBody & { id: string }) => auditApi.review(id, body),
    onSuccess: () => {
      for (const key of ["access-grants", "audit"]) qc.invalidateQueries({ queryKey: [key] });
    },
    // Someone else got there first. Reload so the card shows their decision
    // instead of offering buttons that can only fail again.
    onError: (err) => {
      if (apiErrorCode(err) === "ALREADY_REVIEWED") qc.invalidateQueries({ queryKey: ["access-grants"] });
    },
  });
};
