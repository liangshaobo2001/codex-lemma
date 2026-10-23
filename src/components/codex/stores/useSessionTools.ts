import { create } from 'zustand';
import type { ToolSnapshot } from '@/services/apiAdapt/toolDiscovery';

interface SessionToolsState {
  pending: Record<string, boolean>;
  errors: Record<string, string | undefined>;
  snapshots: Record<string, ToolSnapshot | undefined>;
  begin: (id: string) => void;
  confirm: (id: string, snapshot: ToolSnapshot) => void;
  fail: (id: string, error: string) => void;
}
// Only session fallback selections are persisted by the backend; pending UI state is transient.
export const useSessionTools = create<SessionToolsState>()((set) => ({
  pending: {},
  errors: {},
  snapshots: {},
  begin: (id) =>
    set((s) => ({
      pending: { ...s.pending, [id]: true },
      errors: { ...s.errors, [id]: undefined },
    })),
  confirm: (id, snapshot) =>
    set((s) => ({
      pending: { ...s.pending, [id]: false },
      errors: { ...s.errors, [id]: undefined },
      snapshots: { ...s.snapshots, [id]: snapshot },
    })),
  fail: (id, error) =>
    set((s) => ({ pending: { ...s.pending, [id]: false }, errors: { ...s.errors, [id]: error } })),
}));
