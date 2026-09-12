import React, { useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, ArrowLeft } from "lucide-react-native";

import { palette, radius } from "@shared/designSystem";
import { Text, VStack, HStack, Button, Banner } from "@shared/ui";
import { ControlledTextField } from "@shared/form/ControlledTextField";
import { apiErrorMessage } from "@api/apiClient";
import { useForgotPassword, useResetPassword } from "@modules/auth/hooks/useAuth";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  type ForgotPasswordForm,
  type ResetPasswordForm,
} from "@modules/auth/auth.validation";

/**
 * Request a code, then use it. Two steps, one screen.
 *
 * Kept together because the second step needs the email from the first, and
 * splitting them across routes means either passing it through navigation state
 * or asking for it twice. The user has just typed it; asking again reads as the
 * system having lost track.
 */
export default function ForgotPasswordScreen({ navigation }: { navigation?: any }) {
  const [stage, setStage] = useState<"request" | "reset">("request");
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const forgot = useForgotPassword();
  const reset = useResetPassword();

  const requestForm = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: "onTouched",
    defaultValues: { email: "" },
  });

  const resetForm = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
    mode: "onTouched",
    defaultValues: { email: "", code: "", newPassword: "", confirmPassword: "" },
  });

  const submitRequest = requestForm.handleSubmit(async (values) => {
    setError(null);
    try {
      const res = await forgot.mutateAsync({ email: values.email });
      setEmail(values.email);
      resetForm.setValue("email", values.email);
      // The server's wording is deliberately non-committal about whether the
      // address exists. Passing it through unchanged keeps that property.
      setNotice(res.message);
      setStage("reset");
    } catch (err) {
      setError(apiErrorMessage(err, "Could not send a reset code"));
    }
  });

  const submitReset = resetForm.handleSubmit(async (values) => {
    setError(null);
    try {
      await reset.mutateAsync({
        email: values.email,
        code: values.code,
        newPassword: values.newPassword,
      });
      setNotice("Password reset. Sign in with your new password.");
      setStage("request");
      requestForm.reset();
      resetForm.reset();
      navigation?.navigate?.("Login");
    } catch (err) {
      setError(apiErrorMessage(err, "Could not reset your password"));
    }
  });

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <VStack gap={20} style={{ width: "100%", maxWidth: 400 }}>
        <HStack gap={12} align="center">
          <View style={styles.mark}>
            <Mail size={20} color={palette.clinical[700]} strokeWidth={2.2} />
          </View>
          <VStack gap={2} flex={1}>
            <Text variant="h1" tone="primary">
              {stage === "request" ? "Reset your password" : "Enter your code"}
            </Text>
            <Text variant="body-sm" tone="tertiary">
              {stage === "request"
                ? "We will email you a 6-digit code."
                : `Sent to ${email}. It expires in 15 minutes.`}
            </Text>
          </VStack>
        </HStack>

        {notice ? <Banner tone="info" message={notice} onDismiss={() => setNotice(null)} /> : null}
        {error ? <Banner tone="danger" message={error} onDismiss={() => setError(null)} /> : null}

        {stage === "request" ? (
          <VStack gap={14}>
            <ControlledTextField
              control={requestForm.control}
              name="email"
              label="Email"
              placeholder="you@hospital.in"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              onSubmitEditing={submitRequest}
              returnKeyType="go"
            />
            <Button label="Send code" onPress={submitRequest} loading={forgot.isPending} />
          </VStack>
        ) : (
          <VStack gap={14}>
            <ControlledTextField
              control={resetForm.control}
              name="code"
              label="6-digit code"
              placeholder="000000"
              numericField
              maxLength={6}
              autoComplete="one-time-code"
            />
            <ControlledTextField
              control={resetForm.control}
              name="newPassword"
              label="New password"
              secureTextEntry
              autoComplete="new-password"
              hint="At least 10 characters."
            />
            <ControlledTextField
              control={resetForm.control}
              name="confirmPassword"
              label="Confirm new password"
              secureTextEntry
              autoComplete="new-password"
              onSubmitEditing={submitReset}
              returnKeyType="go"
            />
            <Button label="Reset password" onPress={submitReset} loading={reset.isPending} />
            <Button
              label="Use a different email"
              variant="ghost"
              size="sm"
              onPress={() => {
                setStage("request");
                setError(null);
              }}
            />
          </VStack>
        )}

        <Button
          label="Back to sign in"
          variant="ghost"
          size="sm"
          icon={<ArrowLeft size={15} color={palette.text.accent} strokeWidth={2} />}
          onPress={() => navigation?.navigate?.("Login")}
        />
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
