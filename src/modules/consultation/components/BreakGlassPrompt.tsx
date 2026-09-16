import React, { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Lock, ShieldAlert } from "lucide-react-native";

import { palette, radius, signal } from "@shared/designSystem";
import {
  Card,
  Text,
  VStack,
  HStack,
  Button,
  TextField,
  ChipsRow,
  Banner,
} from "@shared/ui";
import { apiErrorMessage } from "@api/apiClient";
import { useBreakGlass } from "@modules/consultation/hooks/useConsultation";
import type { RestrictedDetails } from "@modules/consultation/types";

/** Mirrors the server's minimum reason length. */
const MIN_REASON = 20;

/**
 * Break-the-glass prompt for a restricted record: reason, time limit, logging and review
 * are all stated before the button, as a deterrent.
 */
export function BreakGlassPrompt({
  patientId,
  details,
  compact = false,
}: {
  patientId: string;
  details: RestrictedDetails;
  compact?: boolean;
}) {
  const [category, setCategory] = useState("emergency_treatment");
  const [reason, setReason] = useState("");
  const breakGlass = useBreakGlass(patientId);

  const chips = Object.entries(details.categories).map(([key, label]) => ({
    key,
    label,
  }));
  const length = reason.trim().length;

  return (
    <Card accentColor={signal.critical.color} testID="record-restricted">
      <VStack gap={compact ? 10 : 14}>
        <HStack gap={10} align="center">
          <View style={styles.lock}>
            <Lock size={18} color={signal.critical.text} strokeWidth={2.2} />
          </View>
          <VStack gap={2} flex={1}>
            <Text variant="label-lg" tone="primary">
              Restricted record
            </Text>
            <Text variant="body-sm" tone="secondary">
              This record is open only to the patient&apos;s treating team.
            </Text>
          </VStack>
        </HStack>

        {!details.canBreakGlass ? (
          // Non-clinical roles never read clinical records, so break-glass is unavailable.
          <Text
            variant="body-sm"
            tone="secondary"
            testID="breakglass-unavailable"
          >
            Your role does not include clinical records, so emergency access is
            not available to you.
          </Text>
        ) : (
          <>
            <View style={styles.warning}>
              <HStack gap={8} align="center">
                <ShieldAlert
                  size={15}
                  color={signal.critical.text}
                  strokeWidth={2.3}
                />
                <Text
                  variant="label"
                  weight="600"
                  style={{ color: signal.critical.text }}
                >
                  Emergency access is logged and reviewed
                </Text>
              </HStack>
              <Text variant="body-sm" style={{ color: signal.critical.text }}>
                You will see the record for {details.minutes} minutes, with the
                same view your role always has. Every page you open is recorded
                with your reason, the administrator is alerted now, and the
                access is reviewed afterwards.
              </Text>
            </View>

            <VStack gap={6}>
              <Text variant="label-sm" tone="tertiary">
                Why do you need it?
              </Text>
              <ChipsRow
                chips={chips}
                active={category}
                onChange={setCategory}
              />
            </VStack>

            <TextField
              label="Reason"
              required
              multiline
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. Brought in unconscious, need allergies and current medication before treatment"
              hint={
                length < MIN_REASON
                  ? `At least ${MIN_REASON} characters — ${MIN_REASON - length} to go`
                  : "The reviewer will read this"
              }
              testID="breakglass-reason"
            />

            {breakGlass.isError ? (
              <Banner
                tone="danger"
                message={apiErrorMessage(
                  breakGlass.error,
                  "Emergency access was refused",
                )}
              />
            ) : null}

            <HStack gap={10} align="center" wrap>
              <Button
                label="Break the glass"
                variant="critical"
                icon={
                  <ShieldAlert
                    size={15}
                    color={palette.text.inverse}
                    strokeWidth={2.3}
                  />
                }
                disabled={length < MIN_REASON}
                loading={breakGlass.isPending}
                onPress={() =>
                  breakGlass.mutate({ category, reason: reason.trim() })
                }
                testID="breakglass-submit"
              />
            </HStack>
          </>
        )}
      </VStack>
    </Card>
  );
}

/** Banner with minutes left on a break-glass grant; calls onExpired at zero so the record refetches. */
export function EmergencyAccessBanner({
  expiresAt,
  onExpired,
}: {
  expiresAt: string;
  onExpired?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const minutesLeft = Math.max(
    0,
    Math.ceil((new Date(expiresAt).getTime() - now) / 60_000),
  );
  useEffect(() => {
    if (minutesLeft === 0) onExpired?.();
  }, [minutesLeft, onExpired]);

  return (
    <View testID="breakglass-active">
      <Banner
        tone="danger"
        title="Emergency access"
        message={`You are reading a restricted record under break-the-glass. Every view is logged and will be reviewed. Access ends in ${minutesLeft} min.`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  lock: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: signal.critical.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  warning: {
    padding: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: signal.critical.border,
    backgroundColor: signal.critical.bg,
    gap: 4,
  },
});
