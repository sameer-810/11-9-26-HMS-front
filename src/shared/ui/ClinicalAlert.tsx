import React, { useState } from "react";
import { Modal, StyleSheet, View, TextInput, ScrollView } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { OctagonAlert, TriangleAlert, Info, CircleCheck } from "lucide-react-native";
import { signal, alertTier, palette, radius, shadows, type SignalLevel } from "../designSystem";
import { Text } from "./Text";
import { HStack, VStack } from "./Stack";
import { Button } from "./Button";


/**
 * Tiered clinical alert; every interrupting alert goes through here. Only critical and
 * urgent tiers render; the safe action is primary and critical overrides need a reason.
 */
const ICONS = {
  critical: OctagonAlert,
  urgent: TriangleAlert,
  caution: Info,
  normal: CircleCheck,
} as const;

export interface ClinicalAlertProps {
  visible: boolean;
  level: SignalLevel;
  /** A few words. "Severe penicillin allergy", not a sentence. */
  title: string;
  /** Why it fired, the risk, and what is expected. Two or three sentences. */
  message: string;
  /** Supporting detail — the specific value, the prior reaction. */
  details?: string[];
  /** The safe action. Becomes the primary button. */
  recommendedLabel?: string;
  /** The override. Secondary styling, and on `critical` it demands a reason. */
  overrideLabel?: string;
  onRecommended: () => void;
  onOverride?: (reason: string) => void;
  loading?: boolean;
  /** Who or what raised this — shown small, for accountability. */
  source?: string;
}

const MAX_REASON = 300;
const MIN_REASON = 10;

export function ClinicalAlert({
  visible,
  level,
  title,
  message,
  details,
  recommendedLabel = "Cancel and review",
  overrideLabel = "Proceed anyway",
  onRecommended,
  onOverride,
  loading,
  source,
}: ClinicalAlertProps) {
  const [reason, setReason] = useState("");
  const [showReason, setShowReason] = useState(false);
  const reduceMotion = useReducedMotion();

  const s = signal[level];
  const tier = alertTier[level];
  const Icon = ICONS[level];
  const needsReason = tier.requireReason;

  // Lower tiers never get a modal; a caller asking for one is a bug.
  if (tier.presentation !== "blocking" && tier.presentation !== "confirm") return null;

  const reasonOk = reason.trim().length >= MIN_REASON;
  const canOverride = Boolean(onOverride) && (!needsReason || !showReason || reasonOk);

  const handleOverride = () => {
    if (!onOverride) return;
    if (needsReason && !showReason) {
      setShowReason(true);
      return;
    }
    if (needsReason && !reasonOk) return;
    onOverride(reason.trim());
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? "none" : "fade"}
      // A critical alert has no escape hatch — no backdrop tap, no back button.
      onRequestClose={tier.dismissible ? onRecommended : () => {}}
    >
      <View style={styles.overlay}>
        <View
          style={[styles.card, { borderTopColor: s.color }]}
          accessibilityViewIsModal
          accessibilityLabel={`${s.label} alert. ${title}. ${message}`}
        >
          <ScrollView bounces={false}>
            <HStack gap={10} align="center">
              <View style={[styles.iconWrap, { backgroundColor: s.bg, borderColor: s.border }]}>
                <Icon size={20} color={s.color} strokeWidth={2.4} />
              </View>
              <VStack gap={1} flex={1}>
                <Text variant="overline" style={{ color: s.text }}>
                  {s.label}
                </Text>
                { /* Sentence case, short. Never uppercased in code. */ }
                <Text variant="h2" tone="primary" heading={2}>
                  {title}
                </Text>
              </VStack>
            </HStack>

            <Text variant="body" tone="secondary" style={{ marginTop: 12 }}>
              {message}
            </Text>

            {details?.length ? (
              <View style={[styles.details, { backgroundColor: s.bg, borderColor: s.border }]}>
                {details.map((d) => (
                  <HStack key={d} gap={6} align="center">
                    <View style={[styles.bullet, { backgroundColor: s.color }]} />
                    <Text variant="body-sm" style={{ color: s.text, flex: 1 }}>
                      {d}
                    </Text>
                  </HStack>
                ))}
              </View>
            ) : null}

            {showReason ? (
              <VStack gap={6} style={{ marginTop: 14 }}>
                <Text variant="label" tone="primary">
                  Why are you overriding this?
                </Text>
                <Text variant="caption" tone="tertiary">
                  This is recorded in the patient&apos;s record with your name.
                </Text>
                <TextInput
                  value={reason}
                  onChangeText={setReason}
                  multiline
                  maxLength={MAX_REASON}
                  autoFocus
                  placeholder="e.g. Reaction was a mild rash 14 years ago; consultant approved"
                  placeholderTextColor={palette.text.disabled}
                  style={styles.reasonInput}
                  accessibilityLabel="Reason for overriding this alert"
                />
                {!reasonOk && reason.length > 0 ? (
                  <Text variant="caption" tone="danger">
                    Give a little more detail ({MIN_REASON} characters minimum).
                  </Text>
                ) : null}
              </VStack>
            ) : null}

            {source ? (
              <Text variant="caption" tone="tertiary" style={{ marginTop: 12 }}>
                {source}
              </Text>
            ) : null}

            { /* Safe action is primary, on the right; the override is deliberately quieter. */ }
            <HStack gap={10} justify="flex-end" style={{ marginTop: 18 }} wrap>
              {onOverride ? (
                <Button
                  label={showReason ? "Confirm override" : overrideLabel}
                  variant="secondary"
                  size="md"
                  fullWidth={false}
                  disabled={!canOverride || loading}
                  onPress={handleOverride}
                  hapticTone="warning"
                  accessibilityHint="Proceeds against the clinical recommendation"
                />
              ) : null}
              <Button
                label={recommendedLabel}
                variant={level === "critical" ? "critical" : "primary"}
                size="md"
                fullWidth={false}
                loading={loading}
                onPress={onRecommended}
              />
            </HStack>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(11,18,32,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "86%",
    backgroundColor: palette.surface.primary,
    borderRadius: radius.xl,
    borderTopWidth: 4,
    padding: 20,
    ...shadows.xl,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  details: {
    marginTop: 12,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 6,
  },
  bullet: { width: 4, height: 4, borderRadius: 2 },
  reasonInput: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: palette.border.default,
    borderRadius: radius.md,
    padding: 10,
    fontSize: 14,
    color: palette.text.primary,
    backgroundColor: palette.surface.secondary,
    textAlignVertical: "top",
  },
});

/** Re-exported so callers can read tiers without importing the token file. */
export { alertTier };
