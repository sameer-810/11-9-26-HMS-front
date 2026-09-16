import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import LabQueueScreen from "./screens/LabQueueScreen";
import LabResultsScreen from "./screens/LabResultsScreen";
import LabOrderScreen from "./screens/LabOrderScreen";
import MedicalRecordScreen from "@modules/consultation/screens/MedicalRecordScreen";
import PatientDetailScreen from "@modules/patient/screens/PatientDetailScreen";

const Stack = createNativeStackNavigator();

/**
 * two sidebar entries, one stack shape: the bench queue and the doctor's results inbox.
 * both open the same order screen, which adapts to the role.
 */
export function LabQueueNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="LabQueueList" component={LabQueueScreen} />
      <Stack.Screen name="LabOrder" component={LabOrderScreen} />
      <Stack.Screen name="MedicalRecord" component={MedicalRecordScreen} />
      <Stack.Screen name="PatientDetail" component={PatientDetailScreen} />
    </Stack.Navigator>
  );
}

export function LabResultsNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="LabResultsList" component={LabResultsScreen} />
      <Stack.Screen name="LabOrder" component={LabOrderScreen} />
      <Stack.Screen name="MedicalRecord" component={MedicalRecordScreen} />
      <Stack.Screen name="PatientDetail" component={PatientDetailScreen} />
    </Stack.Navigator>
  );
}
