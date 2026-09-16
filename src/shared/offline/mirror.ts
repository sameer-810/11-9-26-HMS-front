import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Query, QueryClient, QueryKey } from "@tanstack/react-query";

import {
  collectBreakGlassIds,
  isTainted,
  readViaBreakGlass,
} from "./mirrorPolicy";

/**
 * Read-only offline mirror of clinical queries this user already opened, per user.
 * Never break-the-glass reads, nothing over 12 h old; all mirrors wiped at sign-out.
 */
const PREFIX = "hms-mirror:";
export const MIRROR_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const MAX_ENTRIES = 300;

// Billing, reports, audit and admin are deliberately never written to the device.
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

const isMirroredKey = (key: QueryKey) =>
  typeof key[0] === "string" &&
  (MIRRORED as readonly string[]).includes(key[0]);

function keepable(query: Query): boolean {
  if (!isMirroredKey(query.queryKey)) return false;
  if (query.state.status !== "success" || query.state.data === undefined)
    return false;
  return !readViaBreakGlass(query.state.data);
}

/** Bumped on sign-out. Older-generation mirrors never write, so a pending save cannot restore wiped data. */
let generation = 0;

const hash = (key: QueryKey) => JSON.stringify(key);

async function read(
  storageKey: string,
): Promise<{ savedAt: number; entries: MirrorEntry[] } | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      v?: number;
      savedAt: number;
      entries: MirrorEntry[];
    };
    return parsed.v === 1 && Array.isArray(parsed.entries) ? parsed : null;
  } catch {
    return null;
  }
}

/** Hydrates this user's mirror into the cache and keeps it updated. Returns a stop function. */
export function startMirror(qc: QueryClient, userId: string): () => void {
  const storageKey = `${PREFIX}${userId}`;
  const startedIn = generation;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const current = () => !stopped && startedIn === generation;
  /** Patients read under break-the-glass this session — see mirrorPolicy. */
  const tainted = new Set<string>();

  // Match gcTime to the mirror's age limit so records stay cached when the network drops.
  for (const family of MIRRORED)
    qc.setQueryDefaults([family], { gcTime: MIRROR_MAX_AGE_MS });

  const save = async () => {
    const now = Date.now();
    const stored = await read(storageKey);
    const merged = new Map<string, MirrorEntry>();
    // Entries already on disk survive even if their query left the cache.
    for (const entry of stored?.entries ?? [])
      merged.set(hash(entry.key), entry);

    const mirrored = qc
      .getQueryCache()
      .getAll()
      .filter((q) => isMirroredKey(q.queryKey));
    collectBreakGlassIds(
      mirrored.map((q) => ({ key: q.queryKey, data: q.state.data })),
      tainted,
    );
    for (const query of mirrored) {
      if (keepable(query)) {
        merged.set(query.queryHash, {
          key: query.queryKey,
          data: query.state.data,
          updatedAt: query.state.dataUpdatedAt,
        });
      }
    }

    // A patient read under break-the-glass loses every stored copy, including older ones.
    const entries = [...merged.values()]
      .filter(
        (e) => now - e.updatedAt < MIRROR_MAX_AGE_MS && !isTainted(e, tainted),
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_ENTRIES);

    if (!current()) return;
    try {
      await AsyncStorage.setItem(
        storageKey,
        JSON.stringify({ v: 1, savedAt: now, entries }),
      );
      useMirrorStore.getState().setSavedAt(now);
    } catch {
      // Storage full or unavailable; online use is unaffected.
    }
  };

  void (async () => {
    const stored = await read(storageKey);
    if (!stored || !current()) return;
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
  // Before the first await, so an in-flight save cannot land after the delete.
  generation += 1;
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((k) => k.startsWith(PREFIX));
    if (mine.length) await AsyncStorage.multiRemove(mine);
  } catch {
    /* nothing stored, or storage unavailable */
  }
  useMirrorStore.getState().setSavedAt(null);
}
