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
type InpatientParamList = {
  WardBoard: { mode?: "ward" | "icu" | "mine" } | undefined;
  Bedside: { admissionId: string };
  AdmitPatient: { patientId?: string; consultationId?: string } | undefined;
  Discharge: { admissionId: string };
  MedicalRecord: { patientId: string };
  PatientDetail: { patientId: string };
};

type LaboratoryParamList = {
  LabQueueList: undefined;
  LabResultsList: undefined;
  LabOrder: { orderId: string };
  MedicalRecord: { patientId: string };
  PatientDetail: { patientId: string };
};

type PharmacyParamList = {
  PharmacyQueueList: undefined;
  Dispense: { prescriptionId: string };
};

type StockParamList = {
  InventoryList: undefined;
  InventoryItem: { itemId: string };
  ReceiveStock: undefined;
  IssueStock: undefined;
  LowStock: undefined;
  StockLedger: undefined;
};

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
  /**
   * The inpatient stack. Addressable all the way down, because a bedside chart
   * is exactly the kind of link that gets pasted into a handover message.
   */
  AdmittedPatients: NavigatorScreenParams<InpatientParamList> | undefined;
  Beds: undefined;
  Icu: NavigatorScreenParams<InpatientParamList> | undefined;
  NursingPatients: NavigatorScreenParams<InpatientParamList> | undefined;
  Handover: undefined;
  LabQueue: NavigatorScreenParams<LaboratoryParamList> | undefined;
  LabReports: NavigatorScreenParams<LaboratoryParamList> | undefined;
  PharmacyQueue: NavigatorScreenParams<PharmacyParamList> | undefined;
  MedicineStock: NavigatorScreenParams<StockParamList> | undefined;
  Inventory: NavigatorScreenParams<StockParamList> | undefined;
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
          AdmittedPatients: {
            path: "ipd",
            screens: {
              WardBoard: "patients",
              Bedside: "patients/:admissionId",
              AdmitPatient: "admit",
              Discharge: "patients/:admissionId/discharge",
            },
          },
          Beds: "beds",
          Icu: {
            path: "icu",
            screens: {
              WardBoard: "",
              Bedside: "patients/:admissionId",
            },
          },
          NursingPatients: {
            path: "nursing",
            screens: {
              WardBoard: "patients",
              Bedside: "patients/:admissionId",
            },
          },
          Handover: "nursing/handover",
          // A lab order has its own address, so "LAB-000123 is critical" in a
          // handover message is a link, not a search.
          LabQueue: {
            path: "lab/requests",
            screens: { LabQueueList: "", LabOrder: ":orderId" },
          },
          LabReports: {
            path: "lab/reports",
            screens: { LabResultsList: "", LabOrder: ":orderId" },
          },
          // The spec's routes: /pharmacy/prescriptions, /pharmacy/dispense/:id,
          // /pharmacy/stock, /inventory/receive, /inventory/issue and
          // /inventory/low-stock.
          PharmacyQueue: {
            path: "pharmacy",
            screens: { PharmacyQueueList: "prescriptions", Dispense: "dispense/:prescriptionId" },
          },
          MedicineStock: {
            path: "pharmacy/stock",
            screens: {
              InventoryList: "",
              InventoryItem: "items/:itemId",
              ReceiveStock: "receive",
              LowStock: "low-stock",
              StockLedger: "movements",
            },
          },
          Inventory: {
            path: "inventory",
            screens: {
              InventoryList: "",
              InventoryItem: "items/:itemId",
              ReceiveStock: "receive",
              IssueStock: "issue",
              LowStock: "low-stock",
              StockLedger: "movements",
            },
          },
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
