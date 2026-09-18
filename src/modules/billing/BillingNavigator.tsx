import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import BillsScreen from "./screens/BillsScreen";
import GenerateBillScreen from "./screens/GenerateBillScreen";
import BillDetailScreen from "./screens/BillDetailScreen";
import ReceiptScreen from "./screens/ReceiptScreen";
import OutstandingScreen from "./screens/OutstandingScreen";
import RefundSlipScreen from "./screens/RefundSlipScreen";

const Stack = createNativeStackNavigator();

/** Billing stack. RecordPayment (`/billing/payment/:billId`) reuses the bill screen's payment form. */
export default function BillingNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="BillsList" component={BillsScreen} />
      <Stack.Screen name="GenerateBill" component={GenerateBillScreen} />
      <Stack.Screen name="BillDetail" component={BillDetailScreen} />
      <Stack.Screen name="RecordPayment" component={BillDetailScreen} />
      <Stack.Screen name="Receipt" component={ReceiptScreen} />
      <Stack.Screen name="RefundSlip" component={RefundSlipScreen} />
      <Stack.Screen name="Outstanding" component={OutstandingScreen} />
    </Stack.Navigator>
  );
}
