import React, { useState } from "react";
import { useNavigation } from "@react-navigation/native";
import { UserPlus, Users } from "lucide-react-native";

import { ROLES, ROLE_LABELS, type Role } from "@shared/permissions";
import {
  Screen,
  Text,
  VStack,
  HStack,
  Card,
  ChipsRow,
  SearchInput,
  Button,
  Skeleton,
  ErrorState,
  EmptyState,
  StatusChip,
  Avatar,
  Pagination,
} from "@shared/ui";
import { useDebouncedValue } from "@shared/hooks/useDebouncedValue";
import { formatDateTime } from "@shared/format";
import { useUsers } from "@modules/admin/hooks/useAdmin";

const LIMIT = 30;

const ROLE_CHIPS = [
  { key: "all", label: "All roles" },
  ...(Object.values(ROLES) as Role[]).map((r) => ({ key: r, label: ROLE_LABELS[r] })),
];

const STATUS_CHIPS = [
  { key: "all", label: "Everyone" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Deactivated" },
];

/**
 * Every staff account in this hospital.
 *
 * Deactivated accounts are listed rather than hidden by default, because they
 * are never deleted — history stays attached to them — and the question "did
 * we already make an account for this person?" has to find them.
 */
export default function UsersScreen() {
  const navigation = useNavigation<any>();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"all" | Role>("all");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(1);
  const debounced = useDebouncedValue(search, 300);

  const { data, isLoading, isError, error, refetch, isRefetching } = useUsers({
    search: debounced.trim() || undefined,
    role: role === "all" ? undefined : role,
    isActive: status === "all" ? undefined : status === "active",
    page,
    limit: LIMIT,
  });
  const rows = data?.data ?? [];

  return (
    <Screen
      overline="Administration"
      title="Users"
      subtitle="One account per person. Accounts are deactivated, never deleted."
      refreshing={isRefetching}
      onRefresh={refetch}
      testID="users-screen"
      right={
        <Button
          label="Add a user"
          size="sm"
          icon={<UserPlus size={15} color="#FFFFFF" />}
          onPress={() => navigation.navigate("CreateUser")}
          testID="user-create-button"
        />
      }
    >
      <VStack gap={12}>
        <SearchInput
          value={search}
          onChangeText={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Name, email or employee ID"
          testID="users-search"
        />
        <ChipsRow
          chips={ROLE_CHIPS}
          active={role}
          onChange={(k) => {
            setRole(k as "all" | Role);
            setPage(1);
          }}
        />
        <ChipsRow
          chips={STATUS_CHIPS}
          active={status}
          onChange={(k) => {
            setStatus(k as "all" | "active" | "inactive");
            setPage(1);
          }}
        />

        {isLoading ? (
          <VStack gap={8}>
            <Skeleton height={68} />
            <Skeleton height={68} />
            <Skeleton height={68} />
          </VStack>
        ) : isError ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={debounced || role !== "all" || status !== "all" ? "No one matches" : "No accounts yet"}
            message="Try a different name or filter, or add the person as a new user."
          />
        ) : (
          <VStack gap={8} testID="user-rows">
            {rows.map((u) => (
              <Card
                key={u.id}
                compact
                onPress={() => navigation.navigate("UserDetail", { userId: u.id })}
                testID={`user-row-${u.employeeId}`}
              >
                <HStack gap={12} align="center" wrap>
                  <Avatar name={u.fullName} uri={u.avatarUrl || undefined} />
                  <VStack gap={2} style={{ flex: 1, minWidth: 200 }}>
                    <HStack gap={8} align="center" wrap>
                      <Text variant="label-lg">{u.fullName}</Text>
                      <Text variant="caption" tone="tertiary" tabular>
                        {u.employeeId}
                      </Text>
                    </HStack>
                    <Text variant="body-sm" tone="secondary">
                      {u.roleLabel}
                      {u.designation ? ` · ${u.designation}` : ""} · {u.department?.name ?? "No department"}
                    </Text>
                    <Text variant="caption" tone="tertiary">
                      {u.email}
                    </Text>
                  </VStack>
                  <VStack gap={4} align="flex-end">
                    <StatusChip status={u.isActive ? "active" : "inactive"} size="sm" />
                    <Text variant="caption" tone="tertiary">
                      {u.lastLoginAt ? `Last signed in ${formatDateTime(u.lastLoginAt)}` : "Never signed in"}
                    </Text>
                    {u.mustChangePassword ? (
                      <Text variant="caption" tone="warning">
                        Still on a temporary password
                      </Text>
                    ) : null}
                  </VStack>
                </HStack>
              </Card>
            ))}
          </VStack>
        )}

        {data && data.meta.pages > 1 ? (
          <Pagination
            page={page}
            totalPages={data.meta.pages}
            total={data.meta.total}
            limit={LIMIT}
            onPageChange={setPage}
            label="accounts"
          />
        ) : null}
      </VStack>
    </Screen>
  );
}
