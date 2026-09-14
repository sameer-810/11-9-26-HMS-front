import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Query, QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * The read-only record mirror.
 *
 * A ward that cannot read the record during an outage is more dangerous than
 * one that cannot write to it (ARCHITECTURE: Offline). So what a clinician has
 * already opened on this device — the record, allergies, the bedside chart,
 * their patient list, the drug round — is kept, and shown when the server
 * cannot be reached, labelled with how old it is.
 *
 * ---------------------------------------------------------------------------
 * What is kept, and what is deliberately not
 * ---------------------------------------------------------------------------
 *  - Only the query families below. Billing, reports, the audit trail and
 *    administration are never written to the device.
 *  - Nothing read under break-the-glass. Emergency access is sixty minutes on
 *    the server; a copy on the tablet would outlive it indefinitely.
 *  - Nothing older than twelve hours — a record from yesterday's shift is a
 *    different patient's day.
 *  - Per user, and every mirror on the device is deleted at sign-out, so a
 *    shared ward tablet never shows the next person what the last one read.
 *
 * It is what this user already SAW, not a download of the ward. A patient
 * nobody opened here is not available offline, and the screen says so.
 */

const PREFIX = "hms-mirror:";
export const MIRROR_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const MAX_ENTRIES = 300;

const MIRRORED = [
  "medical-record",
  "clinical-context",
  "patient-banner",
  "bedside",
  "admission",
  "observations",
  "nursing-notes",
  "drug-round",
  "my-ward-patients",
  "escalations",
] as const;

interface MirrorEntry {
  key: QueryKey;
  data: unknown;
  updatedAt: number;
}

interface MirrorState {
  /** When the mirror was last written — the "as of" on the offline strip. */
  savedAt: number | null;
  setSavedAt: (savedAt: number | null) => void;
}

export const useMirrorStore = create<MirrorState>((set) => ({
  savedAt: null,
  setSavedAt: (savedAt) => set({ savedAt }),
}));

const isMirroredKey = (key: QueryKey) => typeof key[0] === "string" && (MIRRORED as readonly string[]).includes(key[0]);

function keepable(query: Query): boolean {
  if (!isMirroredKey(query.queryKey)) return false;
  if (query.state.status !== "success" || query.state.data === undefined) return false;
  const access = (query.state.data as { access?: { viaBreakGlass?: boolean } } | null)?.access;
  return !access?.viaBreakGlass;
}

const hash = (key: QueryKey) => JSON.stringify(key);

async function read(storageKey: string): Promise<{ savedAt: number; entries: MirrorEntry[] } | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: number; savedAt: number; entries: MirrorEntry[] };
    return parsed.v === 1 && Array.isArray(parsed.entries) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Hydrate this user's mirror into the cache, then keep it up to date as
 * mirrored queries succeed. Returns a stop function.
 */
export function startMirror(qc: QueryClient, userId: string): () => void {
  const storageKey = `${PREFIX}${userId}`;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  // Kept in memory as long as the mirror would keep them on disk, so a record
  // opened this morning is still in the cache when the WiFi drops this
  // afternoon — not garbage-collected five minutes after the screen closed.
  for (const family of MIRRORED) qc.setQueryDefaults([family], { gcTime: MIRROR_MAX_AGE_MS });

  const save = async () => {
    const now = Date.now();
    const stored = await read(storageKey);
    const merged = new Map<string, MirrorEntry>();
    // Entries already on disk survive even if their query left the cache.
    for (const entry of stored?.entries ?? []) merged.set(hash(entry.key), entry);

    for (const query of qc.getQueryCache().getAll()) {
      if (!isMirroredKey(query.queryKey)) continue;
      if (keepable(query)) {
        merged.set(query.queryHash, { key: query.queryKey, data: query.state.data, updatedAt: query.state.dataUpdatedAt });
      } else if ((query.state.data as { access?: { viaBreakGlass?: boolean } } | undefined)?.access?.viaBreakGlass) {
        // A record that is now being read under emergency access loses any
        // earlier copy too.
        merged.delete(query.queryHash);
      }
    }

    const entries = [...merged.values()]
      .filter((e) => now - e.updatedAt < MIRROR_MAX_AGE_MS)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_ENTRIES);

    if (stopped) return;
    try {
      await AsyncStorage.setItem(storageKey, JSON.stringify({ v: 1, savedAt: now, entries }));
      useMirrorStore.getState().setSavedAt(now);
    } catch {
      // Storage full or unavailable. The app still works online; offline it
      // shows what it has, and says a record is not saved when it is not.
    }
  };

  void (async () => {
    const stored = await read(storageKey);
    if (!stored || stopped) return;
    const now = Date.now();
    for (const entry of stored.entries) {
      if (now - entry.updatedAt >= MIRROR_MAX_AGE_MS) continue;
      // Never overwrite something fresher the screen already fetched.
      if (qc.getQueryState(entry.key)?.status === "success") continue;
      qc.setQueryData(entry.key, entry.data, { updatedAt: entry.updatedAt });
    }
    useMirrorStore.getState().setSavedAt(stored.savedAt);
  })();

  const unsubscribe = qc.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success") return;
    if (!isMirroredKey(event.query.queryKey)) return;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      void save();
    }, 800);
  });

  return () => {
    stopped = true;
    unsubscribe();
    if (timer) clearTimeout(timer);
  };
}

/** Removes every user's mirror from this device. Called at sign-out. */
export async function clearMirrors(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((k) => k.startsWith(PREFIX));
    if (mine.length) await AsyncStorage.multiRemove(mine);
  } catch {
    /* nothing stored, or storage unavailable */
  }
  useMirrorStore.getState().setSavedAt(null);
}
