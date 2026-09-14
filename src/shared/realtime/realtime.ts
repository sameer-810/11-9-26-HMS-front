import { io } from "socket.io-client";
import { create } from "zustand";

import { environment } from "@config/env";
import { queryClient } from "@api/queryClient";
import { useNetworkStore } from "@shared/offline/network";
import { drainOutbox } from "@shared/offline/outbox";

/**
 * Live updates from the server.
 *
 * The server decides who hears what — every event goes to a user, or to a role
 * within one hospital, never globally (config/socket.js). This side does two
 * things with an event: refetch the screens it affects, and, for the few that
 * need someone to act, show an alert that stays until it is dismissed.
 *
 * Events carry ids, not clinical detail. The alert says "a critical result is
 * waiting" and the screen it points to fetches the rest under the reader's own
 * permissions — a socket message is not a way round the record's access rules.
 *
 * The socket is a convenience, never the source of truth: every screen it
 * refreshes also refreshes on its own interval, so a blocked socket costs
 * seconds, not an alert.
 */

export interface RealtimeAlert {
  id: string;
  tone: "danger" | "warning" | "info";
  title: string;
  message: string;
}

interface AlertsState {
  alerts: RealtimeAlert[];
  push: (alert: Omit<RealtimeAlert, "id">) => void;
  dismiss: (id: string) => void;
}

export const useRealtimeAlerts = create<AlertsState>((set) => ({
  alerts: [],
  push: (alert) =>
    set((s) => ({
      alerts: [{ ...alert, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }, ...s.alerts].slice(0, 3),
    })),
  dismiss: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
}));

type Payload = Record<string, unknown> | undefined;

interface Rule {
  /** Query families to refetch. */
  refresh: string[];
  alert?: (payload: Payload) => Omit<RealtimeAlert, "id">;
}

export const REALTIME_EVENTS: Record<string, Rule> = {
  "lab:critical": {
    refresh: ["lab-inbox", "medical-record", "dashboard-summary"],
    alert: () => ({
      tone: "danger",
      title: "Critical laboratory result",
      message: "A critical result is waiting for acknowledgement in Lab reports.",
    }),
  },
  "lab:reported": { refresh: ["lab-inbox", "lab-order", "medical-record"] },
  "lab:queue-changed": { refresh: ["lab-queue"] },
  "queue:changed": { refresh: ["opd-queue", "my-schedule"] },
  "appointment:booked": { refresh: ["my-schedule", "opd-queue", "appointments"] },
  "roster:conflict": {
    refresh: ["appointments"],
    alert: () => ({
      tone: "warning",
      title: "Roster conflict",
      message: "A booked appointment conflicts with a doctor's changed roster. Check Appointments.",
    }),
  },
  "ed:ambulance": {
    refresh: ["ed-board", "dashboard-summary"],
    alert: (p) => ({
      tone: "warning",
      title: "Ambulance arrival",
      message: `${typeof p?.visitNumber === "string" ? p.visitNumber : "An ambulance arrival"} has been registered in the emergency department.`,
    }),
  },
  "ed:high-acuity": {
    refresh: ["ed-board", "dashboard-summary"],
    alert: (p) => ({
      tone: "danger",
      title: typeof p?.esiLevel === "number" ? `ESI ${p.esiLevel} patient` : "High-acuity patient",
      message: "A high-acuity patient has been triaged in the emergency department.",
    }),
  },
  "access:break-glass": {
    refresh: ["access-grants", "audit"],
    alert: (p) => ({
      tone: "warning",
      title: "Emergency access used",
      message: `${typeof p?.userName === "string" ? p.userName : "A clinician"} opened a restricted record. It is waiting in the review queue.`,
    }),
  },
};

/** Connects for the signed-in user. Returns a stop function. */
export function startRealtime(token: string): () => void {
  const socket = io(environment.socketUrl, {
    auth: { token },
    // Reconnecting forever is right for a ward screen, but not every second
    // against a server that is down.
    reconnectionDelayMax: 30_000,
  });

  socket.on("connect", () => {
    useNetworkStore.getState().setOnline(true);
    void drainOutbox();
  });

  for (const [event, rule] of Object.entries(REALTIME_EVENTS)) {
    socket.on(event, (payload: Payload) => {
      for (const key of rule.refresh) void queryClient.invalidateQueries({ queryKey: [key] });
      if (rule.alert) useRealtimeAlerts.getState().push(rule.alert(payload));
    });
  }

  return () => {
    socket.removeAllListeners();
    socket.disconnect();
  };
}
