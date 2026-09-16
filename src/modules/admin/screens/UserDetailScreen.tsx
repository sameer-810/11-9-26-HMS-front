import React, { useState } from "react";
import { View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { ROLES, ROLE_LABELS, type Role } from "@shared/permissions";
import { useAuthStore } from "@shared/store/useAuthStore";
import {
  Screen,
  Text,
  VStack,
  HStack,
  Card,
  SectionHeader,
  Button,
  Select,
  Banner,
  Skeleton,
  ErrorState,
  ConfirmDialog,
  StatusChip,
} from "@shared/ui";
import { ControlledTextField } from "@shared/form/ControlledTextField";
import { apiErrorMessage } from "@api/apiClient";
import { formatDateTime } from "@shared/format";
import { useDepartments } from "@modules/appointment/hooks/useDirectory";
import {
  useUser,
  useUpdateUser,
  useSetUserActive,
  useResetCredential,
  useAdminWards,
} from "@modules/admin/hooks/useAdmin";
import { PermissionEditor } from "@modules/admin/components/PermissionEditor";
import { CredentialPanel } from "@modules/admin/components/CredentialPanel";
import { ToggleRow } from "@modules/admin/components/ToggleRow";
import {
  CLINICAL_ROLES,
  editUserSchema,
  type EditUserForm,
} from "@modules/admin/admin.validation";
import {
  ROLE_SUMMARIES,
  type AdminUser,
  type IssuedCredential,
  type UpdateUserBody,
} from "@modules/admin/types";

const ROLE_OPTIONS = (Object.values(ROLES) as Role[]).map((r) => ({
  value: r,
  label: ROLE_LABELS[r],
  sublabel: ROLE_SUMMARIES[r],
}));

/**
 * One account: profile, role, permissions, credential and status. Each section saves
 * separately, as a role change re-seeds permissions and must not mix with permission edits.
 */
export default function UserDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const userId: string = route.params?.userId;
  const meId = useAuthStore((s) => s.user?.id);

  const {
    data: user,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useUser(userId);

  if (isLoading || !user) {
    return (
      <Screen title="Account" testID="user-detail">
        {isError ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : (
          <Skeleton height={240} />
        )}
      </Screen>
    );
  }

  return (
    <Screen
      overline={`${user.employeeId} · ${user.roleLabel}`}
      title={user.fullName}
      subtitle={`${user.email}${
        user.lastLoginAt
          ? ` · last signed in ${formatDateTime(user.lastLoginAt)}`
          : " · never signed in"
      }`}
      refreshing={isRefetching}
      onRefresh={refetch}
      testID="user-detail"
      right={
        <HStack gap={8} align="center">
          <StatusChip status={user.isActive ? "active" : "inactive"} />
          <Button
            label="All users"
            size="sm"
            variant="ghost"
            fullWidth={false}
            onPress={() => navigation.navigate("UsersList")}
            testID="user-detail-back"
          />
        </HStack>
      }
    >
      <VStack gap={14}>
        {!user.isActive ? (
          <Banner
            tone="info"
            title="Deactivated"
            message="This person cannot sign in. Everything they recorded is kept and still attributed to them."
          />
        ) : user.mustChangePassword ? (
          <Banner
            tone="info"
            message="Still on a temporary password. They will be asked to choose their own at next sign-in."
          />
        ) : null}

        <ProfileSection key={`profile-${user.id}`} user={user} />
        <RoleSection key={`role-${user.id}`} user={user} />
        {user.role === ROLES.NURSE ? (
          <WardSection key={`wards-${user.id}`} user={user} />
        ) : null}
        <PermissionEditor key={`perms-${user.id}`} user={user} />
        <AccountSection
          key={`account-${user.id}`}
          user={user}
          isSelf={user.id === meId}
        />
      </VStack>
    </Screen>
  );
}

function ProfileSection({ user }: { user: AdminUser }) {
  const update = useUpdateUser(user.id);
  const { refetch: refetchUser } = useUser(user.id);
  const [icu, setIcu] = useState(user.icuAuthorized);
  const [result, setResult] = useState<"saved" | "unchanged" | null>(null);
  const clinical = CLINICAL_ROLES.includes(user.role);

  const { control, handleSubmit } = useForm<EditUserForm>({
    resolver: zodResolver(editUserSchema),
    mode: "onTouched",
    defaultValues: {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      designation: user.designation,
      registrationNumber: user.registrationNumber,
      specialization: user.specialization,
      qualifications: user.qualifications,
    },
  });

  const submit = handleSubmit((v) => {
    setResult(null);
    // Send only changed fields; the audit trail records the field names sent.
    const patch: UpdateUserBody = {};
    if (v.firstName !== user.firstName) patch.firstName = v.firstName;
    if ((v.lastName ?? "") !== user.lastName) patch.lastName = v.lastName ?? "";
    if (v.email.toLowerCase() !== user.email) patch.email = v.email;
    // The API treats an empty phone as "no change", so it can be replaced but not cleared.
    if (v.phone && v.phone !== user.phone) patch.phone = v.phone;
    if ((v.designation ?? "") !== user.designation)
      patch.designation = v.designation ?? "";
    if (clinical) {
      if ((v.registrationNumber ?? "") !== user.registrationNumber) {
        patch.registrationNumber = v.registrationNumber ?? "";
      }
      if ((v.specialization ?? "") !== user.specialization)
        patch.specialization = v.specialization ?? "";
      if ((v.qualifications ?? "") !== user.qualifications)
        patch.qualifications = v.qualifications ?? "";
      if (icu !== user.icuAuthorized) patch.icuAuthorized = icu;
    }
    if (Object.keys(patch).length === 0) {
      setResult("unchanged");
      return;
    }
    update.mutate(patch, {
      onSuccess: () => {
        setResult("saved");
        // The server adds or drops icu.access with the switch; reload so the permission list shows it.
        if (patch.icuAuthorized !== undefined) void refetchUser();
      },
    });
  });

  return (
    <Card testID="user-profile">
      <SectionHeader title="Profile" />
      <VStack gap={14}>
        {update.isError ? (
          <View testID="user-profile-error">
            <Banner
              tone="danger"
              message={apiErrorMessage(
                update.error,
                "Could not save the profile",
              )}
            />
          </View>
        ) : null}
        {result === "saved" ? (
          <View testID="user-profile-saved">
            <Banner tone="success" message="Profile saved." />
          </View>
        ) : result === "unchanged" ? (
          <Banner tone="info" message="Nothing has changed." />
        ) : null}

        <HStack gap={12} wrap>
          <View style={{ flex: 1, minWidth: 200 }}>
            <ControlledTextField
              control={control}
              name="firstName"
              label="First name"
              required
              testID="user-edit-firstName"
            />
          </View>
          <View style={{ flex: 1, minWidth: 200 }}>
            <ControlledTextField
              control={control}
              name="lastName"
              label="Last name"
              testID="user-edit-lastName"
            />
          </View>
        </HStack>
        <HStack gap={12} wrap>
          <View style={{ flex: 1, minWidth: 240 }}>
            <ControlledTextField
              control={control}
              name="email"
              label="Work email"
              required
              keyboardType="email-address"
              autoCapitalize="none"
              hint="Changing this changes what they sign in with."
              testID="user-edit-email"
            />
          </View>
          <View style={{ flex: 1, minWidth: 200 }}>
            <ControlledTextField
              control={control}
              name="phone"
              label="Mobile"
              keyboardType="phone-pad"
              testID="user-edit-phone"
            />
          </View>
        </HStack>
        <ControlledTextField
          control={control}
          name="designation"
          label="Designation"
          testID="user-edit-designation"
        />

        {clinical ? (
          <VStack gap={14}>
            <HStack gap={12} wrap>
              <View style={{ flex: 1, minWidth: 200 }}>
                <ControlledTextField
                  control={control}
                  name="registrationNumber"
                  label="Council registration number"
                  testID="user-edit-registrationNumber"
                />
              </View>
              <View style={{ flex: 1, minWidth: 200 }}>
                <ControlledTextField
                  control={control}
                  name="specialization"
                  label="Specialisation"
                  testID="user-edit-specialization"
                />
              </View>
            </HStack>
            <ControlledTextField
              control={control}
              name="qualifications"
              label="Qualifications"
              testID="user-edit-qualifications"
            />
            <ToggleRow
              label="ICU staff"
              description="Gives access to the ICU workspace. Takes effect on their next action; the ICU menu item appears at their next sign-in."
              checked={icu}
              onChange={(v) => {
                setIcu(v);
                setResult(null);
              }}
              testID="user-edit-icuAuthorized"
            />
          </VStack>
        ) : null}

        <Button
          label="Save profile"
          fullWidth={false}
          onPress={submit}
          loading={update.isPending}
          testID="user-save-profile"
        />
      </VStack>
    </Card>
  );
}

function RoleSection({ user }: { user: AdminUser }) {
  const update = useUpdateUser(user.id);
  const { data: departments = [] } = useDepartments();
  const [role, setRole] = useState<string>(user.role);
  const [departmentId, setDepartmentId] = useState<string>(
    user.department?.id ?? "",
  );
  const [confirm, setConfirm] = useState(false);
  const [saved, setSaved] = useState(false);

  const roleChanged = role !== user.role;
  const departmentChanged = departmentId !== (user.department?.id ?? "");

  const options = [
    { value: "", label: "No department" },
    ...departments.map((d) => ({
      value: d.id,
      label: d.name,
      sublabel: d.code,
    })),
  ];
  // The picker lists active departments only; keep a current inactive one visible.
  if (
    user.department &&
    !departments.some((d) => d.id === user.department!.id)
  ) {
    options.push({
      value: user.department.id,
      label: user.department.name,
      sublabel: "Inactive department",
    });
  }

  const save = () => {
    const body: UpdateUserBody = {};
    if (roleChanged) body.role = role as Role;
    if (departmentChanged) body.departmentId = departmentId || null;
    update.mutate(body, {
      onSuccess: () => setSaved(true),
      onSettled: () => setConfirm(false),
    });
  };

  return (
    <Card testID="user-role-section">
      <SectionHeader
        title="Role and department"
        subtitle={ROLE_SUMMARIES[user.role]}
      />
      <VStack gap={14}>
        {update.isError ? (
          <View testID="user-role-error">
            <Banner
              tone="danger"
              message={apiErrorMessage(
                update.error,
                "Could not change the role",
              )}
            />
          </View>
        ) : null}
        {saved ? (
          <View testID="user-role-saved">
            <Banner
              tone="success"
              message="Saved. The new menu and dashboard appear at their next sign-in."
            />
          </View>
        ) : null}

        <HStack gap={12} wrap>
          <View style={{ flex: 1, minWidth: 240 }} testID="user-edit-role">
            <Select
              label="Role"
              value={role}
              options={ROLE_OPTIONS}
              onChange={(v) => {
                setRole(v);
                setSaved(false);
              }}
            />
          </View>
          <View
            style={{ flex: 1, minWidth: 240 }}
            testID="user-edit-department"
          >
            <Select
              label="Department"
              value={departmentId}
              options={options}
              onChange={(v) => {
                setDepartmentId(v);
                setSaved(false);
              }}
            />
          </View>
        </HStack>
        {roleChanged ? (
          <Text variant="caption" tone="warning">
            Changing the role replaces every permission this person holds with
            the defaults for {ROLE_LABELS[role as Role]}, including any
            individual adjustments.
          </Text>
        ) : null}
        <Button
          label="Save role and department"
          fullWidth={false}
          disabled={!roleChanged && !departmentChanged}
          loading={update.isPending && !confirm}
          onPress={() => (roleChanged ? setConfirm(true) : save())}
          testID="user-save-role"
        />
      </VStack>

      <ConfirmDialog
        visible={confirm}
        title={`Make ${user.firstName} ${ROLE_LABELS[role as Role] ?? role}?`}
        message={`Their permissions are reset to that role's defaults, and their menu changes at next sign-in. ${ROLE_SUMMARIES[role as Role] ?? ""}`}
        confirmLabel="Yes, change the role"
        cancelLabel="Keep the current role"
        loading={update.isPending}
        onConfirm={save}
        onCancel={() => setConfirm(false)}
      />
    </Card>
  );
}

/** US-23 nurse ward allocation. It grants record access, so it saves separately from the profile. */
function WardSection({ user }: { user: AdminUser }) {
  const update = useUpdateUser(user.id);
  const wards = useAdminWards();
  const [selected, setSelected] = useState<string[]>(user.wardIds ?? []);
  const [saved, setSaved] = useState(false);

  const original = [...(user.wardIds ?? [])].sort().join(",");
  const changed = [...selected].sort().join(",") !== original;
  // Inactive wards stay listed while this nurse is still on one, so it can be taken off.
  const options = (wards.data ?? []).filter(
    (w) => w.isActive || selected.includes(w.id),
  );

  return (
    <Card testID="user-wards">
      <SectionHeader
        title="Ward allocation"
        subtitle="Everyone admitted to these wards is on this nurse's list, as well as patients allocated to them by name."
      />
      <VStack gap={12}>
        {update.isError ? (
          <View testID="user-wards-error">
            <Banner
              tone="danger"
              message={apiErrorMessage(
                update.error,
                "Could not save the ward allocation",
              )}
            />
          </View>
        ) : null}
        {saved ? (
          <View testID="user-wards-saved">
            <Banner
              tone="success"
              message="Ward allocation saved. Their list changes straight away."
            />
          </View>
        ) : null}

        {wards.isLoading ? (
          <Skeleton height={80} />
        ) : wards.isError ? (
          <ErrorState error={wards.error} onRetry={wards.refetch} />
        ) : options.length === 0 ? (
          <Text variant="body-sm" tone="tertiary">
            No wards are set up yet. Add them under Hospital setup.
          </Text>
        ) : (
          <HStack gap={4} wrap>
            {options.map((w) => (
              <View key={w.id} style={{ flexBasis: 260, flexGrow: 1 }}>
                <ToggleRow
                  label={w.name}
                  description={[
                    w.code,
                    w.department?.name,
                    w.isActive ? "" : "Inactive",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  checked={selected.includes(w.id)}
                  onChange={(on) => {
                    setSaved(false);
                    setSelected((s) =>
                      on ? [...s, w.id] : s.filter((id) => id !== w.id),
                    );
                  }}
                  testID={`user-ward-${w.code}`}
                />
              </View>
            ))}
          </HStack>
        )}

        <Button
          label="Save ward allocation"
          fullWidth={false}
          disabled={!changed}
          loading={update.isPending}
          onPress={() =>
            update.mutate(
              { wardIds: selected },
              { onSuccess: () => setSaved(true) },
            )
          }
          testID="user-save-wards"
        />
      </VStack>
    </Card>
  );
}

type Dialog = "deactivate" | "activate" | "reset" | null;

function AccountSection({
  user,
  isSelf,
}: {
  user: AdminUser;
  isSelf: boolean;
}) {
  const setActive = useSetUserActive(user.id);
  const resetCredential = useResetCredential(user.id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [issued, setIssued] = useState<IssuedCredential | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const begin = () => {
    setNotice(null);
    setFailure(null);
  };

  const confirmDialog = () => {
    begin();
    if (dialog === "reset") {
      resetCredential.mutate(undefined, {
        onSuccess: (res) => setIssued(res),
        onError: (e) =>
          setFailure(apiErrorMessage(e, "Could not reset the credential")),
        onSettled: () => setDialog(null),
      });
      return;
    }
    const activate = dialog === "activate";
    setActive.mutate(activate, {
      onSuccess: () =>
        setNotice(
          activate
            ? `${user.fullName} can sign in again.`
            : `${user.fullName} has been signed out everywhere and can no longer sign in.`,
        ),
      onError: (e) =>
        setFailure(
          apiErrorMessage(
            e,
            activate
              ? "Could not reactivate the account"
              : "Could not deactivate the account",
          ),
        ),
      onSettled: () => setDialog(null),
    });
  };

  return (
    <Card testID="user-account">
      <SectionHeader
        title="Sign-in and status"
        subtitle={isSelf ? "This is your own account." : undefined}
      />
      <VStack gap={14}>
        {failure ? (
          <View testID="user-account-error">
            <Banner
              tone="danger"
              message={failure}
              onDismiss={() => setFailure(null)}
            />
          </View>
        ) : null}
        {notice ? (
          <View testID="user-account-notice">
            <Banner tone="success" message={notice} />
          </View>
        ) : null}
        {issued ? (
          <CredentialPanel
            kind="reset"
            name={issued.user.firstName}
            employeeId={issued.user.employeeId}
            email={issued.user.email}
            password={issued.temporaryPassword}
          />
        ) : null}

        <HStack gap={8} wrap>
          <Button
            label="Reset password"
            variant="secondary"
            fullWidth={false}
            onPress={() => setDialog("reset")}
            testID="user-reset-credential"
          />
          {user.isActive ? (
            <Button
              label="Deactivate account"
              variant="destructive"
              fullWidth={false}
              onPress={() => setDialog("deactivate")}
              testID="user-deactivate"
            />
          ) : (
            <Button
              label="Reactivate account"
              fullWidth={false}
              onPress={() => setDialog("activate")}
              testID="user-activate"
            />
          )}
        </HStack>
        <Text variant="caption" tone="tertiary">
          Deactivation blocks sign-in and ends every session. Nothing is
          deleted.
        </Text>
      </VStack>

      <ConfirmDialog
        visible={dialog !== null}
        title={
          dialog === "reset"
            ? `Reset ${user.firstName}'s password?`
            : dialog === "activate"
              ? `Reactivate ${user.fullName}?`
              : `Deactivate ${user.fullName}?`
        }
        message={
          dialog === "reset"
            ? "Their current password stops working, every device they are signed in on is signed out, and they must choose a new password at next sign-in. The new temporary password is shown once."
            : dialog === "activate"
              ? "They can sign in again with their existing password, and any lockout from failed attempts is cleared."
              : "They are signed out of every device straight away and cannot sign in until reactivated. Everything they recorded is kept."
        }
        confirmLabel={
          dialog === "reset"
            ? "Yes, issue a new password"
            : dialog === "activate"
              ? "Yes, reactivate"
              : "Yes, deactivate"
        }
        destructive={dialog === "deactivate"}
        loading={setActive.isPending || resetCredential.isPending}
        onConfirm={confirmDialog}
        onCancel={() => setDialog(null)}
      />
    </Card>
  );
}
