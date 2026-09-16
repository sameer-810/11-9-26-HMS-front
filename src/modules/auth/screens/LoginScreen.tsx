import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LinearGradient } from "expo-linear-gradient";
import { Hospital, UserRound, Lock } from "lucide-react-native";

import { palette, radius, layout, gradients } from "@shared/designSystem";
import { Text, VStack, HStack, Button, Banner, Card, Select } from "@shared/ui";
import { ControlledTextField } from "@shared/form/ControlledTextField";
import { apiErrorCode, apiErrorMessage } from "@api/apiClient";
import { useLogin, useHospitalsForEmail } from "@modules/auth/hooks/useAuth";
import { loginSchema, type LoginForm } from "@modules/auth/auth.validation";
import type { HospitalChoice } from "@modules/auth/api/authApi";
import { useSessionNotice } from "@shared/session/sessionNotice";

export default function LoginScreen({ navigation }: { navigation?: any }) {
  const { width } = useWindowDimensions();
  const isWide = width >= layout.wideBreakpoint;

  const login = useLogin();
  const lookupHospitals = useHospitalsForEmail();

  /**
   * Shown when one person has accounts at several hospitals; the server never guesses which,
   * since the wrong hospital's patient list would be a breach.
   */
  const [hospitals, setHospitals] = useState<HospitalChoice[] | null>(null);
  const [hospitalId, setHospitalId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const notice = useSessionNotice((s) => s.notice);
  const clearNotice = useSessionNotice((s) => s.setNotice);

  const { control, handleSubmit, getValues } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    mode: "onTouched",
    defaultValues: { identifier: "", password: "" },
  });

  const submit = handleSubmit(async (values) => {
    setError(null);
    clearNotice(null);
    try {
      await login.mutateAsync({
        ...values,
        hospitalId: hospitalId ?? undefined,
      });
    } catch (err) {
      if (apiErrorCode(err) === "HOSPITAL_SELECTION_REQUIRED") {
        const list = await lookupHospitals
          .mutateAsync({
            identifier: getValues("identifier"),
            password: getValues("password"),
          })
          .catch(() => []);
        setHospitals(list);
        setError(
          "You have an account at more than one hospital. Choose which one.",
        );
        return;
      }
      setError(apiErrorMessage(err, "Could not sign you in"));
    }
  });

  const busy = login.isPending || lookupHospitals.isPending;

  return (
    <View style={styles.root} role="main">
      {isWide ? (
        <LinearGradient colors={[...gradients.hero]} style={styles.hero}>
          <VStack gap={14} style={{ maxWidth: 400 }}>
            <View style={styles.heroMark}>
              <Hospital size={26} color="#FFFFFF" strokeWidth={2.2} />
            </View>
            <Text variant="display" style={{ color: "#FFFFFF" }}>
              One patient, one record
            </Text>
            <Text variant="body-lg" style={{ color: "rgba(255,255,255,0.85)" }}>
              Reception, consultation, wards, laboratory, pharmacy and billing
              on one connected platform.
            </Text>
          </VStack>
        </LinearGradient>
      ) : null}

      <ScrollView
        style={styles.pane}
        contentContainerStyle={styles.paneContent}
        keyboardShouldPersistTaps="handled"
      >
        <VStack gap={20} style={{ width: "100%", maxWidth: 380 }}>
          {!isWide ? (
            <HStack gap={10} align="center">
              <View style={styles.mark}>
                <Hospital
                  size={20}
                  color={palette.clinical[700]}
                  strokeWidth={2.2}
                />
              </View>
              <Text variant="h1" tone="primary">
                HMS
              </Text>
            </HStack>
          ) : null}

          <VStack gap={4}>
            <Text variant="display-sm" tone="primary" heading={1}>
              Sign in
            </Text>
            <Text variant="body-sm" tone="tertiary">
              Use the credentials issued by your hospital administrator.
            </Text>
          </VStack>

          {notice ? (
            <View testID="login-session-notice">
              <Banner
                tone="info"
                title="Signed out"
                message={notice}
                onDismiss={() => clearNotice(null)}
              />
            </View>
          ) : null}
          {error ? (
            <Banner
              tone="danger"
              message={error}
              onDismiss={() => setError(null)}
            />
          ) : null}

          <VStack gap={14}>
            <ControlledTextField
              control={control}
              name="identifier"
              label="Email or employee ID"
              placeholder="you@hospital.in or your staff ID"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              testID="login-email"
              leading={
                <UserRound
                  size={16}
                  color={palette.text.tertiary}
                  strokeWidth={1.9}
                />
              }
            />
            <ControlledTextField
              control={control}
              name="password"
              label="Password"
              placeholder="Your password"
              secureTextEntry
              autoComplete="current-password"
              testID="login-password"
              onSubmitEditing={submit}
              returnKeyType="go"
              leading={
                <Lock
                  size={16}
                  color={palette.text.tertiary}
                  strokeWidth={1.9}
                />
              }
            />

            {hospitals && hospitals.length > 1 ? (
              <Select
                label="Hospital"
                required
                value={hospitalId}
                onChange={setHospitalId}
                placeholder="Choose a hospital"
                options={hospitals.map((h) => ({
                  value: h.hospitalId,
                  label: h.hospitalName,
                  sublabel: h.hospitalCode,
                }))}
              />
            ) : null}

            <Button
              label="Sign in"
              onPress={submit}
              loading={busy}
              testID="login-submit"
            />

            <Button
              label="Forgot your password?"
              variant="ghost"
              size="sm"
              onPress={() => navigation?.navigate?.("ForgotPassword")}
            />
          </VStack>

          <Card compact>
            <Text variant="caption" tone="tertiary">
              Everything you do is recorded against your account. Do not share
              it, and do not sign in on behalf of a colleague.
            </Text>
          </Card>
        </VStack>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: palette.surface.secondary,
  },
  hero: { flex: 1, padding: 48, justifyContent: "center" },
  heroMark: {
    width: 52,
    height: 52,
    borderRadius: radius.xl,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  pane: { flex: 1, backgroundColor: palette.surface.primary },
  paneContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  mark: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: palette.clinical[50],
    alignItems: "center",
    justifyContent: "center",
  },
});
