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
 * The shared ChipsRow, with a test handle on every chip.
 *
 * ChipsRow takes no per-chip testID, and this module is not allowed to change
 * shared UI. So each chip is drawn as its own one-chip ChipsRow inside a
 * wrapper that carries the ID. The look, the tab role and the selected state
 * all still come from the shared component, so the tabs cannot drift from
 * every other chip row in the app.
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
