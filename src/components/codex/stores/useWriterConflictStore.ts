import { create } from 'zustand';

export interface Draft {
  text: string;
  images: string[];
}

interface WriterConflictState {
  /**
   * Threads another client owns. `draft` is a message the server refused,
   * kept until the user retries or forks.
   */
  locked: Record<string, { draft: Draft | null }>;
  recovering: boolean;
  /** A draft handed back to the composer, e.g. after a fork. */
  handoff: Draft | null;
  lock: (threadId: string, draft?: Draft | null) => void;
  unlock: (threadId: string) => void;
  setRecovering: (recovering: boolean) => void;
  setHandoff: (draft: Draft | null) => void;
}

export const useWriterConflictStore = create<WriterConflictState>()((set) => ({
  locked: {},
  recovering: false,
  handoff: null,
  lock: (threadId, draft) =>
    set((state) => ({
      locked: {
        ...state.locked,
        // Keep an earlier draft when a later lock has none to add.
        [threadId]: { draft: draft ?? state.locked[threadId]?.draft ?? null },
      },
    })),
  unlock: (threadId) =>
    set((state) => {
      if (!(threadId in state.locked)) return state;
      const locked = { ...state.locked };
      delete locked[threadId];
      return { locked };
    }),
  setRecovering: (recovering) => set({ recovering }),
  setHandoff: (draft) => set({ handoff: draft }),
}));

export function isWriterConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('already has an active writer');
}
