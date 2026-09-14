import { useMemo } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { apiClient, apiErrorMessage } from "@api/apiClient";
import { queryClient } from "@api/queryClient";
import { useAuthStore } from "@shared/store/useAuthStore";
import { useNetworkStore, isNetworkError } from "./network";

/**
 * The offline write queue.
 *
 * ---------------------------------------------------------------------------
 * What may be queued, and why nothing else
 * ---------------------------------------------------------------------------
 * Observations and nursing notes. They are facts about a moment at the
 * bedside, and a fact recorded late is still true. Prescriptions, dispensing,
 * billing, discharge and everything else depend on state this device cannot
 * see — a drug that was stopped an hour ago, stock that ran out, a bill someone
 * else finalised — and replaying them later against a changed world is how a
 * patient gets the wrong drug. Those fail visibly when offline, and that is the
 * design, not a gap. The list is closed: ENDPOINT below is the whole of it.
 *
 * ---------------------------------------------------------------------------
 * Exactly once, in order
 * ---------------------------------------------------------------------------
 * Each write gets its operation id and its charting time BEFORE the first
 * attempt. If that attempt dies on the wire after the server stored it, the
 * queued copy carries the same id, and the server answers the replay with the
 * record it already has. Ops drain oldest first, one at a time, and a new write
 * joins the back of the queue while older ones are still waiting — a chart
 * whose 03:40 set is filed before its 03:10 set tells the wrong story.
 *
 * A write the server REFUSES (a discharged patient, an impossible time) is not
 * retried forever: it is marked failed, kept, and shown to the nurse with its
 * values so it can be re-entered. It never blocks the ops behind it.
 *
 * Ops belong to the user who charted them and survive signing out. They drain
 * only when that user is signed in again — nobody's vitals are filed under
 * someone else's name, and nobody's are thrown away by a logout.
 */

export type OutboxKind = "observation" | "note";

const ENDPOINT: Record<OutboxKind, string> = {
  observation: "/nursing/observations",
  note: "/nursing/notes",
};

export interface OutboxOp {
  id: string;
  kind: OutboxKind;
  userId: string;
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
        set((s) => ({ ops: s.ops.map((o) => (o.id === id ? { ...o, status: "failed", error } : o)) })),
      retry: (id) =>
        set((s) => ({ ops: s.ops.map((o) => (o.id === id ? { ...o, status: "pending", error: undefined } : o)) })),
      discard: (id) => set((s) => ({ ops: s.ops.filter((o) => o.id !== id) })),
      attempt: (id) =>
        set((s) => ({ ops: s.ops.map((o) => (o.id === id ? { ...o, attempts: o.attempts + 1 } : o)) })),
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

const currentUserId = () => useAuthStore.getState().user?.id ?? null;

/** The signed-in user's ops. Filtered in a memo — a selector returning a new array would re-render forever. */
export function useMyOps(): OutboxOp[] {
  const ops = useOutbox((s) => s.ops);
  const userId = useAuthStore((s) => s.user?.id);
  return useMemo(() => ops.filter((o) => o.userId === userId), [ops, userId]);
}

export type SendResult<T> = { status: "sent"; data: T } | { status: "queued"; op: OutboxOp };

/**
 * Send a queueable write now, or keep it on this device.
 *
 * `send` receives the payload with the operation id and charting time already
 * stamped, so the online attempt and any queued replay are the same operation.
 */
export async function sendOrQueue<B extends object, T>(
  kind: OutboxKind,
  meta: { admissionId: string; label: string },
  body: B,
  send: (payload: B & { clientOpId: string; takenAt: string }) => Promise<T>,
): Promise<SendResult<T>> {
  const userId = currentUserId();
  const id = newOpId();
  const takenAt = new Date().toISOString();
  const payload = { ...body, clientOpId: id, takenAt };

  const queue = (): SendResult<T> => {
    const op: OutboxOp = {
      id,
      kind,
      userId: userId ?? "",
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

  const waiting = useOutbox.getState().ops.some((o) => o.userId === userId && o.status === "pending");
  if (userId && (!useNetworkStore.getState().online || waiting)) return queue();

  try {
    return { status: "sent", data: await send(payload) };
  } catch (err) {
    if (userId && isNetworkError(err)) return queue();
    throw err;
  }
}

let draining: Promise<number> | null = null;

/** Send this user's waiting ops, oldest first. Resolves with how many were filed. */
export function drainOutbox(): Promise<number> {
  if (draining) return draining;
  draining = (async () => {
    const userId = currentUserId();
    if (!userId || !useNetworkStore.getState().online) return 0;

    const store = useOutbox.getState();
    const batch = store.ops.filter((o) => o.userId === userId && o.status === "pending");
    if (batch.length === 0) return 0;

    store.setSyncing(true);
    let filed = 0;
    let stopped = false;
    const touched = new Set<string>();

    try {
      for (const op of batch) {
        useOutbox.getState().attempt(op.id);
        try {
          await apiClient.post(ENDPOINT[op.kind], { ...op.body, clientOpId: op.id, takenAt: op.takenAt });
          useOutbox.getState().settle(op.id);
          filed += 1;
          touched.add(op.admissionId);
        } catch (err) {
          const status = (err as { response?: { status?: number } })?.response?.status;
          // No answer, or a session that needs signing in again: stop and keep
          // everything, in order, for the next attempt.
          if (isNetworkError(err) || status === 401) {
            stopped = true;
            break;
          }
          useOutbox.getState().fail(op.id, apiErrorMessage(err, "The server could not file this entry."));
          touched.add(op.admissionId);
        }
      }
    } finally {
      useOutbox.getState().setSyncing(false);
      if (filed > 0) useOutbox.getState().markSynced();
      for (const admissionId of touched) {
        for (const key of ["bedside", "observations", "nursing-notes", "admission"]) {
          void queryClient.invalidateQueries({ queryKey: [key, admissionId] });
        }
      }
      if (touched.size > 0) {
        void queryClient.invalidateQueries({ queryKey: ["escalations"] });
        void queryClient.invalidateQueries({ queryKey: ["my-ward-patients"] });
      }
    }

    // Anything charted while this batch was sending goes out straight after.
    const more = useOutbox.getState().ops.some((o) => o.userId === userId && o.status === "pending");
    if (more && !stopped) setTimeout(() => void drainOutbox(), 0);
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
  const unsubscribeHydration = useOutbox.persist.onFinishHydration(() => void drainOutbox());
  const timer = setInterval(() => {
    const userId = currentUserId();
    const waiting = useOutbox.getState().ops.some((o) => o.userId === userId && o.status === "pending");
    if (waiting && useNetworkStore.getState().online) void drainOutbox();
  }, 20_000);
  void drainOutbox();

  return () => {
    unsubscribeNetwork();
    unsubscribeHydration();
    clearInterval(timer);
  };
}
