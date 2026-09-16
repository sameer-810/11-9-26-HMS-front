import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { adminApi } from "@modules/admin/api/adminApi";
import { useBedBoard } from "@modules/inpatient/hooks/useBeds";
import { useAuthStore } from "@shared/store/useAuthStore";
import type {
  AdminUser,
  BedBoard,
  BedStatus,
  BulkBedsBody,
  CreateUserBody,
  DepartmentBody,
  HospitalPatch,
  RoomType,
  UpdateUserBody,
  UserListParams,
  WardBody,
} from "@modules/admin/types";

/** Keys under "admin" so they never collide with pickers caching a different shape (e.g. `["wards"]`). */
export const adminKeys = {
  users: (params?: UserListParams) => ["admin", "users", params] as const,
  user: (id?: string) => ["admin", "user", id] as const,
  permissionCatalogue: ["admin", "permission-catalogue"] as const,
  roles: ["admin", "roles"] as const,
  hospital: ["admin", "hospital"] as const,
  departments: (params?: object) => ["admin", "departments", params] as const,
  wards: ["admin", "wards"] as const,
  rooms: (wardId?: string) => ["admin", "rooms", wardId] as const,
  wardBeds: (wardId?: string) => ["admin", "ward-beds", wardId] as const,
  allBeds: ["admin", "all-beds"] as const,
};


// ---- Users ------------------------------------------------------------------

/** Account changes affect the staff list, doctor pickers and dashboard figures. */
function afterUserChange(qc: QueryClient, user: AdminUser) {
  qc.setQueryData(adminKeys.user(user.id), user);
  for (const key of [["admin", "users"], ["doctors"], ["dashboard-summary"]]) {
    qc.invalidateQueries({ queryKey: key });
  }
}

export const useUsers = (params: UserListParams) =>
  useQuery({
    queryKey: adminKeys.users(params),
    queryFn: () => adminApi.users.list(params),
    placeholderData: (prev) => prev,
  });

export const useUser = (id?: string) =>
  useQuery({
    queryKey: adminKeys.user(id),
    queryFn: () => adminApi.users.get(id!),
    enabled: Boolean(id),
    staleTime: 0,
  });

export const usePermissionCatalogue = () =>
  useQuery({
    queryKey: adminKeys.permissionCatalogue,
    queryFn: adminApi.users.permissions,
    staleTime: 10 * 60_000,
  });

export const useCreateUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateUserBody) => adminApi.users.create(body),
    // Cache the account only; the temporary password must never enter the query cache.
    onSuccess: (res) => afterUserChange(qc, res.user),
  });
};

export const useUpdateUser = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateUserBody) => adminApi.users.update(id, body),
    onSuccess: (user) => afterUserChange(qc, user),
    // A refusal can mean the record moved under us — reload the truth.
    onError: () => qc.invalidateQueries({ queryKey: adminKeys.user(id) }),
  });
};

export const useSetUserActive = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (active: boolean) =>
      active ? adminApi.users.activate(id) : adminApi.users.deactivate(id),
    onSuccess: (user) => afterUserChange(qc, user),
  });
};

export const useResetCredential = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => adminApi.users.resetCredential(id),
    onSuccess: (res) => afterUserChange(qc, res.user),
  });
};


// ---- Roles (US-04) ----------------------------------------------------------

/** A role change can change every account in the role, so every account view refetches. */
function afterRoleChange(qc: QueryClient) {
  for (const key of [adminKeys.roles, ["admin", "users"], ["admin", "user"]]) {
    qc.invalidateQueries({ queryKey: key });
  }
}

export const useRoles = () => useQuery({ queryKey: adminKeys.roles, queryFn: adminApi.roles.list });

export const useSaveRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ role, permissions, applyToStaff }: { role: string; permissions: string[]; applyToStaff: boolean }) =>
      adminApi.roles.update(role, { permissions, applyToStaff }),
    onSuccess: () => afterRoleChange(qc),
    onError: () => qc.invalidateQueries({ queryKey: adminKeys.roles }),
  });
};

export const useResetRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ role, applyToStaff }: { role: string; applyToStaff: boolean }) => adminApi.roles.reset(role, applyToStaff),
    onSuccess: () => afterRoleChange(qc),
  });
};


// ---- Hospital ---------------------------------------------------------------
export const useHospitalProfile = () =>
  useQuery({ queryKey: adminKeys.hospital, queryFn: adminApi.hospital.get });

export const useUpdateHospital = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: HospitalPatch) => adminApi.hospital.update(patch),
    onSuccess: (hospital) => {
      qc.setQueryData(adminKeys.hospital, hospital);
      // Header name and idle timeout read from the auth store; update it so both apply now.
      useAuthStore.setState((s) => ({
        hospital: s.hospital
          ? { ...s.hospital, name: hospital.name, sessionIdleMinutes: hospital.sessionIdleMinutes }
          : s.hospital,
      }));
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
};


// ---- Departments ------------------------------------------------------------

/** The admin list shows inactive departments too; the pickers do not. */
function afterDepartmentChange(qc: QueryClient) {
  for (const key of [["admin", "departments"], ["departments"], ["dashboard-summary"]]) {
    qc.invalidateQueries({ queryKey: key });
  }
}

export const useAdminDepartments = (params: { search?: string } = {}) =>
  useQuery({
    queryKey: adminKeys.departments(params),
    queryFn: () => adminApi.departments.list({ ...params, limit: 200 }),
    placeholderData: (prev) => prev,
  });

export const useCreateDepartment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DepartmentBody) => adminApi.departments.create(body),
    onSuccess: () => afterDepartmentChange(qc),
  });
};

export const useUpdateDepartment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<DepartmentBody> }) =>
      adminApi.departments.update(id, body),
    onSuccess: () => afterDepartmentChange(qc),
  });
};

export const useSetDepartmentActive = () => {
  const qc = useQueryClient();
  return useMutation({
    // The two endpoints return different shapes; lists refetch anyway.
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      if (active) await adminApi.departments.activate(id);
      else await adminApi.departments.deactivate(id);
    },
    onSuccess: () => afterDepartmentChange(qc),
  });
};


// ---- Wards, rooms, beds -----------------------------------------------------

/** Bed estate changes also show in the bed picker, ward list, bed board and occupancy figure. */
function afterBedEstateChange(qc: QueryClient) {
  for (const key of [
    ["admin", "wards"],
    ["admin", "rooms"],
    ["admin", "ward-beds"],
    ["admin", "all-beds"],
    ["wards"],
    ["bed-board"],
    ["selectable-beds"],
    ["dashboard-summary"],
  ]) {
    qc.invalidateQueries({ queryKey: key });
  }
}

export const useAdminWards = () => useQuery({ queryKey: adminKeys.wards, queryFn: adminApi.wards.list });

export const useCreateWard = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: WardBody) => adminApi.wards.create(body),
    onSuccess: () => afterBedEstateChange(qc),
  });
};

export const useSetWardActive = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      adminApi.wards.update(id, { isActive: active }),
    onSuccess: () => afterBedEstateChange(qc),
  });
};

export const useRooms = (wardId?: string) =>
  useQuery({
    queryKey: adminKeys.rooms(wardId),
    queryFn: () => adminApi.rooms.list(wardId!),
    enabled: Boolean(wardId),
  });

export const useCreateRoom = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { wardId: string; number: string; type?: RoomType; dailyCharge?: number }) =>
      adminApi.rooms.create(body),
    onSuccess: () => afterBedEstateChange(qc),
  });
};

export const useWardBeds = (wardId?: string) =>
  useQuery({
    queryKey: adminKeys.wardBeds(wardId),
    queryFn: () => adminApi.beds.listAll({ wardId }),
    enabled: Boolean(wardId),
  });

export const useCreateBedsBulk = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BulkBedsBody) => adminApi.beds.bulk(body),
    onSuccess: () => afterBedEstateChange(qc),
  });
};

/** Every bed, for the bed board. Polled each minute, as the screen stays open all shift. */
export const useAllBeds = () =>
  useQuery({
    queryKey: adminKeys.allBeds,
    queryFn: () => adminApi.beds.listAll(),
    staleTime: 0,
    refetchInterval: 60_000,
  });

/** Per-ward counts from the inpatient bed-board cache entry, typed properly here. */
export const useBedBoardCounts = () => {
  const query = useBedBoard();
  return { ...query, data: query.data as BedBoard | undefined };
};

export const useSetBedStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      maintenanceNote,
    }: {
      id: string;
      status: Exclude<BedStatus, "occupied">;
      maintenanceNote?: string;
    }) => adminApi.beds.setStatus(id, { status, maintenanceNote }),
    onSuccess: () => afterBedEstateChange(qc),
    // A refusal usually means the bed moved on — someone admitted into it.
    onError: () => afterBedEstateChange(qc),
  });
};
