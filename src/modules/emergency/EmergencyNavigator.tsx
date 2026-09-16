import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import EmergencyBoardScreen from "./screens/EmergencyBoardScreen";
import RegisterArrivalScreen from "./screens/RegisterArrivalScreen";
import EmergencyVisitScreen from "./screens/EmergencyVisitScreen";
import MedicalRecordScreen from "@modules/consultation/screens/MedicalRecordScreen";

const Stack = createNativeStackNavigator();

/** Emergency stack. MedicalRecord lives here too so opening history keeps the board's place. */
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
