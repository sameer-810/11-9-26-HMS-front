import React from "react";
import { View, StyleSheet } from "react-native";
import { Check } from "lucide-react-native";
import { palette, radius, signal } from "@shared/designSystem";
import { Text, HStack, VStack } from "@shared/ui";
import { formatTimeOnly } from "@shared/format";
import { LAB_STAGES, LAB_STAGE_LABELS, type LabOrder } from "@modules/laboratory/types";

/**
 * LB-03, drawn.
 *
 * Every completed stage shows who did it and when. That is the chain of
 * custody, and it is the first thing asked after a wrong-blood-in-tube
 * incident — so it is on the screen, not buried in an audit log.
 */
export function StageStepper({ order }: { order: LabOrder }) {
  if (order.status === "cancelled") {
    return (
      <View style={[styles.cancelled]} testID="stage-cancelled">
        <Text variant="label" style={{ color: signal.caution.text }}>
          Cancelled by {order.cancelledByName}
        </Text>
        <Text variant="caption" tone="secondary">
          {order.cancelReason}
        </Text>
      </View>
    );
  }

  const current = LAB_STAGES.indexOf(order.status as (typeof LAB_STAGES)[number]);
  const eventFor = (stage: string) => [...order.stageHistory].reverse().find((e) => e.to === stage);

  return (
    <HStack gap={0} wrap testID="stage-stepper">
      {LAB_STAGES.map((stage, i) => {
        const done = i < current || (i === current && stage === "reported");
        const active = i === current && stage !== "reported";
        const event = i <= current ? eventFor(stage) : undefined;
        return (
          <View key={stage} style={styles.step} accessibilityLabel={`${LAB_STAGE_LABELS[stage]}${done ? ", done" : active ? ", current" : ""}`}>
            <HStack gap={6} align="center">
              <View
                style={[
                  styles.dot,
                  done ? styles.dotDone : active ? styles.dotActive : null,
                ]}
              >
                {done ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : (
                  <Text variant="caption" style={{ color: active ? "#FFFFFF" : palette.text.tertiary }}>
                    {i + 1}
                  </Text>
                )}
              </View>
              <VStack gap={0}>
                <Text variant="label-sm" tone={i <= current ? "primary" : "tertiary"}>
                  {LAB_STAGE_LABELS[stage]}
                </Text>
                {event ? (
                  <Text variant="caption" tone="tertiary">
                    {formatTimeOnly(event.at)} · {event.byName}
                  </Text>
                ) : null}
              </VStack>
            </HStack>
          </View>
        );
      })}
    </HStack>
  );
}

const styles = StyleSheet.create({
  step: { paddingVertical: 6, paddingRight: 16, minWidth: 150 },
  dot: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.border.strong,
    backgroundColor: palette.surface.raised,
  },
  dotDone: { backgroundColor: signal.normal.color, borderColor: signal.normal.color },
  dotActive: { backgroundColor: palette.text.accent, borderColor: palette.text.accent },
  cancelled: {
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: signal.caution.border,
    backgroundColor: signal.caution.bg,
    gap: 2,
  },
});
