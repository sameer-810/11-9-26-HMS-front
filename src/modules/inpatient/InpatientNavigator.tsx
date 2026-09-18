import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import WardBoardScreen from "./screens/WardBoardScreen";
import BedsideScreen from "./screens/BedsideScreen";
import AdmitPatientScreen from "./screens/AdmitPatientScreen";
import DischargeScreen from "./screens/DischargeScreen";
import ShiftHandoverScreen from "./screens/ShiftHandoverScreen";
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
/** A doctor's "My patients": admitted under their name, opening the same bedside chart. */
export const MyPatientsNavigator = makeInpatientNavigator("doctor");

/** Shift handover: the nurse's patients by handover status, each opening its chart's Notes tab. */
export function HandoverNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HandoverList" component={ShiftHandoverScreen} />
      <Stack.Screen name="Bedside" component={BedsideScreen} />
      <Stack.Screen name="MedicalRecord" component={MedicalRecordScreen} />
      <Stack.Screen name="PatientDetail" component={PatientDetailScreen} />
    </Stack.Navigator>
  );
}

export default AdmittedPatientsNavigator;
