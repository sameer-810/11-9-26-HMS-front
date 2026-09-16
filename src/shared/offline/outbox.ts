import { useMemo } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { isCancel } from "axios";

import { apiClient, apiErrorMessage } from "@api/apiClient";
import { queryClient } from "@api/queryClient";
import { useAuthStore } from "@shared/store/useAuthStore";
import { useNetworkStore, isNetworkError } from "./network";
import {
  belongsTo,
  ownerOf,
  sameOwner,
  type OutboxOwner,
} from "./outboxOwnership";

/**
 * Offline write queue. Ops drain oldest first and are idempotent via their op id;
 * they belong to their author, survive sign-out and drain only for that user.
 */
export type OutboxKind = "observation" | "note";

// Closed list: other writes depend on server state and must fail visibly when offline.
const ENDPOINT: Record<OutboxKind, string> = {
  observation: "/nursing/observations",
  note: "/nursing/notes",
};

export interface OutboxOp {
  id: string;
  kind: OutboxKind;
  userId: string;
  /** Optional only because ops queued before it was recorded lack it. */
  hospitalId?: string;
  admissionId: string;
  /** Who and what, for the status strip and the failure list. */
  label: string;
  body: Record<string, unknown>;
  takenAt: string;
  queuedAt: string;
  attempts: number;
  status: "pending" | "failed";
  error?: string;
}

interface OutboxState {
  ops: OutboxOp[];
  syncing: boolean;
  lastSyncedAt: string | null;
  enqueue: (op: OutboxOp) => void;
  settle: (id: string) => void;
  fail: (id: string, error: string) => void;
  retry: (id: string) => void;
  discard: (id: string) => void;
  attempt: (id: string) => void;
  setSyncing: (syncing: boolean) => void;
  markSynced: () => void;
}

export const useOutbox = create<OutboxState>()(
  persist(
    (set) => ({
      ops: [],
      syncing: false,
      lastSyncedAt: null,
      enqueue: (op) => set((s) => ({ ops: [...s.ops, op] })),
      settle: (id) => set((s) => ({ ops: s.ops.filter((o) => o.id !== id) })),
      fail: (id, error) =>
        set((s) => ({
          ops: s.ops.map((o) =>
            o.id === id ? { ...o, status: "failed", error } : o,
          ),
        })),
      retry: (id) =>
        set((s) => ({
          ops: s.ops.map((o) =>
            o.id === id ? { ...o, status: "pending", error: undefined } : o,
          ),
        })),
      discard: (id) => set((s) => ({ ops: s.ops.filter((o) => o.id !== id) })),
      attempt: (id) =>
        set((s) => ({
          ops: s.ops.map((o) =>
            o.id === id ? { ...o, attempts: o.attempts + 1 } : o,
          ),
        })),
      setSyncing: (syncing) => set({ syncing }),
      markSynced: () => set({ lastSyncedAt: new Date().toISOString() }),
    }),
    {
      name: "hms-outbox",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ ops: s.ops, lastSyncedAt: s.lastSyncedAt }),
    },
  ),
);

/** An operation id, generated once per write and never reused. */
export function newOpId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const currentOwner = (): OutboxOwner | null =>
  ownerOf(useAuthStore.getState().user);

const pendingFor = (owner: OutboxOwner | null) =>
  useOutbox
    .getState()
    .ops.some((o) => o.status === "pending" && belongsTo(o, owner));

/** The signed-in user's ops. Filtered in a memo — a selector returning a new array would re-render forever. */
export function useMyOps(): OutboxOp[] {
  const ops = useOutbox((s) => s.ops);
  const userId = useAuthStore((s) => s.user?.id);
  const hospitalId = useAuthStore((s) => s.user?.hospitalId);
  return useMemo(() => {
    const owner = ownerOf({ id: userId, hospitalId });
    return ops.filter((o) => belongsTo(o, owner));
  }, [ops, userId, hospitalId]);
}

export type SendResult<T> =
  { status: "sent"; data: T } | { status: "queued"; op: OutboxOp };

/**
 * Send a queueable write now, or queue it. The op id and charting time are stamped
 * first, so the online attempt and any replay are the same operation.
 */
export async function sendOrQueue<B extends object, T>(
  kind: OutboxKind,
  meta: { admissionId: string; label: string },
  body: B,
  send: (payload: B & { clientOpId: string; takenAt: string }) => Promise<T>,
): Promise<SendResult<T>> {
  const owner = currentOwner();
  const id = newOpId();
  const takenAt = new Date().toISOString();
  const payload = { ...body, clientOpId: id, takenAt };

  const queue = (o: OutboxOwner): SendResult<T> => {
    const op: OutboxOp = {
      id,
      kind,
      userId: o.userId,
      hospitalId: o.hospitalId,
      admissionId: meta.admissionId,
      label: meta.label,
      body: body as unknown as Record<string, unknown>,
      takenAt,
      queuedAt: new Date().toISOString(),
      attempts: 0,
      status: "pending",
    };
    useOutbox.getState().enqueue(op);
    if (useNetworkStore.getState().online) void drainOutbox();
    return { status: "queued", op };
  };

  if (owner && (!useNetworkStore.getState().online || pendingFor(owner)))
    return queue(owner);

  try {
    return { status: "sent", data: await send(payload) };
  } catch (err) {
    if (owner && isNetworkError(err)) return queue(owner);
    throw err;
  }
}

let draining: Promise<number> | null = null;

/** Send this user's waiting ops, oldest first. Resolves with how many were filed. */
export function drainOutbox(): Promise<number> {
  if (draining) return draining;
  draining = (async () => {
    const owner = currentOwner();
    if (!owner || !useNetworkStore.getState().online) return 0;

    const store = useOutbox.getState();
    const batch = store.ops.filter(
      (o) => o.status === "pending" && belongsTo(o, owner),
    );
    if (batch.length === 0) return 0;

    store.setSyncing(true);
    let filed = 0;
    let stopped = false;
    const touched = new Set<string>();

    try {
      for (const op of batch) {
        // Owner signed out mid-batch: the rest waits rather than sending on another session.
        if (!sameOwner(owner, currentOwner())) {
          stopped = true;
          break;
        }
        useOutbox.getState().attempt(op.id);
        try {
          await apiClient.post(ENDPOINT[op.kind], {
            ...op.body,
            clientOpId: op.id,
            takenAt: op.takenAt,
          });
          useOutbox.getState().settle(op.id);
          filed += 1;
          touched.add(op.admissionId);
        } catch (err) {
          const status = (err as { response?: { status?: number } })?.response
            ?.status;
          // Network error, 401 or cancelled request is not a refusal: stop and keep
          // the rest in order for the next attempt.
          if (isNetworkError(err) || isCancel(err) || status === 401) {
            stopped = true;
            break;
          }
          useOutbox
            .getState()
            .fail(
              op.id,
              apiErrorMessage(err, "The server could not file this entry."),
            );
          touched.add(op.admissionId);
        }
      }
    } finally {
      useOutbox.getState().setSyncing(false);
      if (filed > 0) useOutbox.getState().markSynced();
      for (const admissionId of touched) {
        for (const key of [
          "bedside",
          "observations",
          "nursing-notes",
          "admission",
        ]) {
          void queryClient.invalidateQueries({ queryKey: [key, admissionId] });
        }
      }
      if (touched.size > 0) {
        void queryClient.invalidateQueries({ queryKey: ["escalations"] });
        void queryClient.invalidateQueries({ queryKey: ["my-ward-patients"] });
      }
    }

    // Anything charted while this batch was sending goes out straight after.
    if (pendingFor(owner) && !stopped) setTimeout(() => void drainOutbox(), 0);
    return filed;
  })().finally(() => {
    draining = null;
  });
  return draining;
}

/** Drains on start, on reconnection, and every 20 seconds while anything waits. */
export function startOutboxSync(): () => void {
  const unsubscribeNetwork = useNetworkStore.subscribe((state, prev) => {
    if (state.online && !prev.online) void drainOutbox();
  });
  const unsubscribeHydration = useOutbox.persist.onFinishHydration(
    () => void drainOutbox(),
  );
  const timer = setInterval(() => {
    if (pendingFor(currentOwner()) && useNetworkStore.getState().online)
      void drainOutbox();
  }, 20_000);
  void drainOutbox();

  return () => {
    unsubscribeNetwork();
    unsubscribeHydration();
    clearInterval(timer);
  };
}
