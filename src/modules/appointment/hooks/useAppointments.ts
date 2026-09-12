import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { appointmentApi } from "@modules/appointment/api/appointmentApi";
import type { BookAppointmentPayload } from "@modules/appointment/types";

export const useAppointments = (params?: Parameters<typeof appointmentApi.list>[0]) =>
  useQuery({
    queryKey: ["appointments", params],
    queryFn: () => appointmentApi.list(params),
    placeholderData: keepPreviousData,
  });

export const useAppointment = (id?: string) =>
  useQuery({
    queryKey: ["appointment", id],
    queryFn: () => appointmentApi.get(id!),
    enabled: Boolean(id),
  });

/**
 * AP-01's slot grid.
 *
 * `staleTime: 0` on purpose. Somebody else may take a slot while this list is
 * on screen, and showing a free slot that is not free sends the receptionist
 * into a 409 they cannot explain to the patient in front of them. The server
 * re-checks on booking regardless — this just keeps the screen honest.
 */
export const useAvailability = (doctorId?: string, date?: string) =>
  useQuery({
    queryKey: ["availability", doctorId, date],
    queryFn: () => appointmentApi.availability(doctorId!, date!),
    enabled: Boolean(doctorId && date),
    staleTime: 0,
  });

export const useDoctorsAvailable = (date?: string, departmentId?: string) =>
  useQuery({
    queryKey: ["doctors-available", date, departmentId],
    queryFn: () => appointmentApi.doctorsAvailable(date!, departmentId),
    enabled: Boolean(date),
    staleTime: 30_000,
  });

/** Everything that changes a booking has to invalidate the same four things. */
function useBookingInvalidation() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["appointments"] });
    qc.invalidateQueries({ queryKey: ["availability"] });
    qc.invalidateQueries({ queryKey: ["doctors-available"] });
    qc.invalidateQueries({ queryKey: ["opd-queue"] });
    qc.invalidateQueries({ queryKey: ["my-schedule"] });
    qc.invalidateQueries({ queryKey: ["patients"] });
  };
}

export const useBookAppointment = () => {
  const invalidate = useBookingInvalidation();
  return useMutation({
    mutationFn: (payload: BookAppointmentPayload) => appointmentApi.book(payload),
    onSuccess: invalidate,
  });
};

export const useWalkIn = () => {
  const invalidate = useBookingInvalidation();
  return useMutation({
    mutationFn: appointmentApi.walkIn,
    onSuccess: invalidate,
  });
};

export const useReschedule = () => {
  const invalidate = useBookingInvalidation();
  return useMutation({
    mutationFn: ({
      id,
      ...payload
    }: { id: string; date: string; time: string; doctorId?: string; reason?: string }) =>
      appointmentApi.reschedule(id, payload),
    onSuccess: invalidate,
  });
};

export const useCancelAppointment = () => {
  const invalidate = useBookingInvalidation();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      appointmentApi.cancel(id, reason),
    onSuccess: invalidate,
  });
};

export const useMarkArrived = () => {
  const invalidate = useBookingInvalidation();
  return useMutation({
    mutationFn: (id: string) => appointmentApi.markArrived(id),
    onSuccess: invalidate,
  });
};

export const useMarkNoShow = () => {
  const invalidate = useBookingInvalidation();
  return useMutation({
    mutationFn: (id: string) => appointmentApi.markNoShow(id),
    onSuccess: invalidate,
  });
};

/**
 * The OPD queue board.
 *
 * Refetched on an interval because it is left open on a screen all shift and
 * nobody is going to pull to refresh it. Thirty seconds is frequent enough that
 * a newly arrived patient appears while they are still walking to a seat.
 */
export const useOpdQueue = (params?: { doctorId?: string; departmentId?: string; date?: string }) =>
  useQuery({
    queryKey: ["opd-queue", params],
    queryFn: () => appointmentApi.queue(params),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

export const useMySchedule = (date?: string) =>
  useQuery({
    queryKey: ["my-schedule", date],
    queryFn: () => appointmentApi.mySchedule(date),
    refetchInterval: 60_000,
  });

export const useRoster = (params?: { doctorId?: string; dayOfWeek?: number }) =>
  useQuery({
    queryKey: ["roster", params],
    queryFn: () => appointmentApi.listRoster(params),
    staleTime: 5 * 60_000,
  });
