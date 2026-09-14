import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { laboratoryApi, type OrderTestsBody } from "@modules/laboratory/api/laboratoryApi";
import type { LabOrder, LabStatus, LabUrgency } from "@modules/laboratory/types";

/**
 * Anything that changes an order can change: the queue, the doctor's inbox,
 * the patient's record, the consultation context, and the dashboard counts.
 * Invalidated together, so no screen shows a stage the order has left.
 */
function invalidateLab(qc: ReturnType<typeof useQueryClient>, order?: Pick<LabOrder, "id" | "patient">) {
  qc.invalidateQueries({ queryKey: ["lab-queue"] });
  qc.invalidateQueries({ queryKey: ["lab-inbox"] });
  qc.invalidateQueries({ queryKey: ["dashboard"] });
  qc.invalidateQueries({ queryKey: ["medical-record"] });
  qc.invalidateQueries({ queryKey: ["clinical-context"] });
  if (order) qc.setQueryData(["lab-order", order.id], order);
}

export const useLabTests = (search?: string) =>
  useQuery({
    queryKey: ["lab-tests", search ?? ""],
    queryFn: () => laboratoryApi.tests(search ? { search } : {}),
    staleTime: 5 * 60_000,
  });

export const useOrderTests = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OrderTestsBody) => laboratoryApi.order(body),
    onSuccess: () => invalidateLab(qc),
  });
};

export const useCancelLabOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => laboratoryApi.cancel(id, reason),
    onSuccess: (order) => invalidateLab(qc, order),
  });
};

/**
 * LB-02. Left open on a bench screen all shift, so it refetches itself.
 * Every 30 seconds: a stat request should not wait a minute to appear.
 */
export const useLabQueue = (params: { status?: LabStatus; urgency?: LabUrgency; search?: string }) =>
  useQuery({
    queryKey: ["lab-queue", params],
    queryFn: () => laboratoryApi.queue(params),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

export const useLabOrder = (id?: string) =>
  useQuery({
    queryKey: ["lab-order", id],
    queryFn: () => laboratoryApi.get(id!),
    enabled: Boolean(id),
    // A second technician may have moved it. The server refuses a stale
    // transition anyway; not showing a stale stage avoids the attempt.
    staleTime: 0,
  });

export const useAdvanceLabOrder = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ to, note }: { to: LabStatus; note?: string }) => laboratoryApi.advance(id, to, note),
    onSuccess: (order) => invalidateLab(qc, order),
    onError: () => qc.invalidateQueries({ queryKey: ["lab-order", id] }),
  });
};

export const useRejectSample = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => laboratoryApi.rejectSample(id, reason),
    onSuccess: (order) => invalidateLab(qc, order),
  });
};

export const useSaveResults = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ values, labComment }: { values: Record<string, string>; labComment?: string }) =>
      laboratoryApi.saveResults(id, values, labComment),
    onSuccess: (data) => invalidateLab(qc, data.order),
  });
};

export const useAcknowledgeCritical = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => laboratoryApi.acknowledge(id, note),
    onSuccess: (order) => invalidateLab(qc, order),
  });
};

export const useRecordCriticalCall = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { to: string; method: "phone" | "in_person"; readBack: boolean; note?: string }) =>
      laboratoryApi.recordCall(id, body),
    onSuccess: (order) => invalidateLab(qc, order),
  });
};

export const useReviewLabResult = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => laboratoryApi.review(id),
    onSuccess: (order) => invalidateLab(qc, order),
  });
};

/**
 * LB-05: the doctor's results. Refetched often, because an unacknowledged
 * critical result is exactly the thing that must not wait for a refresh.
 */
export const useLabInbox = (scope?: "mine" | "all") =>
  useQuery({
    queryKey: ["lab-inbox", scope ?? "default"],
    queryFn: () => laboratoryApi.inbox(scope ? { scope } : {}),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
