import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import EmergencyBoardScreen from "./screens/EmergencyBoardScreen";
import RegisterArrivalScreen from "./screens/RegisterArrivalScreen";
import EmergencyVisitScreen from "./screens/EmergencyVisitScreen";
import MedicalRecordScreen from "@modules/consultation/screens/MedicalRecordScreen";

const Stack = createNativeStackNavigator();

/**
 * Board → arrival → attendance, in one stack. The record is registered here too
 * so checking a past history mid-resuscitation does not cost the doctor their
 * place on the board.
 */
export default function EmergencyNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="EmergencyBoard" component={EmergencyBoardScreen} />
      <Stack.Screen name="RegisterArrival" component={RegisterArrivalScreen} />
      <Stack.Screen name="EmergencyVisit" component={EmergencyVisitScreen} />
      <Stack.Screen name="MedicalRecord" component={MedicalRecordScreen} />
    </Stack.Navigator>
  );
}
