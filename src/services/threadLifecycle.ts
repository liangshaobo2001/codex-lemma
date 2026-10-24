import { useCodexStore } from '@/components/codex/stores/useCodexStore';
import { useAgentCenterStore } from '@/stores/useAgentCenterStore';
import { useInputStore } from '@/stores/useInputStore';
import { useLayoutStore } from '@/stores/useLayoutStore';
import { usePinStore } from '@/stores/usePinStore';
import {
  type ThreadLifecycleOperation,
  type ThreadVisibility,
  useThreadVisibilityStore,
} from '@/stores/useThreadVisibilityStore';

function clearSelection(threadId: string) {
  const store = useCodexStore.getState();
  if (store.currentThreadId !== threadId) return;
  const snapshot = {
    currentTurnId: store.currentTurnId,
    focus: store.inputFocusTrigger + 1,
    cardId: useAgentCenterStore.getState().currentAgentCardId,
    view: useLayoutStore.getState().view,
    draft: useInputStore.getState().inputValue,
  };
  useCodexStore.setState({
    currentThreadId: null,
    currentTurnId: null,
    inputFocusTrigger: snapshot.focus,
  });
  if (snapshot.cardId === threadId) {
    useAgentCenterStore.getState().setCurrentAgentCardId(null);
  }
  return snapshot;
}

/** Apply server truth, from either HTTP completion or the shared SSE/Tauri handler. */
export function confirmThreadLifecycle(threadId: string, operation: ThreadLifecycleOperation) {
  const hidden = operation !== 'unarchive';
  if (hidden) {
    clearSelection(threadId);
    useCodexStore.setState((s) => ({ threads: s.threads.filter((t) => t.id !== threadId) }));
    usePinStore.getState().unpin(threadId);
    useAgentCenterStore.getState().removeCard({ kind: 'codex', id: threadId });
  }
  useThreadVisibilityStore.setState((s) => ({
    entries: { ...s.entries, [threadId]: { operation, hidden, pending: false } },
    reloadVersion: s.reloadVersion + 1,
  }));
}

/** Shared by every API caller, including shortcuts and project-wide archive. */
export async function withThreadLifecycle(
  threadId: string,
  operation: ThreadLifecycleOperation,
  request: () => Promise<unknown>
) {
  const previous = useThreadVisibilityStore.getState().entries[threadId];
  if (previous?.pending) throw new Error('A thread operation is already in progress.');
  const pending: ThreadVisibility = { operation, hidden: true, pending: true };
  useThreadVisibilityStore.setState((s) => ({ entries: { ...s.entries, [threadId]: pending } }));
  const selection = operation === 'unarchive' ? undefined : clearSelection(threadId);
  try {
    const response = await request();
    // A notification may have confirmed this operation, or a newer unarchive,
    // while HTTP was in flight. Never overwrite that newer state.
    if (useThreadVisibilityStore.getState().entries[threadId] === pending) {
      confirmThreadLifecycle(threadId, operation);
    }
    return response;
  } catch (error) {
    const current = useThreadVisibilityStore.getState().entries[threadId];
    if (current !== pending) {
      if (current?.operation === operation && !current.pending) return;
      throw error;
    }
    useThreadVisibilityStore.setState((s) => {
      const entries = { ...s.entries };
      if (previous) entries[threadId] = previous;
      else delete entries[threadId];
      return { entries, reloadVersion: s.reloadVersion + 1 };
    });
    const store = useCodexStore.getState();
    // Restore the failed operation, but never take focus from a different chat,
    // a deliberate New Chat, another view, or a draft typed while waiting.
    if (
      selection &&
      store.currentThreadId === null &&
      store.inputFocusTrigger === selection.focus &&
      useLayoutStore.getState().view === selection.view &&
      useInputStore.getState().inputValue === selection.draft &&
      useAgentCenterStore.getState().currentAgentCardId === null
    ) {
      const timing = store.turnTimingMap[threadId];
      useCodexStore.setState({
        currentThreadId: threadId,
        currentTurnId: timing
          ? timing.status === 'inProgress'
            ? timing.turnId
            : null
          : selection.currentTurnId,
      });
      useAgentCenterStore.getState().setCurrentAgentCardId(selection.cardId);
    }
    throw error;
  }
}
