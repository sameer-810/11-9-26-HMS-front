import React, { useState } from "react";
import { View } from "react-native";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LogOut } from "lucide-react-native";

import { palette } from "@shared/designSystem";
import { ROLE_LABELS } from "@shared/permissions";
import { useAuthStore, type AuthUser } from "@shared/store/useAuthStore";
import {
  Screen,
  Text,
  VStack,
  HStack,
  Card,
  SectionHeader,
  Button,
  Banner,
  Avatar,
  Skeleton,
} from "@shared/ui";
import { ControlledTextField } from "@shared/form/ControlledTextField";
import { apiErrorMessage } from "@api/apiClient";
import { formatDateTime } from "@shared/format";
import { useChangePassword, useMe } from "@modules/auth/hooks/useAuth";
import { changePasswordSchema, type ChangePasswordForm } from "@modules/auth/auth.validation";

/** The signed-in user's own account. Read-only except the password (role etc. are admin-managed). */
export default function ProfileScreen() {
  const stored = useAuthStore((s) => s.user);
  const hospital = useAuthStore((s) => s.hospital);
  const logout = useAuthStore((s) => s.logout);
  const me = useMe();

  // Prefer /auth/me: fresher than the persisted copy and includes lastLoginAt.
  const user = (me.data?.user ?? stored) as (AuthUser & { lastLoginAt?: string | null }) | null;

  if (!user) {
    return (
      <Screen title="My profile" testID="profile-screen">
        <Skeleton height={160} />
      </Screen>
    );
  }

  return (
    <Screen
      overline="Workspace"
      title="My profile"
      refreshing={me.isRefetching}
      onRefresh={() => me.refetch()}
      testID="profile-screen"
    >
      <VStack gap={14} style={{ maxWidth: 720 }}>
        <Card testID="profile-details">
          <HStack gap={14} align="center" wrap>
            <Avatar name={user.fullName} uri={user.avatarUrl || undefined} size={56} />
            <VStack gap={2} style={{ flex: 1, minWidth: 200 }}>
              <Text variant="h1" testID="profile-name">
                {user.fullName}
              </Text>
              <Text variant="body-sm" tone="secondary" testID="profile-role">
                {ROLE_LABELS[user.role] ?? user.role}
                {user.designation ? ` · ${user.designation}` : ""}
              </Text>
            </VStack>
          </HStack>
          <VStack gap={8} style={{ marginTop: 16 }}>
            <Detail label="Employee ID" value={user.employeeId} testID="profile-employee-id" />
            <Detail label="Department" value={user.departmentName || "No department"} testID="profile-department" />
            <Detail label="Email" value={user.email} testID="profile-email" />
            {user.phone ? <Detail label="Mobile" value={user.phone} testID="profile-phone" /> : null}
            {hospital ? <Detail label="Hospital" value={hospital.name} testID="profile-hospital" /> : null}
            {user.lastLoginAt ? (
              <Detail label="Signed in" value={formatDateTime(user.lastLoginAt)} testID="profile-last-login" />
            ) : null}
          </VStack>
          <Text variant="caption" tone="tertiary" style={{ marginTop: 12 }}>
            Your name, role and department are managed by your administrator.
          </Text>
        </Card>

        <ChangePasswordCard email={user.email} />

        <Card>
          <SectionHeader title="Sign out" subtitle="Ends the session on this device only." />
          <Button
            label="Sign out"
            variant="secondary"
            fullWidth={false}
            icon={<LogOut size={15} color={palette.text.primary} strokeWidth={2} />}
            onPress={() => logout()}
            testID="profile-sign-out"
          />
        </Card>
      </VStack>
    </Screen>
  );
}

function Detail({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <HStack gap={12} align="flex-start" wrap>
      <Text variant="label" tone="tertiary" style={{ width: 120 }}>
        {label}
      </Text>
      <Text variant="body" style={{ flex: 1, minWidth: 180 }} selectable testID={testID}>
        {value}
      </Text>
    </HStack>
  );
}

function ChangePasswordCard({ email }: { email: string }) {
  const changePassword = useChangePassword();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const { control, handleSubmit, reset } = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordSchema),
    mode: "onTouched",
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const submit = handleSubmit(async (values) => {
    setError(null);
    setDone(false);
    try {
      await changePassword.mutateAsync({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      reset();
      setDone(true);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not change your password"));
    }
  });

  return (
    <Card testID="profile-password">
      <SectionHeader title="Change password" subtitle={`For ${email}`} />
      <VStack gap={14}>
        {done ? (
          <View testID="profile-change-success">
            <Banner tone="success" message="Your password has been changed. Other devices have been signed out." />
          </View>
        ) : null}
        {error ? (
          <View testID="profile-change-error">
            <Banner tone="danger" message={error} onDismiss={() => setError(null)} />
          </View>
        ) : null}
        <ControlledTextField
          control={control}
          name="currentPassword"
          label="Current password"
          secureTextEntry
          autoComplete="current-password"
          testID="profile-current-password"
        />
        <ControlledTextField
          control={control}
          name="newPassword"
          label="New password"
          secureTextEntry
          autoComplete="new-password"
          hint="At least 10 characters. Longer is better than complicated."
          testID="profile-new-password"
        />
        <ControlledTextField
          control={control}
          name="confirmPassword"
          label="Confirm new password"
          secureTextEntry
          autoComplete="new-password"
          onSubmitEditing={submit}
          returnKeyType="go"
          testID="profile-confirm-password"
        />
        <Button
          label="Change password"
          fullWidth={false}
          onPress={submit}
          loading={changePassword.isPending}
          testID="profile-change-submit"
        />
        <Text variant="caption" tone="tertiary">
          Changing your password signs you out of every other device.
        </Text>
      </VStack>
    </Card>
  );
}
