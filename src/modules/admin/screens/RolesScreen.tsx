import React, { useMemo, useState } from "react";
import { View } from "react-native";

import {
  ADMIN_ONLY_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSION_META,
  ROLES,
  type Role,
} from "@shared/permissions";
import {
  Screen,
  Card,
  SectionHeader,
  VStack,
  HStack,
  Text,
  Button,
  Banner,
  Skeleton,
  ErrorState,
  ConfirmDialog,
} from "@shared/ui";
import { apiErrorMessage } from "@api/apiClient";
import { formatDateTime } from "@shared/format";
import { TabChips } from "@modules/admin/components/TabChips";
import { ToggleRow } from "@modules/admin/components/ToggleRow";
import {
  useResetRole,
  useRoles,
  useSaveRole,
} from "@modules/admin/hooks/useAdmin";
import {
  ROLE_SUMMARIES,
  type RoleChange,
  type RoleSet,
} from "@modules/admin/types";

const CATALOGUE = Object.values(PERMISSIONS) as string[];
const label = (p: string) => PERMISSION_META[p]?.label ?? p;
const listOf = (perms: string[]) => perms.map(label).join(", ");

function describe(change: RoleChange) {
  const parts: string[] = [];
  if (change.added.length) parts.push(`added ${listOf(change.added)}`);
  if (change.removed.length) parts.push(`removed ${listOf(change.removed)}`);
  const what = parts.length
    ? `${change.label}: ${parts.join("; ")}.`
    : `${change.label}: nothing changed.`;
  const who = change.applyToStaff
    ? ` Applied to the ${change.staffUpdated} ${change.staffUpdated === 1 ? "person" : "people"} in this role, from their next action.`
    : " People already in this role keep their current access; new staff start with this set.";
  return what + who;
}

/**
 * Role permissions (US-04). "Apply to staff" pushes only the diff, keeping per-person grants;
 * permissions the admin cannot grant are shown locked with a reason, not hidden.
 */
export default function RolesScreen() {
  const roles = useRoles();
  const [active, setActive] = useState<Role>(ROLES.RECEPTIONIST);
  // Held here because the editor remounts when the saved set changes.
  const [result, setResult] = useState<RoleChange | null>(null);
  const list = roles.data ?? [];
  const current = list.find((r) => r.role === active);

  return (
    <Screen
      overline="Administration"
      title="Roles & permissions"
      subtitle="What each role opens. New staff start with their role's set, and changing someone's role resets them to it."
      refreshing={roles.isRefetching}
      onRefresh={roles.refetch}
      testID="roles-screen"
    >
      {roles.isLoading ? (
        <Skeleton height={320} />
      ) : roles.isError ? (
        <ErrorState
          error={roles.error}
          title="Couldn't load the roles"
          onRetry={roles.refetch}
        />
      ) : (
        <VStack gap={14}>
          <TabChips
            chips={list.map((r) => ({
              key: r.role,
              label: r.customised ? `${r.label} (changed)` : r.label,
            }))}
            active={active}
            onChange={(k) => {
              setActive(k as Role);
              setResult(null);
            }}
            testIDPrefix="role-tab"
          />
          {current ? (
            // Keyed by the saved set too, so a save or reset re-seeds the draft.
            <RoleEditor
              key={`${current.role}:${current.permissions.join(",")}`}
              role={current}
              result={result?.role === current.role ? result : null}
              onResult={setResult}
            />
          ) : null}
        </VStack>
      )}
    </Screen>
  );
}

function RoleEditor({
  role,
  result,
  onResult: setResult,
}: {
  role: RoleSet;
  result: RoleChange | null;
  onResult: (change: RoleChange | null) => void;
}) {
  const save = useSaveRole();
  const reset = useResetRole();
  const [draft, setDraft] = useState<string[]>(role.permissions);
  const [applyToStaff, setApplyToStaff] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const saved = useMemo(() => new Set(role.permissions), [role.permissions]);
  const standard = useMemo(() => new Set(role.defaults), [role.defaults]);
  const grantable = useMemo(() => new Set(role.grantable), [role.grantable]);
  const held = new Set(draft);
  const added = draft.filter((p) => !saved.has(p));
  const removed = role.permissions.filter((p) => !held.has(p));
  const changed = added.length + removed.length > 0;

  const groups = [...PERMISSION_GROUPS, "Other"]
    .map((group) => ({
      group,
      perms: CATALOGUE.filter(
        (p) => (PERMISSION_META[p]?.group ?? "Other") === group,
      ),
    }))
    .filter((g) => g.perms.length > 0);

  const error = save.error ?? reset.error;

  if (!role.editable) {
    return (
      <Card testID="role-editor">
        <SectionHeader
          title={role.label}
          subtitle={ROLE_SUMMARIES[role.role]}
        />
        <VStack gap={12}>
          <Banner
            tone="info"
            title="This role is fixed"
            message="The administrator manages who may see the medical record and must never be able to read it, so this set cannot be changed — not here, and not on one person's account."
          />
          <Text variant="body-sm" tone="secondary">
            {listOf(role.permissions)}
          </Text>
        </VStack>
      </Card>
    );
  }

  const toggle = (p: string, on: boolean) => {
    setResult(null);
    const next = new Set(draft);
    if (on) next.add(p);
    else next.delete(p);
    setDraft(CATALOGUE.filter((x) => next.has(x)));
  };

  return (
    <Card testID="role-editor">
      <SectionHeader
        title={role.label}
        subtitle={`${ROLE_SUMMARIES[role.role]} ${role.staff.active} active ${role.staff.active === 1 ? "person" : "people"}.`}
      />
      <VStack gap={14}>
        <Text variant="caption" tone="tertiary" testID="role-origin">
          {role.customised
            ? `Changed for this hospital${role.updatedByName ? ` by ${role.updatedByName}` : ""}${role.updatedAt ? ` on ${formatDateTime(role.updatedAt)}` : ""}.`
            : "The standard set from the hospital's permission matrix."}
        </Text>

        {error ? (
          <View testID="role-error">
            <Banner
              tone="danger"
              message={apiErrorMessage(error, "Could not save the role")}
            />
          </View>
        ) : null}
        {result ? (
          <View testID="role-saved">
            <Banner
              tone="success"
              message={describe(result)}
              onDismiss={() => setResult(null)}
            />
          </View>
        ) : null}

        {groups.map(({ group, perms }) => (
          <VStack key={group} gap={2}>
            <Text variant="overline" tone="tertiary">
              {group}
            </Text>
            <HStack gap={4} wrap>
              {perms.map((p) => {
                const meta = PERMISSION_META[p];
                const isDashboard = p === PERMISSIONS.DASHBOARD_VIEW;
                const adminOnly = ADMIN_ONLY_PERMISSIONS.includes(p as never);
                const canGrant = grantable.has(p);
                const on = held.has(p);
                const note = isDashboard
                  ? "Every role keeps the dashboard — it is where staff land after signing in."
                  : adminOnly
                    ? "Comes with the administrator role only."
                    : !canGrant
                      ? "Not in this role's standard set, and you do not hold it yourself."
                      : !standard.has(p) && on
                        ? "Not in the standard set — added for this hospital."
                        : standard.has(p) && !on
                          ? "In the standard set — removed for this hospital."
                          : meta?.clinical
                            ? "Clinical access. Every use is logged against the person."
                            : undefined;
                return (
                  <View key={p} style={{ flexBasis: 320, flexGrow: 1 }}>
                    <ToggleRow
                      label={meta?.label ?? p}
                      description={meta?.description}
                      note={note}
                      noteTone={
                        !canGrant || adminOnly
                          ? "warning"
                          : meta?.clinical
                            ? "danger"
                            : "tertiary"
                      }
                      checked={on}
                      disabled={isDashboard || adminOnly || (!canGrant && !on)}
                      onChange={(next) => toggle(p, next)}
                      testID={`role-permission-${p}`}
                    />
                  </View>
                );
              })}
            </HStack>
          </VStack>
        ))}

        {changed ? (
          <Text variant="body-sm" tone="secondary" testID="role-diff">
            {[
              added.length ? `Adding ${listOf(added)}.` : "",
              removed.length ? `Removing ${listOf(removed)}.` : "",
            ]
              .filter(Boolean)
              .join(" ")}
          </Text>
        ) : null}

        <ToggleRow
          label={`Also apply to the ${role.staff.total} ${role.staff.total === 1 ? "person" : "people"} already in this role`}
          description="What you add is given to them and what you remove is taken away, from their next action. Anything granted to one person on their own account is kept. Leave unticked to change only what new staff start with."
          checked={applyToStaff}
          onChange={setApplyToStaff}
          testID="role-apply-staff"
        />

        <HStack gap={8} wrap>
          <Button
            label="Save role"
            fullWidth={false}
            disabled={!changed}
            loading={save.isPending}
            onPress={() =>
              save.mutate(
                { role: role.role, permissions: draft, applyToStaff },
                { onSuccess: (change) => setResult(change) },
              )
            }
            testID="role-save"
          />
          {changed ? (
            <Button
              label="Undo changes"
              variant="ghost"
              fullWidth={false}
              onPress={() => {
                setDraft(role.permissions);
                save.reset();
              }}
              testID="role-undo"
            />
          ) : null}
          {role.customised ? (
            <Button
              label="Reset to the standard set"
              variant="secondary"
              fullWidth={false}
              disabled={save.isPending || reset.isPending}
              onPress={() => setConfirmReset(true)}
              testID="role-reset"
            />
          ) : null}
        </HStack>
      </VStack>

      <ConfirmDialog
        visible={confirmReset}
        title={`Reset ${role.label} to the standard set?`}
        message={
          applyToStaff
            ? `This hospital's changes are undone, and the difference is applied to the ${role.staff.total} ${role.staff.total === 1 ? "person" : "people"} in this role.`
            : "This hospital's changes are undone for anyone given this role from now on. People already in the role keep their current access unless you tick 'Also apply'."
        }
        confirmLabel="Yes, reset"
        cancelLabel="Keep this hospital's set"
        loading={reset.isPending}
        onConfirm={() =>
          reset.mutate(
            { role: role.role, applyToStaff },
            {
              onSuccess: (change) => setResult(change),
              onSettled: () => setConfirmReset(false),
            },
          )
        }
        onCancel={() => setConfirmReset(false)}
      />
    </Card>
  );
}
