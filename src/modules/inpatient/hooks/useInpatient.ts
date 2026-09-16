import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  inpatientApi,
  type AdmissionQuery,
  type AdmitBody,
  type DischargeBody,
  type ObservationBody,
  type AdministerBody,
  type HandoverBody,
} from "@modules/inpatient/api/inpatientApi";
import { sendOrQueue } from "@shared/offline/outbox";
import type { RequestClosureOutcome } from "@modules/inpatient/types";

/** Ward boards refetch on an interval and on focus: stale NEWS2 scores are unsafe. */
const WARD_REFRESH_MS = 60_000;

/** `enabled` stops the board querying endpoints the current mode's user cannot access (avoids 403s). */
export const useAdmissions = (query: AdmissionQuery = {}, enabled = true) =>
  useQuery({
    queryKey: ["admissions", query],
    queryFn: () => inpatientApi.list(query),
    enabled,
    refetchInterval: WARD_REFRESH_MS,
    refetchOnWindowFocus: true,
  });

export const useAdmission = (id?: string) =>
  useQuery({
    queryKey: ["admission", id],
    queryFn: () => inpatientApi.get(id!),
    enabled: Boolean(id),
  });

export const useMyPatients = (enabled = true) =>
  useQuery({
    queryKey: ["my-ward-patients"],
    queryFn: inpatientApi.myPatients,
    enabled,
    refetchInterval: WARD_REFRESH_MS,
    refetchOnWindowFocus: true,
  });

/** Everything a change to one patient's state can appear on. */
function invalidateWard(qc: ReturnType<typeof useQueryClient>, admissionId?: string) {
  qc.invalidateQueries({ queryKey: ["admissions"] });
  qc.invalidateQueries({ queryKey: ["my-ward-patients"] });
  qc.invalidateQueries({ queryKey: ["escalations"] });
  qc.invalidateQueries({ queryKey: ["bed-board"] });
  qc.invalidateQueries({ queryKey: ["selectable-beds"] });
  if (admissionId) {
    qc.invalidateQueries({ queryKey: ["admission", admissionId] });
    qc.invalidateQueries({ queryKey: ["bedside", admissionId] });
    qc.invalidateQueries({ queryKey: ["observations", admissionId] });
    qc.invalidateQueries({ queryKey: ["drug-round", admissionId] });
  }
}

export const useAdmit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AdmitBody) => inpatientApi.admit(body),
    onSuccess: (data) => {
      invalidateWard(qc, data.id);
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["patient", data.patient?.id] });
      // An admission can clear a waiting recommendation.
      qc.invalidateQueries({ queryKey: ["admission-requests"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
};


// ---- US-17: recommendations to admit ---------------------------------------
export const useAdmissionRequests = (enabled = true) =>
  useQuery({
    queryKey: ["admission-requests"],
    queryFn: inpatientApi.admissionRequests,
    enabled,
    refetchInterval: WARD_REFRESH_MS,
    refetchOnWindowFocus: true,
  });

export const useCloseAdmissionRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ consultationId, ...body }: { consultationId: string; outcome: RequestClosureOutcome; note: string }) =>
      inpatientApi.closeAdmissionRequest(consultationId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admission-requests"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
};

export const useTransfer = (admissionId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { bedId: string; reason: string }) =>
      inpatientApi.transfer(admissionId, body),
    onSuccess: () => invalidateWard(qc, admissionId),
  });
};

export const useDischarge = (admissionId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DischargeBody) => inpatientApi.discharge(admissionId, body),
    onSuccess: (data) => {
      invalidateWard(qc, admissionId);
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["patient", data.patient?.id] });
    },
  });
};

export const useAssignNurse = (admissionId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (nurseId: string) => inpatientApi.assignNurse(admissionId, nurseId),
    onSuccess: () => invalidateWard(qc, admissionId),
  });
};

export const useSetNews2Scale = (admissionId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { useScale2: boolean; indication?: string }) =>
      inpatientApi.setNews2Scale(admissionId, body.useScale2, body.indication),
    onSuccess: () => invalidateWard(qc, admissionId),
  });
};


// ---- Observations -----------------------------------------------------------
export const useObservations = (admissionId?: string) =>
  useQuery({
    queryKey: ["observations", admissionId],
    queryFn: () => inpatientApi.observations({ admissionId, limit: 50 }),
    enabled: Boolean(admissionId),
  });

/**
 * NU-02, offline-queueable. Resolves "sent" or "queued"; the form must show which,
 * because a queued set has not reached the escalation board.
 */
export const useRecordObservation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ label, ...body }: ObservationBody & { label: string }) =>
      sendOrQueue("observation", { admissionId: body.admissionId ?? "", label }, body, (payload) =>
        inpatientApi.recordObservation(payload),
      ),
    onSuccess: (result, variables) => {
      if (result.status === "sent") invalidateWard(qc, variables.admissionId);
    },
  });
};

/** Escalation board; refetched most often, as a stale list can hide a deteriorating patient. */
export const useEscalations = (wardId?: string) =>
  useQuery({
    queryKey: ["escalations", wardId ?? "all"],
    queryFn: () => inpatientApi.escalations(wardId),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

export const useAcknowledgeEscalation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { id: string; note: string }) =>
      inpatientApi.acknowledgeEscalation(body.id, body.note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["escalations"] });
      qc.invalidateQueries({ queryKey: ["bedside"] });
    },
  });
};


// ---- Notes ------------------------------------------------------------------
export const useNursingNotes = (admissionId?: string) =>
  useQuery({
    queryKey: ["nursing-notes", admissionId],
    queryFn: () => inpatientApi.notes(admissionId!),
    enabled: Boolean(admissionId),
  });

/** A nursing note — the other write that may be kept on the device. */
export const useAddNursingNote = (admissionId: string, label = "Nursing note") => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { note: string; category?: string }) =>
      sendOrQueue("note", { admissionId, label }, { admissionId, ...body }, (payload) => inpatientApi.addNote(payload)),
    onSuccess: (result) => {
      if (result.status !== "sent") return;
      qc.invalidateQueries({ queryKey: ["nursing-notes", admissionId] });
      qc.invalidateQueries({ queryKey: ["bedside", admissionId] });
    },
  });
};


// ---- NU-04: the drug round --------------------------------------------------
export const useDrugRound = (admissionId?: string, date?: string) =>
  useQuery({
    queryKey: ["drug-round", admissionId, date ?? "today"],
    queryFn: () => inpatientApi.drugRound(admissionId!, date),
    enabled: Boolean(admissionId),
    // Never serve a cached round: it could show a given dose as still unsigned.
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

export const useAdminister = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AdministerBody) => inpatientApi.administer(body),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["drug-round", variables.admissionId] });
      qc.invalidateQueries({ queryKey: ["bedside", variables.admissionId] });
    },
    // A conflict means someone else signed the dose; refetch so the round matches the error.
    onError: (_err, variables) => {
      qc.invalidateQueries({ queryKey: ["drug-round", variables.admissionId] });
    },
  });
};


// ---- NU-05: SBAR ------------------------------------------------------------
export const useHandovers = (admissionId?: string) =>
  useQuery({
    queryKey: ["handovers", admissionId],
    queryFn: () => inpatientApi.handovers(admissionId!),
    enabled: Boolean(admissionId),
  });

export const useSubmitHandover = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: HandoverBody) => inpatientApi.submitHandover(body),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["handovers", variables.admissionId] });
      qc.invalidateQueries({ queryKey: ["bedside", variables.admissionId] });
    },
  });
};

export const useReceiveHandover = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => inpatientApi.receiveHandover(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["handovers"] });
      qc.invalidateQueries({ queryKey: ["bedside"] });
    },
  });
};


// ---- IP-04 ------------------------------------------------------------------
export const useBedside = (admissionId?: string) =>
  useQuery({
    queryKey: ["bedside", admissionId],
    queryFn: () => inpatientApi.bedside(admissionId!),
    enabled: Boolean(admissionId),
    refetchInterval: WARD_REFRESH_MS,
    refetchOnWindowFocus: true,
  });
