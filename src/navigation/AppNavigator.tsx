import React, { useRef, useState } from "react";
import { View, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  createDrawerNavigator,
  DrawerContentComponentProps,
} from "@react-navigation/drawer";
import { Menu, Hospital } from "lucide-react-native";
import { palette, radius, layout } from "@shared/designSystem";
import { Text, HStack } from "@shared/ui";
import { Sidebar } from "./Sidebar";
import { NAV_ITEMS, useVisibleNavItems } from "./navItems";

import DashboardScreen from "@modules/dashboard/screens/DashboardScreen";
import { PlaceholderScreen } from "./PlaceholderScreen";

/**
 * Route name -> screen component.
 *
 * Kept here rather than on the nav items themselves so `navItems.ts` stays a
 * pure data module that anything can import without pulling in the entire
 * screen graph.
 *
 * Entries not yet built resolve to a placeholder. That is deliberate for the
 * foundation phase: the navigation, permissions and routing are exercised for
 * real now, and each phase swaps its placeholders for the real screens.
 */
const SCREENS: Record<string, React.ComponentType<Record<string, unknown>>> = {
  Dashboard: DashboardScreen,
};

const Drawer = createDrawerNavigator();

export default function AppNavigator() {
  const { width } = useWindowDimensions();
  const isWide = width >= layout.wideBreakpoint;
  const [collapsed, setCollapsed] = useState(false);
  const drawerNav = useRef<DrawerContentComponentProps["navigation"] | null>(null);
  const items = useVisibleNavItems();

  const drawerContent = (props: DrawerContentComponentProps) => {
    drawerNav.current = props.navigation;
    return (
      <Sidebar
        activeRoute={props.state.routeNames[props.state.index]}
        onNavigate={(name) => props.navigation.navigate(name)}
        collapsed={isWide && collapsed}
        onToggleCollapse={isWide ? () => setCollapsed((c) => !c) : undefined}
      />
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <Drawer.Navigator
        initialRouteName="Dashboard"
        drawerContent={drawerContent}
        screenOptions={{
          drawerType: isWide ? "permanent" : "front",
          headerShown: !isWide,
          header: ({ route, navigation }) => (
            <SafeAreaView edges={["top"]} style={styles.appBarSafe}>
              <HStack align="center" gap={12} style={styles.appBar}>
                <Pressable
                  onPress={() => navigation.openDrawer()}
                  hitSlop={8}
                  style={styles.menuBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Open menu"
                >
                  <Menu size={22} color={palette.text.primary} strokeWidth={2} />
                </Pressable>
                <View style={styles.mark}>
                  <Hospital size={16} color={palette.clinical[700]} strokeWidth={2.2} />
                </View>
                <Text variant="h3" tone="primary">
                  {NAV_ITEMS.find((i) => i.name === route.name)?.label || "HMS"}
                </Text>
              </HStack>
            </SafeAreaView>
          ),
          drawerStyle: {
            width: isWide && collapsed ? layout.sidebarCollapsedWidth : layout.sidebarWidth,
            borderRightWidth: 0,
          },
          overlayColor: "rgba(11,18,32,0.4)",
          sceneStyle: { backgroundColor: palette.surface.secondary },
        }}
      >
        {/* Only routes this role may reach are registered. A deep link to a
            route absent from this list cannot render — the guard is the
            absence of the screen, not a check inside it. */}
        {items.map((item) => {
          const Component = SCREENS[item.name] ?? PlaceholderScreen;
          return (
            <Drawer.Screen
              key={item.name}
              name={item.name}
              component={Component}
              options={{ title: item.label }}
              initialParams={{ __label: item.label, __section: item.section }}
            />
          );
        })}
      </Drawer.Navigator>
    </View>
  );
}

const styles = StyleSheet.create({
  appBarSafe: { backgroundColor: palette.surface.primary },
  appBar: {
    height: 56,
    paddingHorizontal: 14,
    backgroundColor: palette.surface.primary,
    borderBottomWidth: 1,
    borderBottomColor: palette.border.default,
  },
  menuBtn: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  mark: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: palette.clinical[50],
    alignItems: "center",
    justifyContent: "center",
  },
});
