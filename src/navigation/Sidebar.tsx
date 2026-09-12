import React from "react";
import { View, Pressable, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LogOut, ChevronsLeft, ChevronsRight, Hospital } from "lucide-react-native";
import { useAuthStore } from "@shared/store/useAuthStore";
import { ROLE_LABELS } from "@shared/permissions";
import { palette, radius, layout } from "@shared/designSystem";
import { Text, VStack, HStack, Avatar } from "@shared/ui";
import { NavItem, SECTION_ORDER, useSidebarNavItems } from "./navItems";

interface Props {
  activeRoute: string;
  onNavigate: (name: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ activeRoute, onNavigate, collapsed = false, onToggleCollapse }: Props) {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const hospital = useAuthStore((s) => s.hospital);
  const logout = useAuthStore((s) => s.logout);
  const items = useSidebarNavItems();

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingTop: insets.top + 18,
          width: collapsed ? layout.sidebarCollapsedWidth : layout.sidebarWidth,
        },
      ]}
    >
      {/* Brand + hospital. The hospital name is shown because a user may hold
          accounts at more than one and needs to know which they are in. */}
      <HStack
        gap={10}
        align="center"
        style={{
          paddingHorizontal: collapsed ? 0 : 18,
          justifyContent: collapsed ? "center" : "flex-start",
          marginBottom: 18,
        }}
      >
        <View style={styles.mark}>
          <Hospital size={18} color={palette.clinical[700]} strokeWidth={2.2} />
        </View>
        {!collapsed ? (
          <>
            <VStack gap={1} flex={1}>
              <Text variant="h3" tone="primary" numberOfLines={1}>
                HMS
              </Text>
              <Text variant="caption" tone="tertiary" numberOfLines={1}>
                {hospital?.name || "Hospital"}
              </Text>
            </VStack>
            {onToggleCollapse ? (
              <Pressable
                onPress={onToggleCollapse}
                hitSlop={8}
                style={styles.toggleBtn}
                accessibilityRole="button"
                accessibilityLabel="Collapse sidebar"
              >
                <ChevronsLeft size={18} color={palette.text.tertiary} strokeWidth={2} />
              </Pressable>
            ) : null}
          </>
        ) : null}
      </HStack>

      {collapsed && onToggleCollapse ? (
        <Pressable
          onPress={onToggleCollapse}
          hitSlop={8}
          style={styles.expandBtn}
          accessibilityRole="button"
          accessibilityLabel="Expand sidebar"
        >
          <ChevronsRight size={18} color={palette.text.tertiary} strokeWidth={2} />
        </Pressable>
      ) : null}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: collapsed ? 10 : 12 }}
        showsVerticalScrollIndicator={false}
      >
        {SECTION_ORDER.map((section) => {
          const group = items.filter((it) => it.section === section);
          if (group.length === 0) return null;
          return (
            <View key={section}>
              {collapsed ? (
                <View style={styles.sectionDivider} />
              ) : (
                <Text variant="overline" tone="tertiary" style={styles.sectionLabel}>
                  {section}
                </Text>
              )}
              {group.map((item) => (
                <NavRow
                  key={item.name}
                  item={item}
                  active={activeRoute === item.name}
                  collapsed={collapsed}
                  onPress={() => onNavigate(item.name)}
                />
              ))}
            </View>
          );
        })}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom + 12,
            paddingHorizontal: collapsed ? 0 : 14,
            alignItems: collapsed ? "center" : "stretch",
          },
        ]}
      >
        {collapsed ? (
          <VStack gap={10} align="center">
            <Avatar name={user?.fullName || "U"} size={34} />
            <Pressable
              onPress={() => logout()}
              hitSlop={8}
              style={styles.logoutBtn}
              accessibilityRole="button"
              accessibilityLabel="Sign out"
            >
              <LogOut size={17} color={palette.text.tertiary} strokeWidth={1.9} />
            </Pressable>
          </VStack>
        ) : (
          <HStack gap={10} align="center">
            <Avatar name={user?.fullName || "U"} size={36} />
            <VStack gap={1} flex={1}>
              <Text variant="label" tone="primary" numberOfLines={1}>
                {user?.fullName}
              </Text>
              <Text variant="caption" tone="tertiary" numberOfLines={1}>
                {user?.designation || (user ? ROLE_LABELS[user.role] : "")}
              </Text>
            </VStack>
            <Pressable
              onPress={() => logout()}
              hitSlop={8}
              style={styles.logoutBtn}
              accessibilityRole="button"
              accessibilityLabel="Sign out"
            >
              <LogOut size={17} color={palette.text.tertiary} strokeWidth={1.9} />
            </Pressable>
          </HStack>
        )}
      </View>
    </View>
  );
}

function NavRow({
  item,
  active,
  collapsed,
  onPress,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onPress: () => void;
}) {
  const Icon = item.icon;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={item.label}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.navRow,
        collapsed && styles.navRowCollapsed,
        active && styles.navRowActive,
        pressed && !active ? { backgroundColor: palette.ink[50] } : null,
      ]}
    >
      <Icon
        size={18}
        color={active ? palette.clinical[700] : palette.text.tertiary}
        strokeWidth={active ? 2.3 : 1.9}
      />
      {!collapsed ? (
        <Text
          variant="label-lg"
          numberOfLines={1}
          style={{ color: active ? palette.clinical[700] : palette.text.secondary }}
        >
          {item.label}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexShrink: 0,
    height: "100%",
    backgroundColor: palette.surface.primary,
    borderRightWidth: 1,
    borderRightColor: palette.border.default,
  },
  mark: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: palette.clinical[50],
    alignItems: "center",
    justifyContent: "center",
  },
  toggleBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  expandBtn: {
    alignSelf: "center",
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: palette.ink[50],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: layout.navRowHeight,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    marginBottom: 1,
  },
  navRowCollapsed: { justifyContent: "center", paddingHorizontal: 0, gap: 0 },
  navRowActive: { backgroundColor: palette.clinical[50] },
  sectionLabel: { paddingHorizontal: 10, marginTop: 12, marginBottom: 3 },
  sectionDivider: {
    height: 1,
    backgroundColor: palette.border.subtle,
    marginVertical: 6,
    marginHorizontal: 4,
  },
  footer: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.border.default,
  },
  logoutBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
});
