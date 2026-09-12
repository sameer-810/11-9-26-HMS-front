import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { patientApi, type PatientListParams } from "@modules/patient/api/patientApi";
import type { Allergy, RegisterPatientPayload } from "@modules/patient/types";

export const usePatients = (params?: PatientListParams) =>
  useQuery({
    queryKey: ["patients", params],
    queryFn: () => patientApi.list(params),
    // Keeps the previous page on screen while the next loads, so a search box
    // does not blank the list on every keystroke.
    placeholderData: keepPreviousData,
  });

export const usePatient = (id?: string) =>
  useQuery({
    queryKey: ["patient", id],
    queryFn: () => patientApi.get(id!),
    enabled: Boolean(id),
  });

export const usePatientBanner = (id?: string) =>
  useQuery({
    queryKey: ["patient-banner", id],
    queryFn: () => patientApi.banner(id!),
    enabled: Boolean(id),
    // The band must not show a stale allergy. Short, and refetched whenever a
    // clinical screen mounts.
    staleTime: 15_000,
  });

/**
 * RG-01, run live as the form is filled in.
 *
 * A mutation rather than a query because it is a POST and because it should
 * fire when the form says so, not when a key changes — the desk types a phone
 * number digit by digit and a query would fire ten times.
 */
export const useCheckDuplicates = () =>
  useMutation({ mutationFn: patientApi.checkDuplicates });

export const useRegisterPatient = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: RegisterPatientPayload) => patientApi.register(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
};

export const useUpdatePatient = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<RegisterPatientPayload>) => patientApi.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["patient", id] });
      qc.invalidateQueries({ queryKey: ["patient-banner", id] });
    },
  });
};

export const useSetAllergies = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ allergies, recorded }: { allergies: Allergy[]; recorded?: boolean }) =>
      patientApi.setAllergies(id, allergies, recorded),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patient", id] });
      // The band is on screen right now. It has to reflect this immediately —
      // a stale allergy strip is worse than none, because it is trusted.
      qc.invalidateQueries({ queryKey: ["patient-banner", id] });
      qc.invalidateQueries({ queryKey: ["patients"] });
    },
  });
};
