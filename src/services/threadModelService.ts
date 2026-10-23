import type { ReasoningEffort } from '@/bindings';
import { getRunningTurnId, useCodexStore, useConfigStore } from '@/components/codex/stores';
import { type ThreadModel, useThreadModels } from '@/components/codex/stores/useThreadModels';
import {
  isWriterConflict,
  useWriterConflictStore,
} from '@/components/codex/stores/useWriterConflictStore';
import { i18n } from '@/lib/i18n';
import { useModelSettingsStore } from '@/stores/settings';
import { switchThreadModel, threadResume } from './apiAdapt';

const operations = new Map<string, Promise<unknown>>();
type ModelResponse = {
  model?: string | null;
  modelProvider?: string | null;
  reasoningEffort?: ReasoningEffort | null;
  thread?: {
    model?: string | null;
    modelProvider?: string | null;
    reasoningEffort?: ReasoningEffort | null;
  };
};

export function effectiveThreadModel(response: ModelResponse): ThreadModel | null {
  const model = response.model || response.thread?.model;
  const modelProvider = response.modelProvider || response.thread?.modelProvider;
  if (!model || !modelProvider) return null;
  const reasoningEffort =
    'reasoningEffort' in response ? response.reasoningEffort : response.thread?.reasoningEffort;
  return { model, modelProvider, reasoningEffort: reasoningEffort ?? null };
}

export function confirmThreadModel(id: string, response: ModelResponse) {
  const selection = effectiveThreadModel(response);
  if (!selection) {
    useThreadModels.getState().fail(id, i18n.t('chat:composer.modelUnavailable'));
    return;
  }
  useThreadModels.getState().confirm(id, selection);
  useCodexStore.setState((s) => ({
    threads: s.threads.map((t) =>
      t.id === id
        ? {
            ...t,
            model: selection.model,
            modelProvider: selection.modelProvider,
            reasoningEffort: selection.reasoningEffort,
          }
        : t
    ),
  }));
  if (useCodexStore.getState().currentThreadId === id) {
    useConfigStore
      .getState()
      .setModelSelection(
        selection.modelProvider,
        selection.model,
        selection.reasoningEffort ?? useConfigStore.getState().reasoningEffort
      );
  }
}

export async function modelOperation<T>(id: string, work: () => Promise<T>): Promise<T> {
  const previous = operations.get(id);
  useThreadModels.getState().begin(id);
  const task = (async () => {
    await previous?.catch(() => {});
    useThreadModels.getState().begin(id);
    try {
      return await work();
    } catch (error) {
      useThreadModels.getState().fail(id, error instanceof Error ? error.message : String(error));
      if (isWriterConflict(error)) useWriterConflictStore.getState().lock(id);
      throw error;
    }
  })();
  operations.set(id, task);
  try {
    return await task;
  } finally {
    if (operations.get(id) === task) operations.delete(id);
  }
}

export async function refreshThreadModel(id: string) {
  return modelOperation(id, async () => {
    const response = await threadResume({ threadId: id, excludeTurns: true });
    confirmThreadModel(id, response);
    return response;
  });
}

export async function reconcileThreadModel(
  id: string,
  reported: { model: string; modelProvider: string; effort?: ReasoningEffort | null }
) {
  const state = useThreadModels.getState();
  const known = state.confirmed[id];
  if (!known || state.pending[id] || state.errors[id]) return;
  if (
    known.model === reported.model &&
    known.modelProvider === reported.modelProvider &&
    known.reasoningEffort === (reported.effort ?? null)
  )
    return;
  // HTTP responses and notifications use separate transports. Never let a late
  // notification overwrite a newer confirmation: read the live configuration.
  await refreshThreadModel(id);
}

export async function requireThreadModel(id: string): Promise<ThreadModel> {
  // Re-read the tail because another selection may have been queued while awaiting it.
  const pending = operations.get(id);
  if (pending) {
    await pending;
    return requireThreadModel(id);
  }
  if (!useThreadModels.getState().confirmed[id] && !useThreadModels.getState().errors[id])
    await refreshThreadModel(id);
  const state = useThreadModels.getState();
  if (state.errors[id] || !state.confirmed[id])
    throw new Error(state.errors[id] || i18n.t('chat:composer.modelUnavailable'));
  return state.confirmed[id];
}

export async function selectThreadModel(id: string, selection: ThreadModel) {
  return modelOperation(id, async () => {
    const current = useThreadModels.getState().confirmed[id];
    const turnId = getRunningTurnId(id);
    if (
      useCodexStore.getState().threadStatusMap[id]?.type === 'active' &&
      current?.modelProvider !== selection.modelProvider
    ) {
      throw new Error(i18n.t('chat:composer.providerSwitchIdle'));
    }
    const contextWindow = useModelSettingsStore
      .getState()
      .models[selection.modelProvider]?.find((m) => m.id === selection.model)?.contextWindow;
    const response = await switchThreadModel({
      threadId: id,
      modelProvider: selection.modelProvider,
      model: selection.model,
      effort: selection.reasoningEffort,
      contextWindow,
      ...(turnId ? { turnId } : {}),
    });
    const effective = effectiveThreadModel(response);
    if (effective?.model !== selection.model || effective.modelProvider !== selection.modelProvider)
      throw new Error(i18n.t('chat:composer.modelNotConfirmed'));
    confirmThreadModel(id, response);
    useWriterConflictStore.getState().unlock(id);
  });
}
