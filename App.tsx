import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  NavigationContainer,
  type LinkingOptions,
  type NavigatorScreenParams,
} from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from "@expo-google-fonts/inter";

import RootNavigator from "@navigation/RootNavigator";
import { palette } from "@shared/designSystem";

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A clinical record is not a social feed. Refetching on every window
      // focus means a doctor comparing two values watches them flicker and
      // re-sort under the cursor.
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
      // React Query pauses on navigator.onLine by default, which would stop a
      // request before it can reach the offline queue.
      networkMode: "always",
    },
    mutations: { networkMode: "always" },
  },
});

/**
 * URL <-> route mapping.
 *
 * Mirrors the route table in the specification so the web build has the same
 * addresses the spec documents, and a link pasted into a handover note opens
 * the right screen.
 */
/**
 * Every route the app can address.
 *
 * WHICH of these is registered at runtime depends on the signed-in user's
 * permissions (see `navItems.ts`), but the full set is static — so the route
 * names and their parameters are type-checked here, and a typo in the linking
 * table below is a compile error rather than a dead link.
 */
type AppParamList = {
  Dashboard: undefined;
  Patients: undefined;
  RegisterPatient: undefined;
  Appointments: undefined;
  OpdQueue: undefined;
  Emergency: undefined;
  MyAppointments: undefined;
  MyPatients: undefined;
  Consultation: { patientId: string };
  MedicalRecord: { patientId: string };
  AdmittedPatients: undefined;
  Beds: undefined;
  Icu: undefined;
  NursingPatients: undefined;
  Handover: undefined;
  LabQueue: undefined;
  LabReports: undefined;
  PharmacyQueue: undefined;
  MedicineStock: undefined;
  Inventory: undefined;
  Bills: undefined;
  Reports: undefined;
  AuditTrail: undefined;
  UserManagement: undefined;
  HospitalConfig: undefined;
  Profile: undefined;
};

type RootParamList = {
  Login: undefined;
  App: NavigatorScreenParams<AppParamList>;
};

const linking: LinkingOptions<RootParamList> = {
  prefixes: [],
  config: {
    screens: {
      Login: "login",
      App: {
        screens: {
          Dashboard: "dashboard",
          Patients: "patients",
          RegisterPatient: "patients/new",
          Appointments: "appointments",
          OpdQueue: "opd/queue",
          Emergency: "emergency",
          MyAppointments: "doctor/appointments",
          MyPatients: "doctor/patients",
          Consultation: "opd/consultation/:patientId",
          MedicalRecord: "patients/:patientId/record",
          AdmittedPatients: "ipd/patients",
          Beds: "beds",
          Icu: "icu",
          NursingPatients: "nursing/patients",
          Handover: "nursing/handover",
          LabQueue: "lab/requests",
          LabReports: "lab/reports",
          PharmacyQueue: "pharmacy/prescriptions",
          MedicineStock: "pharmacy/stock",
          Inventory: "inventory",
          Bills: "billing/bills",
          Reports: "reports",
          AuditTrail: "admin/audit",
          UserManagement: "admin/users",
          HospitalConfig: "admin/config",
          Profile: "profile",
        },
      },
    },
  },
};

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <NavigationContainer
            linking={linking}
            theme={{
              dark: false,
              colors: {
                primary: palette.clinical[600],
                background: palette.surface.secondary,
                card: palette.surface.primary,
                text: palette.text.primary,
                border: palette.border.default,
                notification: palette.danger.text,
              },
              fonts: {
                regular: { fontFamily: "Inter_400Regular", fontWeight: "400" },
                medium: { fontFamily: "Inter_500Medium", fontWeight: "500" },
                bold: { fontFamily: "Inter_600SemiBold", fontWeight: "600" },
                heavy: { fontFamily: "Inter_600SemiBold", fontWeight: "600" },
              },
            }}
          >
            <StatusBar style="dark" />
            <RootNavigator />
          </NavigationContainer>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
