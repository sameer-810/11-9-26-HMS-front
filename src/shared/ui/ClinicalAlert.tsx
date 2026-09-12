import React, { useState } from "react";
import { Modal, StyleSheet, View, TextInput, ScrollView } from "react-native";
import { OctagonAlert, TriangleAlert, Info, CircleCheck } from "lucide-react-native";
import { signal, alertTier, palette, radius, shadows, type SignalLevel } from "../designSystem";
import { Text } from "./Text";
import { HStack, VStack } from "./Stack";
import { Button } from "./Button";

/**
 * The tiered clinical alert.
 *
 * Every interrupting alert in this application goes through here, so the rules
 * live in one place and stay enforceable:
 *
 *   - Interruptiveness matches the tier. `critical` blocks; `urgent` asks for an
 *     acknowledgement inline; `caution` and `normal` never interrupt at all.
 *     A low-value alert that blocks the screen is how a hospital trains its
 *     staff to dismiss alerts without reading them, and once that habit forms
 *     the important alert is dismissed too.
 *   - Title is short and sentence case. ALL CAPS measurably slows reading and
 *     these are the sentences nobody can afford to read slowly.
 *   - Body is capped at roughly 30 words. Longer alerts are not read.
 *   - The recommended action is the primary button; the override is secondary.
 *     Deliberate friction — the safe path should be the easy one.
 *   - Overriding a critical alert requires a typed reason. It forces a moment of
 *     thought, and it leaves the clinical reasoning in the record where the next
 *     person can see it.
 *
 * Anything wanting to bypass this has to justify it here rather than quietly in
 * a screen, which is the point.
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

  const s = signal[level];
  const tier = alertTier[level];
  const Icon = ICONS[level];
  const needsReason = tier.requireReason;

  // A non-blocking tier has no business rendering a modal. If a caller asks for
  // one, that is a bug in the caller — render nothing rather than teach staff
  // that a caution-level finding is worth stopping for.
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
      animationType="fade"
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
                {/* Sentence case, short. Never uppercased in code. */}
                <Text variant="h2" tone="primary">
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

            {/* The safe action is primary and sits on the right, where the
                confirming tap lands. The override is quieter on purpose. */}
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

/** Unused export kept alongside so callers can reason about tiers without importing the token file. */
export { alertTier };
