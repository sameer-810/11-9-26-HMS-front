import { useMutation, useQuery } from "@tanstack/react-query";
import { printingApi } from "@modules/printing/api/printingApi";

/**
 * A scan, as a mutation: it fires when the scanner sends Enter, not when a key
 * changes, and the same band scanned twice must resolve twice — a cached answer
 * would skip the audit entry and could be stale after a merge.
 */
export const useScanCode = () => useMutation({ mutationFn: (code: string) => printingApi.scan(code) });

export const useCurrentAdmission = (patientId: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: ["patient-current-admission", patientId],
    queryFn: () => printingApi.currentAdmission(patientId!),
    enabled: Boolean(patientId) && enabled,
    // A login that cannot see admissions gets a 403, and asking again will not
    // change that. The band prints without ward and bed and says so.
    retry: false,
    staleTime: 15_000,
  });
