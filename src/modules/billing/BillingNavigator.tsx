import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import BillsScreen from "./screens/BillsScreen";
import GenerateBillScreen from "./screens/GenerateBillScreen";
import BillDetailScreen from "./screens/BillDetailScreen";
import ReceiptScreen from "./screens/ReceiptScreen";
import OutstandingScreen from "./screens/OutstandingScreen";

const Stack = createNativeStackNavigator();

/**
 * Bills → generate → bill → payment → receipt, in one stack. The spec's
 * `/billing/payment/:billId` is the bill screen, where the payment form lives
 * beside the balance it changes.
 */
export default function BillingNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="BillsList" component={BillsScreen} />
      <Stack.Screen name="GenerateBill" component={GenerateBillScreen} />
      <Stack.Screen name="BillDetail" component={BillDetailScreen} />
      <Stack.Screen name="RecordPayment" component={BillDetailScreen} />
      <Stack.Screen name="Receipt" component={ReceiptScreen} />
      <Stack.Screen name="Outstanding" component={OutstandingScreen} />
    </Stack.Navigator>
  );
}
