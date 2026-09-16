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
    // keeps the previous page on screen so search does not blank the list on every keystroke.
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
    // short: the identity band must not show a stale allergy.
    staleTime: 15_000,
  });

/** a mutation, not a query: it is a POST and fires when the form decides, not on every keystroke. */
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
