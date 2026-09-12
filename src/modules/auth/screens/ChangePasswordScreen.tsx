import React, { useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, LogOut } from "lucide-react-native";

import { palette, radius } from "@shared/designSystem";
import { Text, VStack, HStack, Button, Banner, Card } from "@shared/ui";
import { ControlledTextField } from "@shared/form/ControlledTextField";
import { apiErrorMessage } from "@api/apiClient";
import { useAuthStore } from "@shared/store/useAuthStore";
import { useChangePassword } from "@modules/auth/hooks/useAuth";
import { changePasswordSchema, type ChangePasswordForm } from "@modules/auth/auth.validation";

interface Props {
  /** Set when the server is refusing everything until this is done. */
  forced?: boolean;
}

/**
 * Set a new password.
 *
 * Doubles as the forced first-login screen. When `forced`, there is no way past
 * it except completing it or signing out — matching the server, which refuses
 * every other route with PASSWORD_CHANGE_REQUIRED. A screen the user could
 * navigate away from would make the client and the server disagree about
 * whether the app is usable.
 */
export default function ChangePasswordScreen({ forced }: Props) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
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
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <VStack gap={20} style={{ width: "100%", maxWidth: 420 }}>
        <HStack gap={12} align="center">
          <View style={styles.mark}>
            <KeyRound size={20} color={palette.clinical[700]} strokeWidth={2.2} />
          </View>
          <VStack gap={2} flex={1}>
            <Text variant="h1" tone="primary">
              {forced ? "Set your password" : "Change your password"}
            </Text>
            <Text variant="body-sm" tone="tertiary">
              {forced
                ? "Your account was created with a temporary password. Choose your own to continue."
                : "Signed in as " + (user?.email ?? "")}
            </Text>
          </VStack>
        </HStack>

        {forced ? (
          <Banner
            tone="info"
            title="This is required"
            message="Everything you do in this system is recorded against your account, so it has to be a password only you know."
          />
        ) : null}

        {done ? <Banner tone="success" message="Your password has been changed." /> : null}
        {error ? <Banner tone="danger" message={error} onDismiss={() => setError(null)} /> : null}

        <VStack gap={14}>
          <ControlledTextField
            control={control}
            name="currentPassword"
            label={forced ? "Temporary password" : "Current password"}
            secureTextEntry
            autoComplete="current-password"
            testID="cp-current"
          />
          <ControlledTextField
            control={control}
            name="newPassword"
            label="New password"
            secureTextEntry
            autoComplete="new-password"
            hint="At least 10 characters. Longer is better than complicated."
            testID="cp-new"
          />
          <ControlledTextField
            control={control}
            name="confirmPassword"
            label="Confirm new password"
            secureTextEntry
            autoComplete="new-password"
            testID="cp-confirm"
            onSubmitEditing={submit}
            returnKeyType="go"
          />

          <Button
            label={forced ? "Set password and continue" : "Change password"}
            onPress={submit}
            loading={changePassword.isPending}
            testID="cp-submit"
          />
        </VStack>

        <Card compact>
          <Text variant="caption" tone="tertiary">
            Changing your password signs you out of every other device.
          </Text>
        </Card>

        {forced ? (
          // The only other way out. Someone handed the wrong credential needs a
          // route back to the login screen that is not "force-quit the app".
          <Button
            label="Sign out instead"
            variant="ghost"
            size="sm"
            icon={<LogOut size={15} color={palette.text.accent} strokeWidth={2} />}
            onPress={() => logout()}
          />
        ) : null}
      </VStack>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.surface.secondary },
  content: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  mark: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: palette.clinical[50],
    alignItems: "center",
    justifyContent: "center",
  },
});
