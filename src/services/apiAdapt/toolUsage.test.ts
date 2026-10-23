import { beforeEach, describe, expect, it } from 'vitest';
import { useToolUsage } from './toolUsage';
describe('extra tool-search usage', () => {
  beforeEach(() => useToolUsage.setState({ usage: {} }));
  it('keeps counts scoped to a chat and prevents late reads from rolling them back', () => {
    const accept = useToolUsage.getState().accept;
    accept({ threadId: 'a', usage: { inputTokens: 200, cachedInputTokens: 160, complete: true } });
    accept({ threadId: 'a', usage: { inputTokens: 100, cachedInputTokens: 80, complete: true } });
    expect(useToolUsage.getState().usage.a.inputTokens).toBe(200);
    expect(useToolUsage.getState().usage.b).toBeUndefined();
  });
  it('does not turn missing accounting into a zero cache hit', () => {
    const accept = useToolUsage.getState().accept;
    accept({ threadId: 'a', usage: { inputTokens: 0, cachedInputTokens: 0, complete: false } });
    accept({ threadId: 'a', usage: { inputTokens: 100, cachedInputTokens: 80, complete: true } });
    expect(useToolUsage.getState().usage.a.complete).toBe(false);
  });
  it('rejects malformed or impossible counters', () => {
    for (const usage of [null, {}, { inputTokens: -1, cachedInputTokens: 0, complete: true }, { inputTokens: 1, cachedInputTokens: 2, complete: true }]) useToolUsage.getState().accept({ threadId: 'a', usage });
    expect(useToolUsage.getState().usage).toEqual({});
  });
});
