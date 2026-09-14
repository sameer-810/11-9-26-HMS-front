import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import PharmacyQueueScreen from "./screens/PharmacyQueueScreen";
import DispenseScreen from "./screens/DispenseScreen";

const Stack = createNativeStackNavigator();

/** Queue → dispense → back to the queue. One stack, so the pharmacist never loses their place. */
export default function PharmacyNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PharmacyQueueList" component={PharmacyQueueScreen} />
      <Stack.Screen name="Dispense" component={DispenseScreen} />
    </Stack.Navigator>
  );
}
