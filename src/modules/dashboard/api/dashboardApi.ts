import { apiClient } from "@api/apiClient";

export interface DashboardSummary {
  role: string;
  tiles: {
    beds?: { available: number; occupied: number; total: number; occupancyPercent: number };
    staff?: { active: number; inactive: number; total: number };
    departments?: number;
    /** Pending tests, and critical results nobody has acknowledged yet. */
    lab?: { pending: number; criticalOpen: number };
    pharmacy?: { pendingPrescriptions: number };
    inventory?: { lowStock: number; expiringSoon: number; expiredOnShelf: number };
  };
  pending: string[];
}

export const dashboardApi = {
  summary: async () => {
    const res = await apiClient.get<{ data: DashboardSummary }>("/dashboard/summary");
    return res.data.data;
  },
};
