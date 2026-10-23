import { useCodexStore, useConfigStore } from '@/components/codex/stores';
import { useThreadModels } from '@/components/codex/stores/useThreadModels';

export function useComposerModel() {
  const id = useCodexStore((s) => s.currentThreadId);
  const draft = useConfigStore();
  const selection = useThreadModels((s) => (id ? s.confirmed[id] : undefined));
  const pending = useThreadModels((s) => (id ? Boolean(s.pending[id]) : false));
  const error = useThreadModels((s) => (id ? s.errors[id] : undefined));
  return {
    model: id ? (selection?.model ?? '') : draft.model,
    modelProvider: id ? (selection?.modelProvider ?? '') : draft.modelProvider,
    reasoningEffort: id ? (selection?.reasoningEffort ?? 'none') : draft.reasoningEffort,
    effortInherited: Boolean(id && selection && selection.reasoningEffort === null),
    pending,
    error,
    unavailable: Boolean(id && !selection),
    threadId: id,
  };
}
