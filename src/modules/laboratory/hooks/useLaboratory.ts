import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  laboratoryApi,
  type OrderTestsBody,
} from "@modules/laboratory/api/laboratoryApi";
import type {
  LabOrder,
  LabStatus,
  LabUrgency,
} from "@modules/laboratory/types";

/** an order change can move the queue, inbox, record, consultation context and dashboard,
 *  so all are invalidated together. */
function invalidateLab(
  qc: ReturnType<typeof useQueryClient>,
  order?: Pick<LabOrder, "id" | "patient">,
) {
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
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      laboratoryApi.cancel(id, reason),
    onSuccess: (order) => invalidateLab(qc, order),
  });
};

/** left open on a bench all shift, so it refetches every 30s for stat requests. */
export const useLabQueue = (params: {
  status?: LabStatus;
  urgency?: LabUrgency;
  search?: string;
}) =>
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
    // a second technician may have moved it; showing a stale stage invites a refused transition.
    staleTime: 0,
  });

export const useAdvanceLabOrder = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ to, note }: { to: LabStatus; note?: string }) =>
      laboratoryApi.advance(id, to, note),
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
    mutationFn: ({
      values,
      labComment,
    }: {
      values: Record<string, string>;
      labComment?: string;
    }) => laboratoryApi.saveResults(id, values, labComment),
    onSuccess: (data) => invalidateLab(qc, data.order),
  });
};

export const useAcknowledgeCritical = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      laboratoryApi.acknowledge(id, note),
    onSuccess: (order) => invalidateLab(qc, order),
  });
};

export const useRecordCriticalCall = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      to: string;
      method: "phone" | "in_person";
      readBack: boolean;
      note?: string;
    }) => laboratoryApi.recordCall(id, body),
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

/** the doctor's results; refetched often, as an unacknowledged critical must not wait. */
export const useLabInbox = (scope?: "mine" | "all") =>
  useQuery({
    queryKey: ["lab-inbox", scope ?? "default"],
    queryFn: () => laboratoryApi.inbox(scope ? { scope } : {}),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
