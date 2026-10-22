import { beforeEach, describe, expect, it } from 'vitest';
import type { ServerNotification } from '@/bindings';
import { useCodexStore } from './useCodexStore';

const THREAD = 'thread-1';

const notify = (event: unknown) =>
  useCodexStore.getState().addEvent(THREAD, event as ServerNotification);

describe('addEvent transcript filtering', () => {
  beforeEach(() => {
    useCodexStore.setState({ events: {}, threadStatusMap: {} });
  });

  it('keeps notifications that have no transcript renderer out of the thread events', () => {
    notify({
      method: 'item/reasoning/summaryTextDelta',
      params: { threadId: THREAD, turnId: 't1', itemId: 'r1', delta: 'thinking', summaryIndex: 0 },
    });
    notify({ method: 'thread/queue/changed', params: { threadId: THREAD } });

    expect(useCodexStore.getState().events[THREAD] ?? []).toHaveLength(0);
  });

  it('still records transcript events and derived state', () => {
    notify({ method: 'warning', params: { threadId: THREAD, message: 'careful' } });
    notify({ method: 'thread/status/changed', params: { threadId: THREAD, status: { type: 'idle' } } });

    const state = useCodexStore.getState();
    expect(state.events[THREAD]?.map((e) => e.method)).toEqual(['warning', 'thread/status/changed']);
    expect(state.threadStatusMap[THREAD]).toEqual({ type: 'idle' });
  });
});

describe("thread/readState/changed", () => {
  it("never reaches the transcript", () => {
    useCodexStore.setState({ events: {}, threadStatusMap: {} });
    notify({
      method: "thread/readState/changed",
      params: { threadId: THREAD, readState: { firstUnread: null, revision: "r1" } },
    });

    expect(useCodexStore.getState().events[THREAD] ?? []).toHaveLength(0);
  });
});

describe('auto-review notifications', () => {
  const action = { type: 'command', source: 'shell', command: 'rm -rf build', cwd: '/repo' };
  const review = (status: string, rationale: string | null = null) => ({
    status,
    riskLevel: null,
    userAuthorization: null,
    rationale,
  });
  const started = (reviewId: string) =>
    notify({
      method: 'item/autoApprovalReview/started',
      params: {
        threadId: THREAD,
        turnId: 't1',
        startedAtMs: 0,
        reviewId,
        targetItemId: null,
        review: review('inProgress'),
        action,
      },
    });
  const completed = (reviewId: string, status: string) =>
    notify({
      method: 'item/autoApprovalReview/completed',
      params: {
        threadId: THREAD,
        turnId: 't1',
        startedAtMs: 0,
        completedAtMs: 1,
        reviewId,
        targetItemId: null,
        decisionSource: 'agent',
        review: review(status, 'deletes outside the workspace'),
        action,
      },
    });

  beforeEach(() => {
    useCodexStore.setState({ events: {}, pendingReviewMap: {} });
  });

  it('tracks a review as pending until it completes', () => {
    started('r1');
    expect(useCodexStore.getState().pendingReviewMap[THREAD]).toEqual({ r1: action });

    completed('r1', 'approved');
    expect(useCodexStore.getState().pendingReviewMap[THREAD]).toEqual({});
  });

  it('drops pending reviews when the turn ends without completing them', () => {
    started('r1');
    notify({
      method: 'turn/completed',
      params: { threadId: THREAD, turn: { id: 't1', status: 'interrupted', items: [] } },
    });

    expect(useCodexStore.getState().pendingReviewMap[THREAD]).toBeUndefined();
  });

  it('keeps only denied and timed-out decisions in the transcript', () => {
    started('r1');
    completed('r1', 'approved');
    completed('r2', 'denied');
    completed('r3', 'timedOut');
    completed('r4', 'aborted');

    const kept = (useCodexStore.getState().events[THREAD] ?? []).map((e) =>
      e.method === 'item/autoApprovalReview/completed' ? e.params.reviewId : e.method
    );
    expect(kept).toEqual(['r2', 'r3']);
  });
});

describe('backend request throughput', () => {
  const start = (turnId = 'turn') => useCodexStore.getState().addEvent(THREAD, {
    method: 'turn/started', params: { threadId: THREAD, turn: { id: turnId } },
  } as never);
  const report = (overrides = {}) => useCodexStore.getState().setRequestMetrics({
    threadId: THREAD, turnId: 'turn', requests: 1, outputTokens: 1600,
    decodeMs: 20000, ttftMs: 1500, tokensPerSec: 80, ...overrides,
  });
  const speed = () => useCodexStore.getState().throughputMap[THREAD]?.tokensPerSec;
  beforeEach(() => { useCodexStore.setState({ throughputMap: {}, lastThroughputMap: {}, tokenUsageMap: {}, events: {} }); });
  it('uses backend timing including hidden reasoning, independent of visible text and receipt delay', () => {
    start(); report(); expect(speed()).toBe(80);
  });
  it('does not fabricate decode speed from turn duration or token notifications', () => {
    start();
    useCodexStore.getState().addEvent(THREAD, { method: 'thread/tokenUsage/updated', params: {
      threadId: THREAD, turnId: 'turn', tokenUsage: { total: { outputTokens: 1600 }, last: { outputTokens: 1600 } },
    } } as never);
    useCodexStore.getState().addEvent(THREAD, { method: 'turn/completed', params: {
      threadId: THREAD, turn: { id: 'turn', durationMs: 5000 },
    } } as never);
    expect(speed()).toBeNull();
  });
  it('accepts weighted summaries including tool-only requests without adding duplicate events', () => {
    start(); report(); report(); report({ requests: 2, tokensPerSec: 70 });
    expect(speed()).toBe(70);
    report(); expect(speed()).toBe(70);
  });
  it('retains the last valid reading while resetting current-turn aggregation', () => {
    start(); report(); start('new');
    expect(speed()).toBeNull();
    expect(useCodexStore.getState().lastThroughputMap[THREAD].tokensPerSec).toBe(80);
    report({turnId:'new',tokensPerSec:75});
    expect(speed()).toBe(75);
    expect(useCodexStore.getState().lastThroughputMap[THREAD].tokensPerSec).toBe(75);
  });
  it('ignores delayed measurements belonging to a previous turn', () => {
    start(); report(); start('new'); report(); expect(speed()).toBeNull();
  });
  it('rejects invalid metadata and accepts a replay when no current measurement exists', () => {
    report({ tokensPerSec: NaN }); expect(speed()).toBeUndefined();
    report({ decodeMs: 0 }); expect(speed()).toBeUndefined();
    report(); expect(speed()).toBe(80);
  });
});
