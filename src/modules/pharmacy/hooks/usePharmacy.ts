import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { pharmacyApi, type DispenseBody } from "@modules/pharmacy/api/pharmacyApi";

/** PH-01. Left open at the counter all day, so it refetches itself. */
export const usePharmacyQueue = (params: { urgency?: string; search?: string } = {}) =>
  useQuery({
    queryKey: ["pharmacy-queue", params],
    queryFn: () => pharmacyApi.queue(params),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

/**
 * The dispensing screen's data.
 *
 * Zero stale time. The allergy list and the stock both change under this
 * screen — a colleague records an allergy, someone takes the last box — and a
 * cached context is exactly what the server's fingerprint check exists to
 * catch.
 */
export const useDispenseContext = (prescriptionId?: string) =>
  useQuery({
    queryKey: ["dispense-context", prescriptionId],
    queryFn: () => pharmacyApi.context(prescriptionId!),
    enabled: Boolean(prescriptionId),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

export const useDispense = (prescriptionId: string) => {
  const qc = useQueryClient();
  const refresh = () => {
    for (const key of ["dispense-context", "pharmacy-queue", "inventory-items", "inventory-item", "low-stock", "stock-movements", "medical-record", "dashboard", "dispensings"]) {
      qc.invalidateQueries({ queryKey: [key] });
    }
  };
  return useMutation({
    mutationFn: (body: DispenseBody) => pharmacyApi.dispense(prescriptionId, body),
    onSuccess: refresh,
    // A refusal for changed allergies or taken stock means the screen is out of
    // date. Reload it so what the pharmacist sees next is the truth.
    onError: refresh,
  });
};

export const useDispensings = (prescriptionId?: string) =>
  useQuery({
    queryKey: ["dispensings", prescriptionId],
    queryFn: () => pharmacyApi.dispensings(prescriptionId!),
    enabled: Boolean(prescriptionId),
  });
