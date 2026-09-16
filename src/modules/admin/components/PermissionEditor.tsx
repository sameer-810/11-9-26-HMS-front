import React, { useMemo, useState } from "react";
import { View } from "react-native";

import {
  ADMIN_ONLY_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSION_META,
} from "@shared/permissions";
import {
  Card,
  SectionHeader,
  VStack,
  HStack,
  Text,
  Button,
  Banner,
  Skeleton,
  ErrorState,
} from "@shared/ui";
import { apiErrorMessage } from "@api/apiClient";
import {
  usePermissionCatalogue,
  useUpdateUser,
} from "@modules/admin/hooks/useAdmin";
import { ToggleRow } from "@modules/admin/components/ToggleRow";
import type { AdminUser } from "@modules/admin/types";

/**
 * Per-person permissions (Flow 4 step 4). Saves send the whole set; the server refuses only
 * additions — admin-only permissions, or ones the admin does not hold — so anything the person
 * already has can be kept or removed. The editor warns first but still sends.
 */
export function PermissionEditor({ user }: { user: AdminUser }) {
  const catalogue = usePermissionCatalogue();
  const update = useUpdateUser(user.id);
  /** Null while untouched, so a role change's re-seeded set shows through. */
  const [edits, setEdits] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);

  const draft = edits ?? user.permissions;
  const original = useMemo(() => new Set(user.permissions), [user.permissions]);
  const grantable = useMemo(
    () =>
      new Map(
        (catalogue.data?.assignable ?? []).map((a) => [
          a.permission,
          a.grantable,
        ]),
      ),
    [catalogue.data],
  );

  const groups = useMemo(() => {
    const all = catalogue.data?.all ?? [];
    const names: string[] = [...PERMISSION_GROUPS, "Other"];
    return names
      .map((group) => ({
        group,
        perms: all.filter(
          (p) => (PERMISSION_META[p]?.group ?? "Other") === group,
        ),
      }))
      .filter((g) => g.perms.length > 0);
  }, [catalogue.data]);

  if (catalogue.isLoading) {
    return (
      <Card>
        <Skeleton height={180} />
      </Card>
    );
  }
  if (catalogue.isError || !catalogue.data) {
    return (
      <ErrorState
        title="Could not load the permission list"
        error={catalogue.error}
        onRetry={catalogue.refetch}
      />
    );
  }

  const all = catalogue.data.all;
  const held = new Set(draft);
  const changed =
    draft.length !== original.size || draft.some((p) => !original.has(p));
  // icu.access is re-derived from the ICU staff switch on save, so it is never a grant.
  const refused = draft.filter(
    (p) =>
      p !== PERMISSIONS.ICU_ACCESS &&
      !original.has(p) &&
      (ADMIN_ONLY_PERMISSIONS.includes(p) || grantable.get(p) !== true),
  );

  const toggle = (permission: string, on: boolean) => {
    setSaved(false);
    const next = new Set(draft);
    if (on) next.add(permission);
    else next.delete(permission);
    const known = new Set(all);
    // Catalogue order; permissions the catalogue does not list are kept untouched.
    setEdits([
      ...draft.filter((p) => !known.has(p)),
      ...all.filter((p) => next.has(p)),
    ]);
  };

  const label = (p: string) => PERMISSION_META[p]?.label ?? p;

  return (
    <Card testID="user-permissions">
      <SectionHeader
        title="Permissions"
        subtitle={`${draft.length} held. Starts from the role; adjust where this person needs something different.`}
      />
      <VStack gap={14}>
        {refused.length > 0 ? (
          <View testID="user-permissions-warning">
            <Banner
              tone="warning"
              title="You cannot save this set as it stands"
              message={`${refused.slice(0, 4).map(label).join(", ")}${
                refused.length > 4 ? ` and ${refused.length - 4} more` : ""
              } — you can only add permissions you hold yourself, and never the administrator-only ones. Untick them, or change the role instead, which resets access to that role's defaults.`}
            />
          </View>
        ) : null}
        {update.isError ? (
          <View testID="user-permissions-error">
            <Banner
              tone="danger"
              message={apiErrorMessage(
                update.error,
                "Could not save the permissions",
              )}
            />
          </View>
        ) : null}
        {saved ? (
          <View testID="user-permissions-saved">
            <Banner
              tone="success"
              message="Permissions saved. They apply from this person's next request."
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
                const adminOnly = ADMIN_ONLY_PERMISSIONS.includes(p);
                const icu = p === PERMISSIONS.ICU_ACCESS;
                const canGrant = grantable.get(p) === true;
                const note = icu
                  ? "Follows the ICU staff switch in the profile above."
                  : adminOnly
                    ? "Comes with the administrator role. Cannot be granted to one person."
                    : !canGrant
                      ? original.has(p)
                        ? "You do not hold this yourself. It can stay or be removed, but once saved without it you cannot give it back."
                        : "You do not hold this yourself, so you cannot grant it."
                      : meta?.clinical
                        ? "Clinical access. Every use is logged against this person."
                        : undefined;
                return (
                  <View key={p} style={{ flexBasis: 320, flexGrow: 1 }}>
                    <ToggleRow
                      label={meta?.label ?? p}
                      description={meta?.description}
                      note={note}
                      noteTone={
                        icu
                          ? "tertiary"
                          : adminOnly || !canGrant
                            ? "warning"
                            : meta?.clinical
                              ? "danger"
                              : "tertiary"
                      }
                      checked={held.has(p)}
                      // Keeping or removing what the person holds is allowed; adding what you lack is not.
                      disabled={
                        icu || adminOnly || (!canGrant && !original.has(p))
                      }
                      onChange={(on) => toggle(p, on)}
                      testID={`user-permission-${p}`}
                    />
                  </View>
                );
              })}
            </HStack>
          </VStack>
        ))}

        <HStack gap={8} wrap>
          <Button
            label="Save permissions"
            fullWidth={false}
            disabled={!changed}
            loading={update.isPending}
            onPress={() =>
              update.mutate(
                { permissions: draft },
                {
                  onSuccess: () => {
                    setEdits(null);
                    setSaved(true);
                  },
                },
              )
            }
            testID="user-save-permissions"
          />
          {changed ? (
            <Button
              label="Undo changes"
              variant="ghost"
              fullWidth={false}
              onPress={() => {
                setEdits(null);
                update.reset();
              }}
              testID="user-permissions-undo"
            />
          ) : null}
        </HStack>
      </VStack>
    </Card>
  );
}
