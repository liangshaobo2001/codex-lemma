import { create } from 'zustand';
import type { ReasoningEffort } from '@/bindings';

export interface ThreadModel {
  model: string;
  modelProvider: string;
  reasoningEffort: ReasoningEffort | null;
}

interface ThreadModelsState {
  confirmed: Record<string, ThreadModel>;
  pending: Record<string, boolean>;
  errors: Record<string, string | undefined>;
  begin: (id: string) => void;
  confirm: (id: string, model: ThreadModel) => void;
  fail: (id: string, reason: string) => void;
}

// Runtime confirmations belong to a thread and are never restored from localStorage.
export const useThreadModels = create<ThreadModelsState>()((set) => ({
  confirmed: {},
  pending: {},
  errors: {},
  begin: (id) =>
    set((s) => ({
      pending: { ...s.pending, [id]: true },
      errors: { ...s.errors, [id]: undefined },
    })),
  confirm: (id, model) =>
    set((s) => ({
      confirmed: { ...s.confirmed, [id]: model },
      pending: { ...s.pending, [id]: false },
      errors: { ...s.errors, [id]: undefined },
    })),
  fail: (id, reason) =>
    set((s) => ({ pending: { ...s.pending, [id]: false }, errors: { ...s.errors, [id]: reason } })),
}));
