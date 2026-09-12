import { apiClient } from "@api/apiClient";

export interface DashboardSummary {
  role: string;
  tiles: {
    beds?: { available: number; occupied: number; total: number; occupancyPercent: number };
    staff?: { active: number; inactive: number; total: number };
    departments?: number;
  };
  pending: string[];
}

export const dashboardApi = {
  summary: async () => {
    const res = await apiClient.get<{ data: DashboardSummary }>("/dashboard/summary");
    return res.data.data;
  },
};
