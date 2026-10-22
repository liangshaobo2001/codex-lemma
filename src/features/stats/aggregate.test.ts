import { describe, expect, it } from 'vitest';
import type { UsageStats } from '@/services/apiAdapt/stats';
import { compact, summarize } from './aggregate';

const now = new Date(2026, 9, 22, 18, 0).getTime();
const at = (daysAgo: number, hour: number) =>
  new Date(2026, 9, 22 - daysAgo, hour, 0).getTime();

const stats: UsageStats = {
  threads: [
    { id: 'a', createdAtMs: at(10, 9), modelProvider: 'local', model: 'qwen', projectId: 'p1', cwd: 'D:/x', archived: false, subagent: false },
    { id: 'b', createdAtMs: at(1, 9), modelProvider: 'deepseek', model: 'chat', projectId: null, cwd: 'D:/y', archived: false, subagent: false },
  ],
  requests: [
    { threadId: 'a', tsMs: at(10, 9), input: 1000, cached: 0, output: 100, reasoning: 0 },
    { threadId: 'a', tsMs: at(0, 14), input: 2000, cached: 1500, output: 200, reasoning: 50 },
    { threadId: 'b', tsMs: at(1, 9), input: 1000, cached: 500, output: 100, reasoning: 0 },
    { threadId: 'gone', tsMs: at(0, 9), input: 999, cached: 0, output: 9, reasoning: 0 },
  ],
  turns: [
    { threadId: 'a', startedAtMs: at(0, 14), durationMs: 30_000, status: 'completed' },
    { threadId: 'b', startedAtMs: at(1, 9), durationMs: 90_000, status: 'completed' },
  ],
  projects: [{ id: 'p1', name: 'alpha' }],
};

describe('summarize', () => {
  it('counts only the range and known threads', () => {
    const s = summarize(stats, '7d', now);
    expect(s.totals.chats).toBe(2);
    expect(s.totals.turns).toBe(2);
    expect(s.totals.input).toBe(3000);
    expect(s.totals.cached).toBe(2000);
    expect(s.totals.output).toBe(300);
    expect(s.totals.avgTurnMs).toBe(60_000);
    expect(s.buckets).toHaveLength(7);
    expect(s.buckets[s.buckets.length - 1]).toMatchObject({ cached: 1500, uncached: 500, output: 200, turns: 1 });
  });

  it('splits today by hour and ranks models and projects by tokens', () => {
    const s = summarize(stats, 'today', now);
    expect(s.buckets).toHaveLength(24);
    expect(s.buckets[14].output).toBe(200);
    const all = summarize(stats, 'all', now);
    expect(all.byModel.map((m) => m.label)).toEqual(['qwen', 'chat']);
    expect(all.byProject.map((p) => p.label)).toEqual(['alpha', '']);
    expect(all.hours[9]).toBe(1);
  });

  it('formats compact numbers', () => {
    expect(compact(950)).toBe('950');
    expect(compact(1234)).toBe('1.2K');
    expect(compact(3_400_000)).toBe('3.4M');
  });
});
