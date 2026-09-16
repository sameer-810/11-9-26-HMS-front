import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { inventoryApi, type IssueBody, type ReceiveBody } from "@modules/inventory/api/inventoryApi";
import type { ItemCategory, MovementType, StockLocation } from "@modules/inventory/types";

/** a movement can change stock, batches, low-stock, the ledger, pharmacy availability and the
 *  dashboard, so all are invalidated together. */
function invalidateStock(qc: ReturnType<typeof useQueryClient>) {
  for (const key of ["inventory-items", "inventory-item", "low-stock", "stock-movements", "pharmacy-queue", "dispense-context", "dashboard"]) {
    qc.invalidateQueries({ queryKey: [key] });
  }
}

export const useInventoryItems = (params: { search?: string; category?: ItemCategory; location?: StockLocation; lowOnly?: boolean } = {}) =>
  useQuery({
    queryKey: ["inventory-items", params],
    queryFn: () => inventoryApi.items(params),
    refetchOnWindowFocus: true,
  });

export const useInventoryItem = (id?: string) =>
  useQuery({
    queryKey: ["inventory-item", id],
    queryFn: () => inventoryApi.item(id!),
    enabled: Boolean(id),
    staleTime: 0,
  });

export const useSuppliers = () => useQuery({ queryKey: ["suppliers"], queryFn: () => inventoryApi.suppliers() });

export const useCreateSupplier = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: inventoryApi.createSupplier,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });
};

export const useCreateItem = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: inventoryApi.createItem, onSuccess: () => invalidateStock(qc) });
};

export const useUpdateItem = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Parameters<typeof inventoryApi.updateItem>[1]) => inventoryApi.updateItem(id, patch),
    onSuccess: () => invalidateStock(qc),
  });
};

export const useReceiveStock = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: ReceiveBody) => inventoryApi.receive(body), onSuccess: () => invalidateStock(qc) });
};

export const useIssueStock = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: IssueBody) => inventoryApi.issue(body),
    onSuccess: () => invalidateStock(qc),
    // a refusal usually means someone else took the stock; refetch so batches show what is left.
    onError: () => invalidateStock(qc),
  });
};

export const useDisposeStock = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: inventoryApi.dispose, onSuccess: () => invalidateStock(qc) });
};

export const useLowStock = () =>
  useQuery({ queryKey: ["low-stock"], queryFn: inventoryApi.lowStock, refetchOnWindowFocus: true });

export const useStockMovements = (params: { itemId?: string; type?: MovementType; page?: number } = {}) =>
  useQuery({ queryKey: ["stock-movements", params], queryFn: () => inventoryApi.movements({ ...params, limit: 50 }) });
