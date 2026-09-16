import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { X } from "lucide-react-native";

import { palette, radius } from "@shared/designSystem";
import { Button, HStack, Text, TextField, VStack } from "@shared/ui";

interface Props {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  max: number;
  maxLength: number;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  testID: string;
}

/**
 * A short list typed one entry at a time. Enter, "Add" or leaving the field commits the entry;
 * a pasted comma-separated list is split. Duplicates are ignored, whatever their case.
 */
export function ListInput({
  label,
  values,
  onChange,
  max,
  maxLength,
  placeholder,
  hint,
  error,
  required,
  testID,
}: Props) {
  const [draft, setDraft] = useState("");
  const full = values.length >= max;

  const commit = () => {
    const incoming = draft
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (incoming.length === 0) return;
    const next = [...values];
    for (const v of incoming) {
      if (next.length >= max) break;
      if (!next.some((x) => x.toLowerCase() === v.toLowerCase()))
        next.push(v.slice(0, maxLength));
    }
    onChange(next);
    setDraft("");
  };

  return (
    <VStack gap={8} testID={testID}>
      <HStack gap={8} align="flex-end" wrap>
        <TextField
          label={label}
          required={required}
          placeholder={full ? `Up to ${max}` : placeholder}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={commit}
          // So an entry typed but never added is not lost when the form is saved.
          onBlur={commit}
          editable={!full}
          maxLength={maxLength * 3}
          error={error}
          hint={hint}
          containerStyle={{ flex: 1, minWidth: 220 }}
          testID={`${testID}-input`}
        />
        <Button
          label="Add"
          variant="secondary"
          size="sm"
          fullWidth={false}
          disabled={full || draft.trim() === ""}
          accessibilityHint={`Add to ${label.toLowerCase()}`}
          onPress={commit}
          // Keeps the button level with the field when a hint or error sits beneath it.
          style={hint || error ? { marginBottom: 22 } : undefined}
          testID={`${testID}-add`}
        />
      </HStack>
      {values.length ? (
        <HStack gap={6} wrap>
          {values.map((v) => (
            <View key={v} style={styles.chip}>
              <Text variant="label-sm" tone="primary">
                {v}
              </Text>
              <Pressable
                onPress={() => onChange(values.filter((x) => x !== v))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${v}`}
                testID={`${testID}-remove-${v}`}
              >
                <X size={13} color={palette.text.tertiary} strokeWidth={2.2} />
              </Pressable>
            </View>
          ))}
        </HStack>
      ) : null}
    </VStack>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingLeft: 10,
    paddingRight: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border.default,
    backgroundColor: palette.surface.secondary,
  },
});
