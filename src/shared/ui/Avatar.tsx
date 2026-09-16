import React from "react";
import { View, Image, StyleSheet } from "react-native";
import { palette, radius } from "../designSystem";
import { Text } from "./Text";

interface Props {
  name: string;
  uri?: string;
  size?: number;
}

/** Initials tints, picked by hashing the name so a person keeps the same colour on every screen. */
const TINTS = [
  palette.clinical[100],
  palette.teal[100],
  "#EEEBFA",
  "#FDF2DC",
  "#FCEAE8",
  palette.ink[100],
];

export function Avatar({ name, uri, size = 36 }: Props) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: radius.full }}
        accessibilityLabel={name}
      />
    );
  }

  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 1000;
  const tint = TINTS[hash % TINTS.length];

  return (
    <View
      accessibilityLabel={name}
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: radius.full, backgroundColor: tint },
      ]}
    >
      <Text variant="label" weight="600" tone="secondary" style={{ fontSize: size * 0.38 }}>
        {initials || "?"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
});
