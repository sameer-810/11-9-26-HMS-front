import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { palette, radius, layout } from "../designSystem";
import { Text } from "./Text";
import { HStack } from "./Stack";

interface Props {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (p: number) => void;
  onLimitChange?: (l: number) => void;
  label?: string;
}

const LIMITS = [20, 50, 100];

export function Pagination({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  onLimitChange,
  label = "records",
}: Props) {
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <HStack gap={12} align="center" justify="space-between" wrap>
      <Text variant="body-sm" tone="tertiary" tabular>
        {from}–{to} of {total.toLocaleString("en-IN")} {label}
      </Text>

      <HStack gap={8} align="center">
        {onLimitChange ? (
          <HStack gap={4} align="center">
            {LIMITS.map((l) => (
              <Pressable
                key={l}
                onPress={() => onLimitChange(l)}
                accessibilityRole="button"
                accessibilityLabel={`Show ${l} per page`}
                accessibilityState={{ selected: l === limit }}
                style={[styles.limit, l === limit && styles.limitActive]}
              >
                <Text
                  variant="label-sm"
                  tabular
                  style={{ color: l === limit ? palette.clinical[700] : palette.text.tertiary }}
                >
                  {l}
                </Text>
              </Pressable>
            ))}
          </HStack>
        ) : null}

        <View style={styles.divider} />

        <Pressable
          onPress={() => onPageChange(page - 1)}
          disabled={page <= 1}
          accessibilityRole="button"
          accessibilityLabel="Previous page"
          style={[styles.nav, page <= 1 && styles.navDisabled]}
        >
          <ChevronLeft
            size={16}
            color={page <= 1 ? palette.text.disabled : palette.text.primary}
            strokeWidth={2.2}
          />
        </Pressable>

        <Text variant="label" tone="secondary" tabular>
          {page} / {totalPages}
        </Text>

        <Pressable
          onPress={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          accessibilityRole="button"
          accessibilityLabel="Next page"
          style={[styles.nav, page >= totalPages && styles.navDisabled]}
        >
          <ChevronRight
            size={16}
            color={page >= totalPages ? palette.text.disabled : palette.text.primary}
            strokeWidth={2.2}
          />
        </Pressable>
      </HStack>
    </HStack>
  );
}

const styles = StyleSheet.create({
  nav: {
    width: layout.minTouchTarget,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border.default,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface.primary,
  },
  navDisabled: { opacity: 0.45 },
  limit: {
    minWidth: 30,
    height: 26,
    paddingHorizontal: 6,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  limitActive: { backgroundColor: palette.clinical[50] },
  divider: { width: 1, height: 20, backgroundColor: palette.border.default },
});
