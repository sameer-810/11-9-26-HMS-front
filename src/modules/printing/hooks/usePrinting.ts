import { useMutation, useQuery } from "@tanstack/react-query";
import { printingApi } from "@modules/printing/api/printingApi";

/** Scan lookup as a mutation: fires on Enter, and repeat scans are never cached (each is audited). */
export const useScanCode = () =>
  useMutation({ mutationFn: (code: string) => printingApi.scan(code) });

export const useCurrentAdmission = (
  patientId: string | undefined,
  enabled: boolean,
) =>
  useQuery({
    queryKey: ["patient-current-admission", patientId],
    queryFn: () => printingApi.currentAdmission(patientId!),
    enabled: Boolean(patientId) && enabled,
    // A 403 will not change on retry; the band then prints without ward and bed.
    retry: false,
    staleTime: 15_000,
  });
