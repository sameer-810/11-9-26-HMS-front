import React from "react";
import { View } from "react-native";

import { ChipsRow, type Chip } from "@shared/ui";

interface Props {
  chips: Chip[];
  active: string;
  onChange: (key: string) => void;
  /** Each chip is reachable as `${testIDPrefix}-${key}`. */
  testIDPrefix: string;
}

/**
 * Shared ChipsRow with a testID per chip. ChipsRow has no per-chip testID, so each chip is a
 * one-chip ChipsRow inside a wrapper that carries the ID.
 */
export function TabChips({ chips, active, onChange, testIDPrefix }: Props) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} testID={`${testIDPrefix}s`}>
      {chips.map((chip) => (
        <View key={chip.key} testID={`${testIDPrefix}-${chip.key}`}>
          <ChipsRow chips={[chip]} active={active} onChange={onChange} />
        </View>
      ))}
    </View>
  );
}
