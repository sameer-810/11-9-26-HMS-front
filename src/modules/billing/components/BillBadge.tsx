import React from "react";
import { View, StyleSheet } from "react-native";

import { palette, radius } from "@shared/designSystem";
import { Text } from "@shared/ui";

/** Something on a bill that needs a person: a decision waiting, money owed back. */
export function BillBadge({ label, testID }: { label: string; testID?: string }) {
  return (
    <View style={styles.badge} testID={testID}>
      <Text variant="label-sm" style={{ color: palette.warning.text }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-end",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.warning.border,
    backgroundColor: palette.warning.bg,
  },
});
