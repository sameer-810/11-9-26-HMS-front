import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import WardBoardScreen from "./screens/WardBoardScreen";
import BedsideScreen from "./screens/BedsideScreen";
import AdmitPatientScreen from "./screens/AdmitPatientScreen";
import DischargeScreen from "./screens/DischargeScreen";
import MedicalRecordScreen from "@modules/consultation/screens/MedicalRecordScreen";
import PatientDetailScreen from "@modules/patient/screens/PatientDetailScreen";
import type { BoardMode } from "./screens/WardBoardScreen";

const Stack = createNativeStackNavigator();

/**
 * Inpatient stack, including record screens so a ward round keeps its place.
 * Ward, ICU and "my patients" share it; the mode is fixed per navigator so each keeps its history.
 */
function makeInpatientNavigator(mode: BoardMode) {
  return function InpatientNavigator() {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen
          name="WardBoard"
          component={WardBoardScreen}
          initialParams={{ mode }}
        />
        <Stack.Screen name="Bedside" component={BedsideScreen} />
        <Stack.Screen name="AdmitPatient" component={AdmitPatientScreen} />
        <Stack.Screen name="Discharge" component={DischargeScreen} />
        <Stack.Screen name="MedicalRecord" component={MedicalRecordScreen} />
        <Stack.Screen name="PatientDetail" component={PatientDetailScreen} />
      </Stack.Navigator>
    );
  };
}

export const AdmittedPatientsNavigator = makeInpatientNavigator("ward");
export const IcuNavigator = makeInpatientNavigator("icu");
export const MyWardNavigator = makeInpatientNavigator("mine");

export default AdmittedPatientsNavigator;
