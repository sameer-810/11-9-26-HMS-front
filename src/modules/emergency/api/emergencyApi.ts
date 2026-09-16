import { apiClient } from "@api/apiClient";
import type {
  DisposeBody,
  EdBoard,
  EdMeta,
  EdVisit,
  EsiPreviewBody,
  EsiSuggestion,
  RegisterArrivalBody,
  TriageBody,
} from "@modules/emergency/types";

export const emergencyApi = {
  meta: async () =>
    (await apiClient.get<{ data: EdMeta }>("/emergency/meta")).data.data,
  board: async () =>
    (await apiClient.get<{ data: EdBoard }>("/emergency/board")).data.data,

  /** Writes nothing. The level shown while the nurse is still answering. */
  preview: async (body: EsiPreviewBody) =>
    (
      await apiClient.post<{ data: EsiSuggestion }>(
        "/emergency/esi/preview",
        body,
      )
    ).data.data,

  register: async (body: RegisterArrivalBody) =>
    (await apiClient.post<{ data: EdVisit }>("/emergency/visits", body)).data
      .data,
  get: async (id: string) =>
    (await apiClient.get<{ data: EdVisit }>(`/emergency/visits/${id}`)).data
      .data,
  arrive: async (id: string) =>
    (await apiClient.post<{ data: EdVisit }>(`/emergency/visits/${id}/arrive`))
      .data.data,

  /** Omitting `esiLevel` accepts the server's own computation, not the preview the screen showed. */
  triage: async (id: string, body: TriageBody) =>
    (
      await apiClient.post<{ data: EdVisit & { suggestion: EsiSuggestion } }>(
        `/emergency/visits/${id}/triage`,
        body,
      )
    ).data.data,
  assign: async (id: string, doctorId: string) =>
    (
      await apiClient.post<{ data: EdVisit }>(
        `/emergency/visits/${id}/assign`,
        { doctorId },
      )
    ).data.data,
  start: async (id: string) =>
    (await apiClient.post<{ data: EdVisit }>(`/emergency/visits/${id}/start`))
      .data.data,
  dispose: async (id: string, body: DisposeBody) =>
    (
      await apiClient.post<{ data: EdVisit }>(
        `/emergency/visits/${id}/dispose`,
        body,
      )
    ).data.data,
  left: async (id: string, note?: string) =>
    (
      await apiClient.post<{ data: EdVisit }>(
        `/emergency/visits/${id}/left`,
        note ? { note } : {},
      )
    ).data.data,
};
