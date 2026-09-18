import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiErrorCode } from "@api/apiClient";
import {
  consultationApi,
  prescriptionApi,
  recordApi,
  type ConsultationPatch,
} from "@modules/consultation/api/consultationApi";

export const useClinicalContext = (patientId?: string) =>
  useQuery({
    queryKey: ["clinical-context", patientId],
    queryFn: () => consultationApi.context(patientId!),
    enabled: Boolean(patientId),
    // Always fresh: a stale allergy list here is a clinical risk.
    staleTime: 0,
    retry: (count, err) =>
      apiErrorCode(err) !== "RECORD_RESTRICTED" && count < 1,
  });

export const useConsultation = (id?: string) =>
  useQuery({
    queryKey: ["consultation", id],
    queryFn: () => consultationApi.get(id!),
    enabled: Boolean(id),
  });

export const useOpenConsultation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: consultationApi.open,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["opd-queue"] });
      qc.invalidateQueries({ queryKey: ["my-schedule"] });
      qc.invalidateQueries({ queryKey: ["consultation-drafts"] });
    },
  });
};

export const useUpdateConsultation = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: ConsultationPatch) => consultationApi.update(id, patch),
    onSuccess: (data) => {
      // Set cache directly; a refetch would overwrite the field the doctor is typing in.
      qc.setQueryData(["consultation", id], data);
    },
  });
};

export const useSignConsultation = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => consultationApi.sign(id),
    onSuccess: (data) => {
      qc.setQueryData(["consultation", id], data);
      qc.invalidateQueries({ queryKey: ["consultation-drafts"] });
      qc.invalidateQueries({ queryKey: ["opd-queue"] });
      qc.invalidateQueries({ queryKey: ["my-schedule"] });
      qc.invalidateQueries({ queryKey: ["medical-record"] });
    },
  });
};

export const useAddAddendum = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { text: string; reason?: string }) =>
      consultationApi.addAddendum(id, body),
    onSuccess: (data) => qc.setQueryData(["consultation", id], data),
  });
};

export const useMyDrafts = () =>
  useQuery({
    queryKey: ["consultation-drafts"],
    queryFn: consultationApi.myDrafts,
  });

// ---- Prescribing ------------------------------------------------------------
export const useMedicineSearch = (search: string) =>
  useQuery({
    queryKey: ["medicines", search],
    queryFn: () => prescriptionApi.searchMedicines(search),
    enabled: search.trim().length >= 2,
    staleTime: 5 * 60_000,
  });

/** Live prescribing safety check; a mutation so it runs on line changes, not renders. */
export const useSafetyCheck = () =>
  useMutation({
    mutationFn: ({
      patientId,
      lines,
    }: {
      patientId: string;
      lines: { id: string; medicineId: string }[];
    }) => prescriptionApi.check(patientId, lines),
  });

export const useCreatePrescription = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: prescriptionApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prescriptions"] });
      qc.invalidateQueries({ queryKey: ["medical-record"] });
      qc.invalidateQueries({ queryKey: ["clinical-context"] });
    },
  });
};

export const usePrescriptions = (
  params?: {
    patientId?: string;
    status?: string;
  },
  enabled = true,
) =>
  useQuery({
    queryKey: ["prescriptions", params],
    queryFn: () => prescriptionApi.list(params),
    enabled,
  });

// ---- The record -------------------------------------------------------------
export const useMedicalRecord = (patientId?: string) =>
  useQuery({
    queryKey: ["medical-record", patientId],
    queryFn: () => recordApi.forPatient(patientId!),
    enabled: Boolean(patientId),
    // Do not retry a restriction refusal; it only delays the break-glass prompt.
    retry: (count, err) =>
      apiErrorCode(err) !== "RECORD_RESTRICTED" && count < 1,
  });

/** On success both chart reads are refetched, so the record opens under the new grant. */
export const useBreakGlass = (patientId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { category: string; reason: string }) =>
      recordApi.breakGlass(patientId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["medical-record", patientId] });
      qc.invalidateQueries({ queryKey: ["clinical-context", patientId] });
      // Ward queries are keyed by admission, not patient, so reload them all.
      for (const key of [
        "bedside",
        "observations",
        "nursing-notes",
        "drug-round",
        "handovers",
        "admission",
      ]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
};
