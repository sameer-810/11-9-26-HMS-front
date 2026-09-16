import { apiClient } from "@api/apiClient";
import type {
  AdminUser,
  Bed,
  BedBoard,
  BedStatus,
  BulkBedsBody,
  BulkBedsResult,
  CreateUserBody,
  Department,
  DepartmentBody,
  HospitalPatch,
  HospitalProfile,
  IssuedCredential,
  Paged,
  PermissionCatalogue,
  RoleChange,
  RoleSet,
  Room,
  RoomType,
  UpdateUserBody,
  UserListParams,
  Ward,
  WardBody,
} from "@modules/admin/types";

/** the ward routes cap `limit` at 200 (validationPrimitives.limitSchema). */
const MAX_LIMIT = 200;

export const adminApi = {
  // ---- Users (users.manage) ------------------------------------------------
  users: {
    list: async (params: UserListParams = {}) =>
      (await apiClient.get<Paged<AdminUser>>("/users", { params })).data,
    get: async (id: string) =>
      (await apiClient.get<{ data: AdminUser }>(`/users/${id}`)).data.data,
    /** no password is sent; the server generates the temporary one. */
    create: async (body: CreateUserBody) =>
      (await apiClient.post<{ data: IssuedCredential }>("/users", body)).data
        .data,
    update: async (id: string, body: UpdateUserBody) =>
      (await apiClient.patch<{ data: AdminUser }>(`/users/${id}`, body)).data
        .data,
    /** DELETE deactivates; there is no hard delete anywhere in the API. */
    deactivate: async (id: string) =>
      (await apiClient.delete<{ data: AdminUser }>(`/users/${id}`)).data.data,
    activate: async (id: string) =>
      (await apiClient.post<{ data: AdminUser }>(`/users/${id}/activate`)).data
        .data,
    resetCredential: async (id: string) =>
      (
        await apiClient.post<{ data: IssuedCredential }>(
          `/users/${id}/reset-credential`,
        )
      ).data.data,
    permissions: async () =>
      (await apiClient.get<{ data: PermissionCatalogue }>("/users/permissions"))
        .data.data,
  },

  // ---- Roles (roles.manage) — US-04 ----------------------------------------
  roles: {
    list: async () =>
      (await apiClient.get<{ data: RoleSet[] }>("/roles")).data.data,
    /** `applyToStaff` also applies the change to people already in the role. */
    update: async (
      role: string,
      body: { permissions: string[]; applyToStaff: boolean },
    ) =>
      (await apiClient.put<{ data: RoleChange }>(`/roles/${role}`, body)).data
        .data,
    reset: async (role: string, applyToStaff: boolean) =>
      (
        await apiClient.post<{ data: RoleChange }>(`/roles/${role}/reset`, {
          applyToStaff,
        })
      ).data.data,
  },

  // ---- Hospital (read: dashboard.view, write: hospital.config) -------------
  hospital: {
    get: async () =>
      (await apiClient.get<{ data: HospitalProfile }>("/hospital")).data.data,
    update: async (patch: HospitalPatch) =>
      (await apiClient.patch<{ data: HospitalProfile }>("/hospital", patch))
        .data.data,
  },

  // ---- Departments (write: hospital.config) --------------------------------
  departments: {
    list: async (
      params: {
        search?: string;
        isActive?: boolean;
        page?: number;
        limit?: number;
      } = {},
    ) =>
      (await apiClient.get<Paged<Department>>("/departments", { params })).data,
    create: async (body: DepartmentBody) =>
      (await apiClient.post<{ data: Department }>("/departments", body)).data
        .data,
    update: async (id: string, body: Partial<DepartmentBody>) =>
      (await apiClient.patch<{ data: Department }>(`/departments/${id}`, body))
        .data.data,
    /** refused with DEPARTMENT_IN_USE while active staff or wards point at it. */
    deactivate: async (id: string) =>
      (
        await apiClient.delete<{ data: { message: string } }>(
          `/departments/${id}`,
        )
      ).data.data,
    activate: async (id: string) =>
      (
        await apiClient.post<{ data: Department }>(
          `/departments/${id}/activate`,
        )
      ).data.data,
  },

  // ---- Wards, rooms, beds (mounted at /beds) -------------------------------
  wards: {
    list: async () =>
      (
        await apiClient.get<Paged<Ward>>("/beds/wards", {
          params: { limit: MAX_LIMIT },
        })
      ).data.data,
    create: async (body: WardBody) =>
      (await apiClient.post<{ data: Ward }>("/beds/wards", body)).data.data,
    update: async (
      id: string,
      body: Partial<WardBody> & { isActive?: boolean },
    ) =>
      (await apiClient.patch<{ data: Ward }>(`/beds/wards/${id}`, body)).data
        .data,
  },

  rooms: {
    list: async (wardId: string) =>
      (
        await apiClient.get<Paged<Room>>("/beds/rooms", {
          params: { wardId, limit: MAX_LIMIT },
        })
      ).data.data,
    create: async (body: {
      wardId: string;
      number: string;
      type?: RoomType;
      dailyCharge?: number;
    }) => (await apiClient.post<{ data: Room }>("/beds/rooms", body)).data.data,
  },

  beds: {
    /** every bed matching the filter, across pages; one page stops silently at 200. */
    listAll: async (params: { wardId?: string; roomId?: string } = {}) => {
      const out: Bed[] = [];
      for (let page = 1; ; page += 1) {
        const res = await apiClient.get<Paged<Bed>>("/beds", {
          params: { ...params, page, limit: MAX_LIMIT },
        });
        out.push(...res.data.data);
        if (page >= (res.data.meta?.pages ?? 1)) break;
      }
      return out;
    },
    board: async () =>
      (await apiClient.get<{ data: BedBoard }>("/beds/board")).data.data,
    bulk: async (body: BulkBedsBody) =>
      (await apiClient.post<{ data: BulkBedsResult }>("/beds/bulk", body)).data
        .data,
    /** `occupied` is not accepted; admission and discharge own that transition. */
    setStatus: async (
      id: string,
      body: {
        status: Exclude<BedStatus, "occupied">;
        maintenanceNote?: string;
      },
    ) =>
      (await apiClient.patch<{ data: Bed }>(`/beds/${id}/status`, body)).data
        .data,
  },
};
