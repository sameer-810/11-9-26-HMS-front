import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import MyScheduleScreen from "./screens/MyScheduleScreen";
import ConsultationScreen from "./screens/ConsultationScreen";
import MedicalRecordScreen from "./screens/MedicalRecordScreen";
import PatientDetailScreen from "@modules/patient/screens/PatientDetailScreen";

const Stack = createNativeStackNavigator();

/** Clinical stack: schedule, consultation and record in one stack so a doctor keeps their place. */
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
