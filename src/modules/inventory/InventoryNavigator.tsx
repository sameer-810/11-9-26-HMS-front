import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import InventoryScreen from "./screens/InventoryScreen";
import ItemDetailScreen from "./screens/ItemDetailScreen";
import ReceiveStockScreen from "./screens/ReceiveStockScreen";
import IssueStockScreen from "./screens/IssueStockScreen";
import LowStockScreen from "./screens/LowStockScreen";
import StockLedgerScreen from "./screens/StockLedgerScreen";
import { StockModeProvider, type StockMode } from "./StockMode";

const Stack = createNativeStackNavigator();

/** store "inventory" and pharmacy "medicine stock" share these screens; mode is fixed per navigator. */
function makeStockNavigator(mode: StockMode) {
  return function StockNavigator() {
    return (
      <StockModeProvider mode={mode}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="InventoryList" component={InventoryScreen} />
          <Stack.Screen name="InventoryItem" component={ItemDetailScreen} />
          <Stack.Screen name="ReceiveStock" component={ReceiveStockScreen} />
          {mode === "store" ? (
            <Stack.Screen name="IssueStock" component={IssueStockScreen} />
          ) : null}
          <Stack.Screen name="LowStock" component={LowStockScreen} />
          <Stack.Screen name="StockLedger" component={StockLedgerScreen} />
        </Stack.Navigator>
      </StockModeProvider>
    );
  };
}

export const StoreInventoryNavigator = makeStockNavigator("store");
export const PharmacyStockNavigator = makeStockNavigator("pharmacy");
