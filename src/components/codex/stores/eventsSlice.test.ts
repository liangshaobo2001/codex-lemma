import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('turn output throughput', () => {
  const start = (turnId = 'speed-turn') => notify({
    method: 'turn/started', params: { threadId: THREAD, turn: { id: turnId, startedAt: 1000 } },
  });
  const usage = (total: number, last: number, turnId = 'speed-turn') => notify({
    method: 'thread/tokenUsage/updated', params: { threadId: THREAD, turnId, tokenUsage: {
      total: { outputTokens: total }, last: { outputTokens: last },
    } },
  });
  const finish = (durationMs: number | null = 20_000, turnId = 'speed-turn') => notify({
    method: 'turn/completed', params: { threadId: THREAD, turn: {
      id: turnId, status: 'completed', startedAt: 1000, durationMs,
    } },
  });
  const speed = () => useCodexStore.getState().throughputMap[THREAD]?.tokensPerSec;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    useCodexStore.setState({ throughputMap: {}, tokenUsageMap: {}, turnTimingMap: {}, events: {} });
  });
  afterEach(() => vi.useRealTimers());

  it('includes time before visible text instead of inflating 80 to 320 tok/s', () => {
    start();
    vi.advanceTimersByTime(15_000);
    notify({ method: 'item/agentMessage/delta', params: {
      threadId: THREAD, turnId: 'speed-turn', itemId: 'answer', delta: 'visible answer',
    } });
    vi.advanceTimersByTime(5_000);
    usage(1600, 1600);
    finish();
    expect(speed()).toBe(80);
  });

  it('uses cumulative deltas across tool requests without counting duplicate usage twice', () => {
    useCodexStore.setState({ tokenUsageMap: { [THREAD]: { total: { outputTokens: 10_000 } } as never } });
    start();
    usage(10_400, 400);
    usage(10_400, 400);
    usage(11_600, 1200);
    finish();
    expect(speed()).toBe(80);
  });

  it('can measure a tool-only turn with no text deltas', () => {
    start();
    usage(1600, 1600);
    finish();
    expect(speed()).toBe(80);
  });

  it('uses the server duration when completion events arrive late', () => {
    start();
    vi.advanceTimersByTime(30_000);
    usage(1600, 1600);
    finish();
    expect(speed()).toBe(80);
  });

  it('accepts late usage for the completed turn and ignores other turns', () => {
    start();
    finish();
    usage(1600, 1600, 'other-turn');
    expect(speed()).toBeNull();
    usage(1600, 1600);
    expect(speed()).toBe(80);
  });

  it('shows unavailable on an unobserved turn or invalid server duration', () => {
    usage(1600, 1600);
    finish();
    expect(speed() ?? null).toBeNull();
    start('invalid');
    usage(1600, 1600, 'invalid');
    finish(0, 'invalid');
    expect(speed()).toBeNull();
  });
});
