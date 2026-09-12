import { apiClient } from "@api/apiClient";
import type { Paginated } from "@modules/patient/types";
import type {
  Appointment,
  Availability,
  DoctorAvailability,
  QueueCounts,
  RosterRow,
  BookAppointmentPayload,
} from "@modules/appointment/types";

export interface QueueResponse {
  success: boolean;
  data: Appointment[];
  meta: { counts: QueueCounts; date: string };
}

export const appointmentApi = {
  list: async (params?: {
    page?: number;
    limit?: number;
    patientId?: string;
    doctorId?: string;
    status?: string;
    date?: string;
    from?: string;
    to?: string;
  }) => {
    const res = await apiClient.get<Paginated<Appointment>>("/appointments", { params });
    return res.data;
  },

  get: async (id: string) => {
    const res = await apiClient.get<{ data: Appointment }>(`/appointments/${id}`);
    return res.data.data;
  },

  /** AP-01. `date` is a calendar date, never an instant. */
  availability: async (doctorId: string, date: string) => {
    const res = await apiClient.get<{ data: Availability }>("/appointments/availability", {
      params: { doctorId, date },
    });
    return res.data.data;
  },

  /** Reception's real question: who can see this patient today? */
  doctorsAvailable: async (date: string, departmentId?: string) => {
    const res = await apiClient.get<{ data: DoctorAvailability[] }>(
      "/appointments/doctors-available",
      { params: { date, ...(departmentId ? { departmentId } : {}) } },
    );
    return res.data.data;
  },

  book: async (payload: BookAppointmentPayload) => {
    const res = await apiClient.post<{ data: Appointment }>("/appointments", payload);
    return res.data.data;
  },

  walkIn: async (payload: {
    patientId: string;
    doctorId: string;
    departmentId?: string;
    reason?: string;
  }) => {
    const res = await apiClient.post<{ data: Appointment }>("/appointments/walk-in", payload);
    return res.data.data;
  },

  reschedule: async (
    id: string,
    payload: { date: string; time: string; doctorId?: string; reason?: string },
  ) => {
    const res = await apiClient.post<{ data: Appointment }>(
      `/appointments/${id}/reschedule`,
      payload,
    );
    return res.data.data;
  },

  cancel: async (id: string, reason?: string) => {
    const res = await apiClient.post<{ data: Appointment }>(`/appointments/${id}/cancel`, {
      reason,
    });
    return res.data.data;
  },

  markArrived: async (id: string) => {
    const res = await apiClient.post<{ data: Appointment }>(`/appointments/${id}/arrived`);
    return res.data.data;
  },

  markNoShow: async (id: string) => {
    const res = await apiClient.post<{ data: Appointment }>(`/appointments/${id}/no-show`);
    return res.data.data;
  },

  queue: async (params?: { doctorId?: string; departmentId?: string; date?: string }) => {
    const res = await apiClient.get<QueueResponse>("/appointments/queue", { params });
    return res.data;
  },

  mySchedule: async (date?: string) => {
    const res = await apiClient.get<QueueResponse>("/appointments/my-schedule", {
      params: date ? { date } : undefined,
    });
    return res.data;
  },

  listRoster: async (params?: { doctorId?: string; dayOfWeek?: number }) => {
    const res = await apiClient.get<{ data: RosterRow[] }>("/appointments/roster", { params });
    return res.data.data;
  },
};
