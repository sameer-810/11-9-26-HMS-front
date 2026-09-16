import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { billingApi, type PaymentBody } from "@modules/billing/api/billingApi";
import type { Bill, BillStatus, BillType } from "@modules/billing/types";

/**
 * Anything that changes a bill can change: the bill itself, the bill list,
 * the outstanding report, the patient's unbilled preview and the dashboard.
 */
function useBillMutation<T>(fn: (arg: T) => Promise<Bill>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (bill) => {
      qc.setQueryData(["bill", bill.id], bill);
      for (const key of [
        "bills",
        "outstanding",
        "billing-preview",
        "dashboard",
      ]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
    },
    // A refusal usually means the bill moved on — finalised, paid, a discount
    // decided elsewhere. Reload it so the screen shows the truth.
    onError: () => qc.invalidateQueries({ queryKey: ["bill"] }),
  });
}

export const useBills = (params: {
  status?: BillStatus;
  search?: string;
  page?: number;
}) =>
  useQuery({
    queryKey: ["bills", params],
    queryFn: () => billingApi.list({ ...params, limit: 30 }),
  });

export const useBill = (id?: string) =>
  useQuery({
    queryKey: ["bill", id],
    queryFn: () => billingApi.get(id!),
    enabled: Boolean(id),
    staleTime: 0,
  });

export const useBillingPreview = (patientId?: string) =>
  useQuery({
    queryKey: ["billing-preview", patientId],
    queryFn: () => billingApi.preview(patientId!),
    enabled: Boolean(patientId),
    staleTime: 0,
  });

export const useGenerateBill = () =>
  useBillMutation(
    (body: { patientId: string; billType: BillType; admissionId?: string }) =>
      billingApi.generate(body),
  );

export const useRefreshBill = (id: string) =>
  useBillMutation(() => billingApi.refresh(id));
export const useAddService = (id: string) =>
  useBillMutation((body: { tariffId: string; quantity: number }) =>
    billingApi.addService(id, body),
  );
export const useRemoveLine = (id: string) =>
  useBillMutation(({ lineId, reason }: { lineId: string; reason: string }) =>
    billingApi.removeLine(id, lineId, reason),
  );
export const useRequestDiscount = (id: string) =>
  useBillMutation((body: { amount: number; reason: string }) =>
    billingApi.requestDiscount(id, body),
  );
export const useDecideDiscount = (id: string) =>
  useBillMutation((body: { approve: boolean; note?: string }) =>
    billingApi.decideDiscount(id, body),
  );
export const useFinaliseBill = (id: string) =>
  useBillMutation(() => billingApi.finalise(id));
export const useCancelBill = (id: string) =>
  useBillMutation((reason: string) => billingApi.cancel(id, reason));
export const useRecordPayment = (id: string) =>
  useBillMutation((body: PaymentBody) => billingApi.pay(id, body));
export const useVoidPayment = () =>
  useBillMutation(
    ({ paymentId, reason }: { paymentId: string; reason: string }) =>
      billingApi.voidPayment(paymentId, reason),
  );

export const useReceipt = (paymentId?: string) =>
  useQuery({
    queryKey: ["receipt", paymentId],
    queryFn: () => billingApi.receipt(paymentId!),
    enabled: Boolean(paymentId),
  });

export const useOutstanding = () =>
  useQuery({
    queryKey: ["outstanding"],
    queryFn: billingApi.outstanding,
    refetchOnWindowFocus: true,
  });

export const useTariff = () =>
  useQuery({
    queryKey: ["tariff"],
    queryFn: billingApi.tariff,
    staleTime: 5 * 60_000,
  });
