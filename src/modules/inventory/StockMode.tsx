import React, { createContext, useContext } from "react";
import type { StockLocation } from "@modules/inventory/types";

/**
 * Which chair the stock screens are seen from.
 *
 * The same screens serve the store ("Inventory") and the pharmacy ("Medicine
 * stock"). The differences are real — the pharmacy sees and receives into its
 * own shelf only, and does not issue to departments — but small, and three
 * copies of each screen would be three places for a stock rule to be fixed in
 * one and missed in another.
 */
export type StockMode = "store" | "pharmacy";

interface StockModeValue {
  mode: StockMode;
  /** The location the screens are pinned to, or null for all of them. */
  location: StockLocation | null;
  receiveLocations: StockLocation[];
  canIssue: boolean;
}

const StockModeContext = createContext<StockModeValue>({
  mode: "store",
  location: null,
  receiveLocations: ["main_store", "pharmacy"],
  canIssue: true,
});

export function StockModeProvider({ mode, children }: { mode: StockMode; children: React.ReactNode }) {
  const value: StockModeValue =
    mode === "pharmacy"
      ? { mode, location: "pharmacy", receiveLocations: ["pharmacy"], canIssue: false }
      : { mode, location: null, receiveLocations: ["main_store", "pharmacy"], canIssue: true };
  return <StockModeContext.Provider value={value}>{children}</StockModeContext.Provider>;
}

export const useStockMode = () => useContext(StockModeContext);
