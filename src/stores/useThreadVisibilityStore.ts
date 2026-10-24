import { create } from 'zustand';

export type ThreadLifecycleOperation = 'archive' | 'delete' | 'unarchive';
export type ThreadVisibility = {
  operation: ThreadLifecycleOperation;
  hidden: boolean;
  pending: boolean;
};

// Runtime tombstones keep stale DB pages and live-store merges from resurrecting
// removed threads. An explicit unarchive is the only operation that clears one.
export const useThreadVisibilityStore = create<{
  entries: Record<string, ThreadVisibility>;
  reloadVersion: number;
}>()(() => ({ entries: {}, reloadVersion: 0 }));
