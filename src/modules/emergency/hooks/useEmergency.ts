import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { emergencyApi } from "@modules/emergency/api/emergencyApi";
import type { DisposeBody, EdVisit, EsiPreviewBody, RegisterArrivalBody, TriageBody } from "@modules/emergency/types";

/**
 * Anything that moves a patient through the department changes the visit, the
 * board and the dashboard counts.
 */
function useVisitMutation<T, R extends EdVisit = EdVisit>(fn: (arg: T) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (visit) => {
      qc.setQueryData(["ed-visit", visit.id], visit);
      for (const key of ["ed-board", "dashboard"]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
    },
    // A refusal usually means someone else moved the patient on — took them,
    // disposed them, marked them gone. Reload so the screen shows the truth.
    onError: () => {
      qc.invalidateQueries({ queryKey: ["ed-visit"] });
      qc.invalidateQueries({ queryKey: ["ed-board"] });
    },
  });
}

export const useEmergencyMeta = () =>
  // The ESI resource list and targets are the handbook's. They do not change in a shift.
  useQuery({ queryKey: ["ed-meta"], queryFn: emergencyApi.meta, staleTime: 60 * 60_000 });

export const useEmergencyBoard = () =>
  useQuery({
    queryKey: ["ed-board"],
    queryFn: emergencyApi.board,
    // Left open on a wall screen all shift. Wait times are server-computed, so
    // the only way they move is a refetch.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

export const useEmergencyVisit = (id?: string) =>
  useQuery({ queryKey: ["ed-visit", id], queryFn: () => emergencyApi.get(id!), enabled: Boolean(id), staleTime: 0 });

export const useEsiPreview = (body: EsiPreviewBody, enabled: boolean) =>
  useQuery({
    queryKey: ["ed-preview", body],
    queryFn: () => emergencyApi.preview(body),
    enabled,
    // The previous suggestion stays up while the next computes, so the badge
    // does not blink out on every answer.
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false,
  });

export const useRegisterArrival = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RegisterArrivalBody) => emergencyApi.register(body),
    onSuccess: (visit) => {
      qc.setQueryData(["ed-visit", visit.id], visit);
      // An unidentified arrival creates a patient; an MLC flag changes the banner.
      for (const key of ["ed-board", "dashboard", "patients", "patient-banner"]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
};

export const useMarkEdArrived = () => useVisitMutation((id: string) => emergencyApi.arrive(id));
export const useTriage = (id: string) => useVisitMutation((body: TriageBody) => emergencyApi.triage(id, body));
export const useAssignEdDoctor = (id: string) => useVisitMutation((doctorId: string) => emergencyApi.assign(id, doctorId));
export const useStartTreatment = (id: string) => useVisitMutation(() => emergencyApi.start(id));
export const useDispose = (id: string) => useVisitMutation((body: DisposeBody) => emergencyApi.dispose(id, body));
export const useLeftWithoutBeingSeen = (id: string) =>
  useVisitMutation((note: string | undefined) => emergencyApi.left(id, note));
