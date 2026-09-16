import { create } from "zustand";

/**
 * Why the last session ended (e.g. inactivity), shown on the sign-in screen.
 * In memory only, so a reload does not show it to the next person.
 */
interface SessionNoticeState {
  notice: string | null;
  setNotice: (notice: string | null) => void;
}

export const useSessionNotice = create<SessionNoticeState>((set) => ({
  notice: null,
  setNotice: (notice) => set({ notice }),
}));
