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
    // Fresh every time the screen opens. A stale allergy on a consultation
    // screen is the single worst thing this application could show.
    staleTime: 0,
    retry: (count, err) => apiErrorCode(err) !== "RECORD_RESTRICTED" && count < 1,
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
      // Written straight into the cache rather than refetched: the doctor is
      // typing, and a refetch would replace the field under the cursor.
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
  useQuery({ queryKey: ["consultation-drafts"], queryFn: consultationApi.myDrafts });

// ---- Prescribing ------------------------------------------------------------

export const useMedicineSearch = (search: string) =>
  useQuery({
    queryKey: ["medicines", search],
    queryFn: () => prescriptionApi.searchMedicines(search),
    enabled: search.trim().length >= 2,
    staleTime: 5 * 60_000,
  });

/**
 * The live safety check.
 *
 * A mutation rather than a query: it fires when a line is added or removed,
 * not when a render happens, and the result is held beside the lines that
 * produced it so a stale verdict can never be applied to a changed list.
 */
export const useSafetyCheck = () => useMutation({ mutationFn: ({ patientId, lines }: {
  patientId: string;
  lines: { id: string; medicineId: string }[];
}) => prescriptionApi.check(patientId, lines) });

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

export const usePrescriptions = (params?: { patientId?: string; status?: string }) =>
  useQuery({
    queryKey: ["prescriptions", params],
    queryFn: () => prescriptionApi.list(params),
  });

// ---- The record -------------------------------------------------------------

export const useMedicalRecord = (patientId?: string) =>
  useQuery({
    queryKey: ["medical-record", patientId],
    queryFn: () => recordApi.forPatient(patientId!),
    enabled: Boolean(patientId),
    // A restriction refusal is an answer, not a network blip. Retrying it only
    // delays the break-the-glass prompt.
    retry: (count, err) => apiErrorCode(err) !== "RECORD_RESTRICTED" && count < 1,
  });

/** On success both chart reads are refetched, so the record opens under the new grant. */
export const useBreakGlass = (patientId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { category: string; reason: string }) => recordApi.breakGlass(patientId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["medical-record", patientId] });
      qc.invalidateQueries({ queryKey: ["clinical-context", patientId] });
    },
  });
};
