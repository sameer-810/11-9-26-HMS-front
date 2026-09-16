export type StockLocation = "main_store" | "pharmacy";

export const LOCATION_LABELS: Record<StockLocation, string> = {
  main_store: "Main store",
  pharmacy: "Pharmacy",
};

export type ItemCategory =
  "medicine" | "consumable" | "surgical" | "equipment" | "other";

export type ExpiryStatus = "expired" | "short_dated" | "ok";

export interface LocationStock {
  usable: number;
  expired: number;
  shortDated: number;
  nextExpiry: string | null;
  label: string;
}

export interface InventoryItem {
  id: string;
  code: string;
  name: string;
  category: ItemCategory;
  medicine: {
    id: string;
    name: string;
    genericName: string;
    strength: string;
    form: string;
    schedule: string;
  } | null;
  medicineId: string | null;
  unit: string;
  reorderLevel: number;
  /** Null means not priced — not the same as free. */
  unitPrice: number | null;
  isActive: boolean;
  stock: {
    /** Usable and expired are never added together. */
    totalUsable: number;
    totalExpired: number;
    totalShortDated: number;
    nextExpiry: string | null;
    byLocation: Partial<Record<StockLocation, LocationStock>>;
  };
  low: boolean;
}

export interface StockBatch {
  id: string;
  itemId: string;
  item?: { id: string; code: string; name: string; unit: string };
  location: StockLocation;
  locationLabel: string;
  batchNumber: string;
  expiryDate: string;
  expiryStatus: ExpiryStatus;
  daysToExpiry: number;
  quantityOnHand: number;
  unitCost: number | null;
  /** Section 7: an expired batch cannot be selected, regardless of role. */
  selectable: boolean;
}

export type MovementType =
  | "receipt"
  | "issue"
  | "transfer_out"
  | "transfer_in"
  | "dispense"
  | "disposal";

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  receipt: "Received",
  issue: "Issued",
  transfer_out: "Transferred out",
  transfer_in: "Transferred in",
  dispense: "Dispensed",
  disposal: "Disposed",
};

export interface StockMovement {
  id: string;
  reference: string;
  type: MovementType;
  itemId: string;
  itemCode: string;
  itemName: string;
  batchNumber: string;
  expiryDate: string;
  location: StockLocation;
  locationLabel: string;
  quantityChange: number;
  balanceAfter: number;
  unitCost: number | null;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  departmentName: string;
  receivedByName: string;
  prescriptionNumber: string;
  reason: string;
  performedByName: string;
  at: string;
}

export interface Supplier {
  id: string;
  name: string;
  gstin: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
}

export interface ItemDetail {
  item: InventoryItem;
  batches: StockBatch[];
  movements: StockMovement[];
  today: string;
}

export interface LowStockReport {
  today: string;
  low: InventoryItem[];
  expiring: StockBatch[];
  expired: StockBatch[];
}
