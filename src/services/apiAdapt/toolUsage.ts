import { create } from 'zustand';
import { postJson } from './shared';
export interface ExtraToolUsage {
  inputTokens: number;
  cachedInputTokens: number;
  complete: boolean;
}
const empty: ExtraToolUsage = { inputTokens: 0, cachedInputTokens: 0, complete: true };
export const useToolUsage = create<{
  usage: Record<string, ExtraToolUsage>;
  accept: (event: unknown) => void;
}>()((set) => ({
  usage: {},
  accept: (event) => {
    if (!event || typeof event !== 'object') return;
    const value = event as { threadId: string; usage: ExtraToolUsage };
    const usage = value.usage;
    if (
      typeof value.threadId !== 'string' ||
      !usage ||
      !Number.isSafeInteger(usage.inputTokens) ||
      usage.inputTokens < 0 ||
      !Number.isSafeInteger(usage.cachedInputTokens) ||
      usage.cachedInputTokens < 0 ||
      usage.cachedInputTokens > usage.inputTokens ||
      typeof usage.complete !== 'boolean'
    )
      return;
    set((state) => {
      const previous = state.usage[value.threadId] ?? empty;
      return {
        usage: {
          ...state.usage,
          [value.threadId]: {
            inputTokens: Math.max(previous.inputTokens, usage.inputTokens),
            cachedInputTokens: Math.max(previous.cachedInputTokens, usage.cachedInputTokens),
            complete: previous.complete && usage.complete,
          },
        },
      };
    });
  },
}));
export async function loadToolUsage(threadId: string) {
  try {
    useToolUsage.getState().accept(await postJson('/api/codex/thread/tools/usage', { threadId }));
  } catch {
    useToolUsage.getState().accept({ threadId, usage: { ...empty, complete: false } });
  }
}
