import React, { useEffect, useRef, useState } from "react";
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
import PatientsNavigator from "@modules/patient/PatientsNavigator";
import AppointmentsNavigator from "@modules/appointment/AppointmentsNavigator";
import RegisterPatientScreen from "@modules/patient/screens/RegisterPatientScreen";
import OpdQueueScreen from "@modules/appointment/screens/OpdQueueScreen";
import ClinicalNavigator from "@modules/consultation/ClinicalNavigator";
import MedicalRecordScreen from "@modules/consultation/screens/MedicalRecordScreen";
import {
  AdmittedPatientsNavigator,
  IcuNavigator,
  MyPatientsNavigator,
  MyWardNavigator,
  HandoverNavigator,
} from "@modules/inpatient/InpatientNavigator";
import {
  LabQueueNavigator,
  LabResultsNavigator,
} from "@modules/laboratory/LaboratoryNavigator";
import PharmacyNavigator from "@modules/pharmacy/PharmacyNavigator";
import {
  StoreInventoryNavigator,
  PharmacyStockNavigator,
} from "@modules/inventory/InventoryNavigator";
import FormularyScreen from "@modules/formulary/screens/FormularyScreen";
import BillingNavigator from "@modules/billing/BillingNavigator";
import EmergencyNavigator from "@modules/emergency/EmergencyNavigator";
import ReportsScreen from "@modules/reports/screens/ReportsScreen";
import AuditTrailScreen from "@modules/audit/screens/AuditTrailScreen";
import UsersNavigator from "@modules/admin/UsersNavigator";
import HospitalConfigScreen from "@modules/admin/screens/HospitalConfigScreen";
import BedsScreen from "@modules/admin/screens/BedsScreen";
import ProfileScreen from "@modules/admin/screens/ProfileScreen";
import ScanScreen from "@modules/printing/screens/ScanScreen";
import RolesScreen from "@modules/admin/screens/RolesScreen";
import { IdleTimeout } from "@shared/session/IdleTimeout";
import { recordActivity } from "@shared/session/activity";
import { PlaceholderScreen } from "./PlaceholderScreen";
import { useAuthStore } from "@shared/store/useAuthStore";
import { queryClient } from "@api/queryClient";
import { startMirror } from "@shared/offline/mirror";
import { startOutboxSync } from "@shared/offline/outbox";
import { OfflineStatusBar } from "@shared/offline/OfflineStatusBar";
import { startRealtime } from "@shared/realtime/realtime";
import { RealtimeAlerts } from "@shared/realtime/RealtimeAlerts";

/** route name -> screen component; kept out of navItems.ts so that stays a pure data module. */
const SCREENS: Record<string, React.ComponentType<Record<string, unknown>>> = {
  Dashboard: DashboardScreen,
  Patients: PatientsNavigator,
  RegisterPatient: RegisterPatientScreen,
  Appointments: AppointmentsNavigator,
  OpdQueue: OpdQueueScreen,
  MyAppointments: ClinicalNavigator,
  MyPatients: MyPatientsNavigator,
  Consultation: ClinicalNavigator,
  MedicalRecord: MedicalRecordScreen,

  // ---- Wards (Phase 4) ----
  AdmittedPatients: AdmittedPatientsNavigator,
  Icu: IcuNavigator,
  NursingPatients: MyWardNavigator,
  Handover: HandoverNavigator,

  // ---- Diagnostics (Phase 5) ----
  LabQueue: LabQueueNavigator,
  LabReports: LabResultsNavigator,

  // ---- Supply (Phase 6) ----
  PharmacyQueue: PharmacyNavigator,
  MedicineStock: PharmacyStockNavigator,
  Formulary: FormularyScreen,
  Inventory: StoreInventoryNavigator,

  // ---- Finance (Phase 7) ----
  Bills: BillingNavigator,

  // ---- Emergency and oversight (Phase 8) ----
  Emergency: EmergencyNavigator,
  Reports: ReportsScreen,
  AuditTrail: AuditTrailScreen,
  Beds: BedsScreen,
  UserManagement: UsersNavigator,
  RolePermissions: RolesScreen,
  HospitalConfig: HospitalConfigScreen,
  Profile: ProfileScreen,

  // ---- Printing and scanning (Phase 9) ----
  Scan: ScanScreen,
};

const Drawer = createDrawerNavigator();

export default function AppNavigator() {
  const { width } = useWindowDimensions();
  const isWide = width >= layout.wideBreakpoint;
  const [collapsed, setCollapsed] = useState(false);
  const drawerNav = useRef<DrawerContentComponentProps["navigation"] | null>(
    null,
  );
  const items = useVisibleNavItems();

  // session-scoped services; restarted when the signed-in user or token changes.
  const userId = useAuthStore((s) => s.user?.id);
  const token = useAuthStore((s) => s.token);
  useEffect(
    () => (userId ? startMirror(queryClient, userId) : undefined),
    [userId],
  );
  useEffect(() => startOutboxSync(), []);
  useEffect(() => (token ? startRealtime(token) : undefined), [token]);

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
    <View
      style={{ flex: 1 }}
      // records activity for the idle sign-out without consuming the touch (false passes it on).
      // on web, IdleTimeout listens to the window instead.
      onStartShouldSetResponderCapture={() => {
        recordActivity();
        return false;
      }}
    >
      <OfflineStatusBar />
      <RealtimeAlerts />
      <IdleTimeout />
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
                  <Menu
                    size={22}
                    color={palette.text.primary}
                    strokeWidth={2}
                  />
                </Pressable>
                <View style={styles.mark}>
                  <Hospital
                    size={16}
                    color={palette.clinical[700]}
                    strokeWidth={2.2}
                  />
                </View>
                <Text variant="h3" tone="primary">
                  {NAV_ITEMS.find((i) => i.name === route.name)?.label || "HMS"}
                </Text>
              </HStack>
            </SafeAreaView>
          ),
          drawerStyle: {
            width:
              isWide && collapsed
                ? layout.sidebarCollapsedWidth
                : layout.sidebarWidth,
            borderRightWidth: 0,
          },
          overlayColor: "rgba(11,18,32,0.4)",
          sceneStyle: { backgroundColor: palette.surface.secondary },
        }}
      >
        {/* only permitted routes are registered, so a deep link to any other cannot render. */}
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
