import type { PatientBanner } from "@modules/patient/types";

export type AppointmentStatus =
  | "scheduled"
  | "arrived"
  | "in_consultation"
  | "completed"
  | "cancelled"
  | "no_show";

export interface DoctorSummary {
  id: string;
  fullName: string;
  designation: string;
  specialization: string;
}

export interface DepartmentSummary {
  id: string;
  name: string;
  code: string;
}

export interface Appointment {
  id: string;
  appointmentNumber: string;
  patient: PatientBanner | { id: string };
  doctor: DoctorSummary | { id: string };
  department: DepartmentSummary | null;
  /**
   * The wall-clock pair is what a screen shows. `scheduledAt` is the derived
   * instant and exists for sorting — rendering it directly would display the
   * server's idea of the time rather than the hospital's.
   */
  scheduledDate: string;
  scheduledTime: string;
  scheduledAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
  visitType: "new" | "follow_up" | "walk_in" | "emergency";
  reason: string;
  notes: string;
  tokenNumber: number | null;
  arrivedAt: string | null;
  consultationStartedAt: string | null;
  completedAt: string | null;
  waitingMinutes: number | null;
  bookedByName: string;
  cancelledByName: string;
  cancelReason: string;
  rescheduledFromId: string | null;
  rescheduledToId: string | null;
  consultationId: string | null;
  createdAt: string;
}

export interface Slot {
  time: string;
  endTime: string;
  durationMinutes: number;
  capacity: number;
  booked: number;
  remaining: number;
  location: string;
  isExtra: boolean;
  available: boolean;
  /** Present on every unavailable slot — "Fully booked", "In theatre". */
  unavailableReason: string | null;
}

export interface Availability {
  doctor: DoctorSummary | null;
  date: string;
  available: boolean;
  reason: string | null;
  slots: Slot[];
  freeCount: number;
}

export interface DoctorAvailability {
  doctor: DoctorSummary | null;
  available: boolean;
  reason: string | null;
  freeSlots: number;
  nextFreeTime: string | null;
}

export interface QueueCounts {
  scheduled: number;
  arrived: number;
  in_consultation: number;
  completed: number;
  cancelled: number;
  no_show: number;
}

export interface RosterRow {
  id: string;
  doctor: DoctorSummary | { id: string };
  department: DepartmentSummary | null;
  dayOfWeek: number;
  dayName: string;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  slotCapacity: number;
  location: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
}

export interface BookAppointmentPayload {
  patientId: string;
  doctorId: string;
  departmentId?: string;
  /** Calendar date "YYYY-MM-DD" in the hospital's timezone. Never an instant. */
  date: string;
  time: string;
  visitType?: "new" | "follow_up";
  reason?: string;
  notes?: string;
}
