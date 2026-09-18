import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  NavigationContainer,
  type LinkingOptions,
  type NavigatorScreenParams,
} from "@react-navigation/native";
import { QueryClientProvider } from "@tanstack/react-query";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from "@expo-google-fonts/inter";

import RootNavigator from "@navigation/RootNavigator";
import { palette } from "@shared/designSystem";
import { queryClient } from "@api/queryClient";
import { startNetworkWatch } from "@shared/offline/network";
import { registerServiceWorker } from "@shared/offline/serviceWorker";

void SplashScreen.preventAutoHideAsync();

// route params for every addressable screen; the linking table below is checked against them.
// which of these is registered at runtime depends on permissions (see navItems.ts).
type InpatientParamList = {
  WardBoard: { mode?: "ward" | "icu" | "mine" } | undefined;
  Bedside: {
    admissionId: string;
    tab?: "chart" | "observations" | "drugs" | "notes";
  };
  AdmitPatient: { patientId?: string; consultationId?: string } | undefined;
  Discharge: { admissionId: string };
  MedicalRecord: { patientId: string };
  PatientDetail: { patientId: string };
};

type HandoverParamList = {
  HandoverList: undefined;
  Bedside: InpatientParamList["Bedside"];
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

type BillingParamList = {
  BillsList: undefined;
  GenerateBill: { patientId?: string } | undefined;
  BillDetail: { billId: string };
  RecordPayment: { billId: string };
  Receipt: { paymentId: string };
  RefundSlip: { refundId: string };
  Outstanding: undefined;
};

type EmergencyParamList = {
  EmergencyBoard: undefined;
  RegisterArrival: undefined;
  EmergencyVisit: { visitId: string };
  MedicalRecord: { patientId: string };
};

type AppParamList = {
  Dashboard: undefined;
  Patients: undefined;
  RegisterPatient: undefined;
  Appointments: undefined;
  OpdQueue: undefined;
  Emergency: NavigatorScreenParams<EmergencyParamList> | undefined;
  MyAppointments: undefined;
  MyPatients: NavigatorScreenParams<InpatientParamList> | undefined;
  Consultation: { patientId: string };
  MedicalRecord: { patientId: string };
  AdmittedPatients: NavigatorScreenParams<InpatientParamList> | undefined;
  Beds: undefined;
  Icu: NavigatorScreenParams<InpatientParamList> | undefined;
  NursingPatients: NavigatorScreenParams<InpatientParamList> | undefined;
  Handover: NavigatorScreenParams<HandoverParamList> | undefined;
  LabQueue: NavigatorScreenParams<LaboratoryParamList> | undefined;
  LabReports: NavigatorScreenParams<LaboratoryParamList> | undefined;
  PharmacyQueue: NavigatorScreenParams<PharmacyParamList> | undefined;
  MedicineStock: NavigatorScreenParams<StockParamList> | undefined;
  Formulary: undefined;
  Inventory: NavigatorScreenParams<StockParamList> | undefined;
  Bills: NavigatorScreenParams<BillingParamList> | undefined;
  /** `report` opens a particular report — the dashboard's tiles pass it. */
  Reports: { report?: string } | undefined;
  AuditTrail: undefined;
  UserManagement: undefined;
  RolePermissions: undefined;
  HospitalConfig: undefined;
  Profile: undefined;
  Scan: undefined;
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
          Appointments: {
            path: "appointments",
            // A date in the link (?date=YYYY-MM-DD) opens the list on that day.
            screens: { AppointmentsList: "", BookAppointment: "book" },
          },
          OpdQueue: "opd/queue",
          Emergency: {
            path: "emergency",
            screens: {
              EmergencyBoard: "",
              RegisterArrival: "arrival",
              EmergencyVisit: "visits/:visitId",
              MedicalRecord: "patients/:patientId/record",
            },
          },
          MyAppointments: "doctor/appointments",
          MyPatients: {
            path: "doctor",
            screens: {
              WardBoard: "patients",
              Bedside: "patients/:admissionId",
              Discharge: "patients/:admissionId/discharge",
            },
          },
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
          Handover: {
            path: "nursing/handover",
            screens: {
              HandoverList: "",
              Bedside: "patients/:admissionId",
            },
          },
          LabQueue: {
            path: "lab/requests",
            screens: { LabQueueList: "", LabOrder: ":orderId" },
          },
          LabReports: {
            path: "lab/reports",
            screens: { LabResultsList: "", LabOrder: ":orderId" },
          },
          PharmacyQueue: {
            path: "pharmacy",
            screens: {
              PharmacyQueueList: "prescriptions",
              Dispense: "dispense/:prescriptionId",
            },
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
          Formulary: "pharmacy/formulary",
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
          Bills: {
            path: "billing",
            screens: {
              BillsList: "bills",
              GenerateBill: "generate/:patientId?",
              BillDetail: "bills/:billId",
              RecordPayment: "payment/:billId",
              Receipt: "receipt/:paymentId",
              RefundSlip: "refund/:refundId",
              Outstanding: "outstanding",
            },
          },
          Reports: "reports",
          AuditTrail: "admin/audit",
          UserManagement: "admin/users",
          RolePermissions: "admin/roles",
          HospitalConfig: "admin/config",
          Profile: "profile",
          Scan: "scan",
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

  // started before sign-in so the login screen can already report being offline.
  useEffect(() => startNetworkWatch(), []);
  useEffect(() => registerServiceWorker(), []);

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
