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

/**
 * Ward data goes stale in a way that matters.
 *
 * A ward board showing a NEWS2 score from twenty minutes ago is a board showing
 * a patient who may already have deteriorated. So the boards refetch on an
 * interval and on focus, and anything that changes a patient's state invalidates
 * every list that patient appears on.
 */
const WARD_REFRESH_MS = 60_000;

/**
 * `enabled` matters here, not just as an optimisation.
 *
 * The ward board renders three modes from one component, and a hook that fires
 * regardless of mode sends a doctor's browser at `/admissions/my-patients` —
 * an endpoint they hold no permission for. The 403 is correct, but it is also
 * noise in the audit log and an error the user never asked to cause.
 */
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
 * NU-02, and one of the only two writes that may be kept for later.
 *
 * Resolves `{ status: "sent", data }` or `{ status: "queued", op }`. The form
 * must tell those apart on screen: a queued set has not reached the escalation
 * board, and the nurse has to know that before walking away.
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

/**
 * The escalation board.
 *
 * Refetched more often than anything else here, and on focus. An escalation
 * list that is a minute out of date is a list that can show a patient as still
 * waiting after someone has gone to them, or — worse — not yet show one who is.
 */
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
    /**
     * Zero stale time. The whole point of this screen is that it tells the
     * truth about what has already been given — a cached round is how the
     * second nurse at shift change sees an unsigned dose that is not.
     */
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
    /**
     * A conflict means someone else signed this dose while this screen was
     * open. Refetch before the message is shown so the round the nurse is
     * looking at matches what they are being told.
     */
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
