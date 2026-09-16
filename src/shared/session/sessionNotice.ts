import { create } from "zustand";

/**
 * Why the last session ended, for the sign-in screen to say.
 *
 * A person who comes back to a ward computer and finds the sign-in screen
 * should be told they were signed out for inactivity — otherwise it looks like
 * the app crashed, or like someone signed them out.
 *
 * In memory only: a notice that survived a reload would greet the next person.
 */
interface SessionNoticeState {
  notice: string | null;
  setNotice: (notice: string | null) => void;
}

export const useSessionNotice = create<SessionNoticeState>((set) => ({
  notice: null,
  setNotice: (notice) => set({ notice }),
}));
