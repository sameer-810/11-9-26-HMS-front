import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Users, ChevronRight } from "lucide-react-native";

import { palette, radius, signal } from "@shared/designSystem";
import { Text, VStack, HStack } from "@shared/ui";
import type { DuplicateMatch } from "@modules/patient/types";

interface Props {
  matches: DuplicateMatch[];
  mustConfirm: boolean;
  onOpenExisting?: (match: DuplicateMatch) => void;
}

/**
 * possible duplicates with their reasons (not a score), each openable to use the existing record.
 * deliberately not a modal: a blocking dialog mid-form trains people to dismiss it unread.
 */
export function DuplicateWarning({ matches, mustConfirm, onOpenExisting }: Props) {
  if (matches.length === 0) return null;

  const tone = mustConfirm ? signal.critical : signal.caution;

  return (
    <View
      style={[styles.wrap, { backgroundColor: tone.bg, borderColor: tone.border }]}
      accessibilityRole="alert"
      testID="duplicate-warning"
    >
      <HStack gap={9} align="flex-start">
        <Users size={17} color={tone.color} strokeWidth={2.2} style={{ marginTop: 1 }} />
        <VStack gap={3} flex={1}>
          <Text variant="label" weight="600" style={{ color: tone.text }}>
            {mustConfirm
              ? matches.length === 1
                ? "This looks like someone already registered"
                : "These people are already registered"
              : "Similar records already exist"}
          </Text>
          <Text variant="body-sm" style={{ color: tone.text }}>
            {mustConfirm
              ? "Open the existing record instead of creating a second one. Two records for one person split their history, and the half you are not looking at is the half with the allergy."
              : "Check none of these is the same person."}
          </Text>
        </VStack>
      </HStack>

      <VStack gap={6} style={{ marginTop: 10 }}>
        {matches.map((m) => (
          <Pressable
            key={m.id}
            onPress={onOpenExisting ? () => onOpenExisting(m) : undefined}
            accessibilityRole={onOpenExisting ? "button" : undefined}
            accessibilityLabel={`${m.fullName}, ${m.patientId}. ${m.reasons.join(". ")}`}
            style={({ pressed }) => [styles.match, pressed ? { opacity: 0.75 } : null]}
          >
            <VStack gap={2} flex={1}>
              <HStack gap={7} align="center" wrap>
                <Text variant="label" tone="primary">
                  {m.fullName}
                </Text>
                <Text variant="label-sm" tone="tertiary" tabular>
                  {m.patientId}
                </Text>
                <Text variant="label-sm" tone="tertiary">
                  {m.age} · {m.gender}
                </Text>
              </HStack>
              
              <Text variant="caption" style={{ color: tone.text }}>
                {m.reasons.join(" · ")}
              </Text>
            </VStack>
            {onOpenExisting ? (
              <ChevronRight size={15} color={palette.text.tertiary} strokeWidth={2} />
            ) : null}
          </Pressable>
        ))}
      </VStack>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.md, borderWidth: 1, padding: 12 },
  match: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: palette.surface.primary,
    borderWidth: 1,
    borderColor: palette.border.default,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
});
