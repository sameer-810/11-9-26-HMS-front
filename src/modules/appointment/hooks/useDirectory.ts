import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@api/apiClient";
import type { DepartmentSummary, DoctorSummary } from "@modules/appointment/types";

/** Department and doctor lists for pickers (appointment, admission, user assignment). */
export const useDepartments = (params?: { isClinical?: boolean }) =>
  useQuery({
    queryKey: ["departments", params],
    queryFn: async () => {
      const res = await apiClient.get<{ data: DepartmentSummary[] }>("/departments", {
        params: { limit: 100, isActive: true, ...params },
      });
      return res.data.data;
    },
    // Departments change when a hospital reorganises, which is not often.
    staleTime: 10 * 60_000,
  });

export const useDoctors = (departmentId?: string) =>
  useQuery({
    queryKey: ["doctors", departmentId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: DoctorSummary[] }>("/users/doctors", {
        params: departmentId ? { departmentId } : undefined,
      });
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });
