import { apiClient } from "@api/apiClient";

export interface DashboardSummary {
  role: string;
  tiles: {
    /** US-05 "Total patients". A count, never a list. */
    patients?: { total: number; registeredToday: number };
    /**
     * US-05 "Today's appointments" and the OPD figures. `mine` when the counts
     * are the signed-in doctor's own day rather than the hospital's.
     */
    appointments?: {
      mine: boolean;
      date: string;
      total: number;
      scheduled: number;
      waiting: number;
      inConsultation: number;
      completed: number;
      cancelled: number;
      noShow: number;
    };
    /** US-05 "Admitted patients". */
    inpatients?: {
      admitted: number;
      admittedToday: number;
      dischargedToday: number;
    };
    /** US-23: allocated to this nurse by name or by ward. */
    myPatients?: { count: number };
    /** US-17: recommendations to admit still waiting for a bed. */
    admissionRequests?: { pending: number };
    beds?: {
      available: number;
      occupied: number;
      total: number;
      occupancyPercent: number;
    };
    staff?: { active: number; inactive: number; total: number };
    departments?: number;
    /** Pending tests, and critical results nobody has acknowledged yet. */
    lab?: { pending: number; criticalOpen: number };
    pharmacy?: { pendingPrescriptions: number };
    inventory?: {
      lowStock: number;
      expiringSoon: number;
      expiredOnShelf: number;
    };
    billing?: {
      draftBills: number;
      /** Discounts and credit notes nobody has decided on yet. */
      approvalsWaiting: number;
      outstandingBills: number;
      outstandingPaise: number;
      collectedTodayPaise: number;
    };
    /** Over target: triaged, not yet seen by a doctor, past the level's time. */
    emergency?: {
      expected: number;
      waitingTriage: number;
      inDepartment: number;
      overTarget: number;
    };
  };
  pending: string[];
}

export const dashboardApi = {
  summary: async () => {
    const res = await apiClient.get<{ data: DashboardSummary }>(
      "/dashboard/summary",
    );
    return res.data.data;
  },
};
