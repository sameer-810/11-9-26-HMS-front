import React, { useMemo, useState } from "react";
import { View, Pressable, ScrollView, StyleSheet, ViewStyle, StyleProp, Platform } from "react-native";
import { webAria } from "./a11y";
import { ChevronUp, ChevronDown, type LucideIcon } from "lucide-react-native";
import { palette, radius, breakpoints } from "../designSystem";
import { Text } from "./Text";
import { VStack } from "./Stack";
import { useBreakpoint, useDensity } from "./useBreakpoint";
import { EmptyState } from "./EmptyState";
import type { Density } from "../designSystem";

export interface Column<T> {
  key: string;
  header: string;
  width?: number;
  flex?: number;
  align?: "left" | "right" | "center";
  sortable?: boolean;
  /** Required when `sortable` — the comparable value behind the rendered cell. */
  sortValue?: (row: T) => string | number;
  render: (row: T) => React.ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  keyExtractor: (row: T) => string;
  onRowPress?: (row: T) => void;
  /** Card renderer used below the narrow breakpoint instead of a horizontally scrolling table. */
  mobileCard?: (row: T) => React.ReactNode;
  /** Tints a whole row — an abnormal result, an overdue task. */
  rowAccent?: (row: T) => string | undefined;
  density?: Density;
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyMessage?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function DataTable<T>({
  columns,
  rows,
  keyExtractor,
  onRowPress,
  mobileCard,
  rowAccent,
  density: densityOverride,
  emptyIcon,
  emptyTitle = "Nothing here yet",
  emptyMessage,
  style,
  testID,
}: Props<T>) {
  const { width } = useBreakpoint();
  const d = useDensity(densityOverride);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const isNarrow = width < breakpoints.md;

  if (__DEV__) {
    for (const c of columns) {
      if (c.sortable && !c.sortValue) {
        console.warn(
          `DataTable: column "${c.key}" is sortable but has no sortValue — sorting it would compare React elements.`,
        );
      }
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (av === bv) return 0;
      return av > bv ? dir : -dir;
    });
  }, [rows, sortKey, sortDir, columns]);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((s) => (s === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  if (rows.length === 0) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} message={emptyMessage} />;
  }

  if (isNarrow && mobileCard) {
    return (
      <VStack gap={8} style={style} testID={testID}>
        {sorted.map((row) => (
          <View key={keyExtractor(row)}>{mobileCard(row)}</View>
        ))}
      </VStack>
    );
  }

  const table = (
    <View style={[styles.table, style]} testID={testID}>
      { /* Header */ }
      <View style={[styles.headerRow, { minHeight: 36 }]} accessibilityRole="none">
        {columns.map((c) => {
          const active = sortKey === c.key;
          // Size goes on the outer wrapper: a flex cell in an unsized Pressable misaligns headers.
          const cell = (
            <View
              style={[
                styles.cell,
                { justifyContent: justifyFor(c.align), flexDirection: "row", alignItems: "center", gap: 4 },
              ]}
            >
              <Text variant="label-sm" tone="tertiary" numberOfLines={1}>
                {c.header}
              </Text>
              {c.sortable && active ? (
                sortDir === "asc" ? (
                  <ChevronUp size={12} color={palette.text.secondary} strokeWidth={2.4} />
                ) : (
                  <ChevronDown size={12} color={palette.text.secondary} strokeWidth={2.4} />
                )
              ) : null}
            </View>
          );

          return c.sortable && c.sortValue ? (
            <Pressable
              key={c.key}
              style={cellSize(c)}
              onPress={() => toggleSort(c.key)}
              accessibilityRole="button"
              accessibilityLabel={`Sort by ${c.header}${active ? (sortDir === "asc" ? ", ascending" : ", descending") : ""}`}
              accessibilityState={Platform.OS === "web" ? undefined : { selected: active }}
              {...webAria({ pressed: active })}
            >
              {cell}
            </Pressable>
          ) : (
            <View key={c.key} style={cellSize(c)}>
              {cell}
            </View>
          );
        })}
      </View>

      { /* Rows */ }
      {sorted.map((row, i) => {
        const accent = rowAccent?.(row);
        const content = (
          <View
            style={[
              styles.row,
              {
                minHeight: d.rowHeight,
                paddingVertical: d.cellPaddingY,
                backgroundColor: i % 2 === 1 ? palette.surface.secondary : palette.surface.primary,
              },
              accent ? { borderLeftWidth: 3, borderLeftColor: accent } : null,
            ]}
          >
            {columns.map((c) => (
              <View
                key={c.key}
                style={[styles.cell, cellSize(c), { justifyContent: justifyFor(c.align) }]}
              >
                {c.render(row)}
              </View>
            ))}
          </View>
        );

        return onRowPress ? (
          <Pressable
            key={keyExtractor(row)}
            onPress={() => onRowPress(row)}
            accessibilityRole="button"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
          >
            {content}
          </Pressable>
        ) : (
          <View key={keyExtractor(row)}>{content}</View>
        );
      })}
    </View>
  );

  // Narrow without mobileCard: fall back to horizontal scroll rather than truncating.
  if (isNarrow) {
    if (__DEV__ && !mobileCard) {
      console.warn("DataTable: no mobileCard provided — falling back to horizontal scroll.");
    }
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator>
        {table}
      </ScrollView>
    );
  }

  return table;
}

function cellSize<T>(c: Column<T>): ViewStyle {
  if (c.width) return { width: c.width, flexShrink: 0 };
  return { flex: c.flex ?? 1, minWidth: 0 };
}

function justifyFor(align?: "left" | "right" | "center"): ViewStyle["justifyContent"] {
  if (align === "right") return "flex-end";
  if (align === "center") return "center";
  return "flex-start";
}

const styles = StyleSheet.create({
  table: {
    borderWidth: 1,
    borderColor: palette.border.default,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: palette.surface.primary,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.surface.tertiary,
    borderBottomWidth: 1,
    borderBottomColor: palette.border.default,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: palette.border.subtle,
  },
  cell: { paddingHorizontal: 12, flexDirection: "row", alignItems: "center" },
});
