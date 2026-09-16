import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { CalendarX } from "lucide-react-native";

import { palette, radius, layout } from "../designSystem";
import { Text } from "./Text";
import { VStack, HStack } from "./Stack";

export interface GridSlot {
  time: string;
  available: boolean;
  unavailableReason: string | null;
  capacity: number;
  booked: number;
  remaining: number;
  isExtra?: boolean;
}

interface Props {
  slots: GridSlot[];
  value: string | null;
  onChange: (time: string) => void;
  /** Shown in place of the grid when the day is closed outright. */
  unavailableReason?: string | null;
  testID?: string;
}

/** Appointment slot grid. Unavailable slots are shown disabled with their reason, never hidden. */
export function SlotGrid({ slots, value, onChange, unavailableReason, testID }: Props) {
  if (slots.length === 0) {
    return (
      <View style={styles.empty} testID={testID}>
        <VStack gap={8} align="center">
          <CalendarX size={20} color={palette.text.tertiary} strokeWidth={1.8} />
          <Text variant="label" tone="secondary" center>
            {unavailableReason || "No clinic on this day"}
          </Text>
          <Text variant="caption" tone="tertiary" center>
            Try another date, or a different doctor.
          </Text>
        </VStack>
      </View>
    );
  }

  return (
    <VStack gap={10} testID={testID}>
      <HStack gap={8} wrap>
        {slots.map((s) => {
          const selected = value === s.time;
          const partiallyBooked = s.available && s.capacity > 1 && s.booked > 0;

          return (
            <Pressable
              key={s.time}
              onPress={() => s.available && onChange(s.time)}
              disabled={!s.available}
              accessibilityRole="button"
              accessibilityState={{ disabled: !s.available, selected }}
              accessibilityLabel={
                s.available
                  ? s.capacity > 1
                    ? `${s.time}, ${s.remaining} of ${s.capacity} places left`
                    : s.time
                  : `${s.time}, unavailable, ${s.unavailableReason}`
              }
              testID={`slot-${s.time}`}
              style={({ pressed }) => [
                styles.slot,
                s.available ? styles.slotFree : styles.slotTaken,
                selected ? styles.slotSelected : null,
                pressed && s.available ? { opacity: 0.75 } : null,
              ]}
            >
              <Text
                variant="label"
                weight={selected ? "600" : "500"}
                tabular
                style={{
                  color: selected
                    ? "#FFFFFF"
                    : s.available
                      ? palette.text.primary
                      : palette.text.disabled,
                }}
              >
                {s.time}
              </Text>

              { /* Why it cannot be picked. */ }
              {!s.available ? (
                <Text variant="caption" numberOfLines={1} style={{ color: palette.text.disabled }}>
                  {s.unavailableReason}
                </Text>
              ) : partiallyBooked ? (
                <Text
                  variant="caption"
                  tabular
                  style={{ color: selected ? "rgba(255,255,255,0.85)" : palette.text.tertiary }}
                >
                  {s.remaining} left
                </Text>
              ) : s.isExtra ? (
                <Text
                  variant="caption"
                  style={{ color: selected ? "rgba(255,255,255,0.85)" : palette.text.tertiary }}
                >
                  extra
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </HStack>

      <HStack gap={14} wrap>
        <Legend color={palette.surface.primary} border={palette.border.strong} label="Free" />
        <Legend color={palette.clinical[700]} border={palette.clinical[700]} label="Selected" />
        <Legend
          color={palette.surface.tertiary}
          border={palette.border.default}
          label="Not available"
        />
      </HStack>
    </VStack>
  );
}

function Legend({ color, border, label }: { color: string; border: string; label: string }) {
  return (
    <HStack gap={6} align="center">
      <View
        style={{
          width: 12,
          height: 12,
          borderRadius: radius.xs,
          backgroundColor: color,
          borderWidth: 1,
          borderColor: border,
        }}
      />
      <Text variant="caption" tone="tertiary">
        {label}
      </Text>
    </HStack>
  );
}

const styles = StyleSheet.create({
  slot: {
    minWidth: 92,
    minHeight: layout.minTouchTarget,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  slotFree: {
    backgroundColor: palette.surface.primary,
    borderColor: palette.border.strong,
  },
  slotTaken: {
    backgroundColor: palette.surface.tertiary,
    borderColor: palette.border.default,
  },
  slotSelected: {
    backgroundColor: palette.clinical[700],
    borderColor: palette.clinical[700],
  },
  empty: {
    padding: 26,
    alignItems: "center",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: palette.border.default,
    backgroundColor: palette.surface.secondary,
  },
});
