import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import MyScheduleScreen from "./screens/MyScheduleScreen";
import ConsultationScreen from "./screens/ConsultationScreen";
import MedicalRecordScreen from "./screens/MedicalRecordScreen";
import PatientDetailScreen from "@modules/patient/screens/PatientDetailScreen";

const Stack = createNativeStackNavigator();

/**
 * The clinical stack.
 *
 * A doctor's journey is one continuous thing — schedule, consultation, record,
 * back to the schedule — so it lives in one stack rather than sending them
 * between sidebar sections mid-consultation.
 */
export default function ClinicalNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MyScheduleList" component={MyScheduleScreen} />
      <Stack.Screen name="Consultation" component={ConsultationScreen} />
      <Stack.Screen name="MedicalRecord" component={MedicalRecordScreen} />
      <Stack.Screen name="PatientDetail" component={PatientDetailScreen} />
    </Stack.Navigator>
  );
}
