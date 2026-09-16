import { apiClient } from "@api/apiClient";
import type {
  InventoryItem,
  ItemDetail,
  ItemCategory,
  LowStockReport,
  StockLocation,
  StockMovement,
  MovementType,
  Supplier,
} from "@modules/inventory/types";

export interface ReceiveBody {
  location: StockLocation;
  supplierId: string;
  invoiceNumber: string;
  invoiceDate?: string;
  lines: {
    itemId: string;
    batchNumber: string;
    /** As printed on the pack: "03/2027" or "2027-03-31". The server parses it. */
    expiry: string;
    quantity: number;
    unitCost?: number;
  }[];
}

export interface IssueBody {
  fromLocation: StockLocation;
  destination:
    { type: "department"; departmentId: string } | { type: "pharmacy" };
  receivedByName: string;
  note?: string;
  lines: { itemId?: string; batchId: string; quantity: number }[];
}

export const inventoryApi = {
  items: async (
    params: {
      search?: string;
      category?: ItemCategory;
      location?: StockLocation;
      lowOnly?: boolean;
    } = {},
  ) => {
    const res = await apiClient.get<{
      data: InventoryItem[];
      meta: { today: string };
    }>("/inventory/items", {
      params: { ...params, lowOnly: params.lowOnly ? "true" : undefined },
    });
    return res.data;
  },

  item: async (id: string) => {
    const res = await apiClient.get<{ data: ItemDetail }>(
      `/inventory/items/${id}`,
    );
    return res.data.data;
  },

  createItem: async (body: {
    code: string;
    name: string;
    category?: ItemCategory;
    medicineId?: string;
    unit: string;
    reorderLevel: number;
  }) => {
    const res = await apiClient.post<{ data: InventoryItem }>(
      "/inventory/items",
      body,
    );
    return res.data.data;
  },

  /** no quantity field: stock moves only through recorded events, and the server refuses one. */
  updateItem: async (
    id: string,
    patch: {
      name?: string;
      unit?: string;
      reorderLevel?: number;
      isActive?: boolean;
      unitPrice?: number | null;
    },
  ) => {
    const res = await apiClient.patch<{ data: InventoryItem }>(
      `/inventory/items/${id}`,
      patch,
    );
    return res.data.data;
  },

  suppliers: async (search?: string) => {
    const res = await apiClient.get<{ data: Supplier[] }>(
      "/inventory/suppliers",
      { params: search ? { search } : {} },
    );
    return res.data.data;
  },

  createSupplier: async (body: {
    name: string;
    gstin?: string;
    contactName?: string;
    phone?: string;
  }) => {
    const res = await apiClient.post<{ data: Supplier }>(
      "/inventory/suppliers",
      body,
    );
    return res.data.data;
  },

  receive: async (body: ReceiveBody) => {
    const res = await apiClient.post<{
      data: {
        reference: string;
        movements: StockMovement[];
        warnings: string[];
      };
    }>("/inventory/receipts", body);
    return res.data.data;
  },

  issue: async (body: IssueBody) => {
    const res = await apiClient.post<{
      data: { reference: string; movements: StockMovement[] };
    }>("/inventory/issues", body);
    return res.data.data;
  },

  dispose: async (body: {
    batchId: string;
    quantity: number;
    reason: string;
  }) => {
    const res = await apiClient.post<{
      data: { reference: string; movement: StockMovement };
    }>("/inventory/disposals", body);
    return res.data.data;
  },

  lowStock: async () => {
    const res = await apiClient.get<{ data: LowStockReport }>(
      "/inventory/low-stock",
    );
    return res.data.data;
  },

  movements: async (
    params: {
      itemId?: string;
      type?: MovementType;
      reference?: string;
      page?: number;
      limit?: number;
    } = {},
  ) => {
    const res = await apiClient.get<{
      data: StockMovement[];
      meta: {
        total: number;
        totalCapped?: boolean;
        page: number;
        totalPages: number;
      };
    }>("/inventory/movements", { params });
    return res.data;
  },
};
