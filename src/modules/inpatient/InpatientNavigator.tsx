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
 * The inpatient stack.
 *
 * A ward round is one continuous thing — board, bedside, back to the board,
 * next patient — so it stays in one stack rather than sending the user through
 * the sidebar between every patient.
 *
 * The record and patient screens are registered here too, for the same reason:
 * looking up a past result mid-round should not cost the user their place in
 * the ward list.
 *
 * Three sidebar entries share this stack — the doctor's ward, the ICU board and
 * the nurse's own allocation. They differ by ONE query parameter, so they are
 * one screen with a mode rather than three copies of the same file; the mode is
 * fixed at the navigator so each sidebar entry keeps its own history.
 */
function makeInpatientNavigator(mode: BoardMode) {
  return function InpatientNavigator() {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="WardBoard" component={WardBoardScreen} initialParams={{ mode }} />
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
