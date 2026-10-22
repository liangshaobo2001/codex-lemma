import type { UsageStats } from '@/services/apiAdapt/stats';

export type StatsRange = 'today' | '7d' | '30d' | 'all';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface Totals {
  chats: number;
  turns: number;
  avgTurnMs: number | null;
  input: number;
  cached: number;
  output: number;
  reasoning: number;
}

/** One bar of the token chart: a day, or an hour when the range is today. */
export interface Bucket {
  key: string;
  label: string;
  cached: number;
  uncached: number;
  output: number;
  turns: number;
}

export interface Share {
  key: string;
  label: string;
  sublabel?: string;
  tokens: number;
  input: number;
  cached: number;
  chats: number;
}

export interface StatsSummary {
  totals: Totals;
  buckets: Bucket[];
  byModel: Share[];
  byProject: Share[];
  /** Turns per hour of day, 0-23, over the range. */
  hours: number[];
  /** Turns per local day (YYYY-MM-DD) over the last 26 weeks, independent of the range. */
  calendar: Map<string, number>;
}

export const dayKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const startOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export function rangeStart(range: StatsRange, now: number): number {
  const today = startOfDay(now);
  if (range === 'today') return today;
  if (range === '7d') return today - 6 * DAY_MS;
  if (range === '30d') return today - 29 * DAY_MS;
  return 0;
}

function buildBuckets(range: StatsRange, from: number, now: number, firstMs: number): Bucket[] {
  const empty = (key: string, label: string): Bucket => ({
    key,
    label,
    cached: 0,
    uncached: 0,
    output: 0,
    turns: 0,
  });
  if (range === 'today') {
    return Array.from({ length: 24 }, (_, h) => empty(String(h), `${h}`));
  }
  const start = range === 'all' ? startOfDay(firstMs || now) : from;
  const buckets: Bucket[] = [];
  for (let t = start; t <= now; t += DAY_MS) {
    const d = new Date(t);
    buckets.push(empty(dayKey(t), `${d.getMonth() + 1}/${d.getDate()}`));
  }
  return buckets;
}

/** Folds the raw rows into what the page shows for one range. */
export function summarize(stats: UsageStats, range: StatsRange, now = Date.now()): StatsSummary {
  const from = rangeStart(range, now);
  const threadById = new Map(stats.threads.map((t) => [t.id, t]));
  const projectName = new Map(stats.projects.map((p) => [p.id, p.name]));

  const requests = stats.requests.filter((r) => r.tsMs >= from && threadById.has(r.threadId));
  const turns = stats.turns.filter((t) => t.startedAtMs >= from && threadById.has(t.threadId));

  const firstMs = Math.min(
    ...requests.map((r) => r.tsMs).filter((t) => t > 0),
    ...turns.map((t) => t.startedAtMs).filter((t) => t > 0),
    now
  );
  const buckets = buildBuckets(range, from, now, firstMs);
  const bucketIndex = new Map(buckets.map((b, i) => [b.key, i]));
  const bucketOf = (ms: number) =>
    bucketIndex.get(range === 'today' ? String(new Date(ms).getHours()) : dayKey(ms));

  const active = new Set<string>();
  const totals: Totals = {
    chats: 0,
    turns: turns.length,
    avgTurnMs: null,
    input: 0,
    cached: 0,
    output: 0,
    reasoning: 0,
  };
  const models = new Map<string, Share & { threads: Set<string> }>();
  const projects = new Map<string, Share & { threads: Set<string> }>();
  const addShare = (
    map: Map<string, Share & { threads: Set<string> }>,
    key: string,
    label: string,
    sublabel: string | undefined,
    threadId: string,
    r: { input: number; cached: number; output: number }
  ) => {
    let s = map.get(key);
    if (!s) {
      s = { key, label, sublabel, tokens: 0, input: 0, cached: 0, chats: 0, threads: new Set() };
      map.set(key, s);
    }
    s.tokens += r.input + r.output;
    s.input += r.input;
    s.cached += r.cached;
    s.threads.add(threadId);
  };

  for (const r of requests) {
    const thread = threadById.get(r.threadId);
    if (!thread) continue;
    active.add(r.threadId);
    totals.input += r.input;
    totals.cached += Math.min(r.cached, r.input);
    totals.output += r.output;
    totals.reasoning += r.reasoning;
    const i = bucketOf(r.tsMs);
    if (i !== undefined) {
      const cached = Math.min(r.cached, r.input);
      buckets[i].cached += cached;
      buckets[i].uncached += r.input - cached;
      buckets[i].output += r.output;
    }
    const model = thread.model ?? '?';
    addShare(
      models,
      `${thread.modelProvider}/${model}`,
      model,
      thread.modelProvider,
      r.threadId,
      r
    );
    // Sub-threads have no project of their own; listing them as ungrouped would mislead.
    if (thread.subagent) continue;
    const pid = thread.projectId;
    addShare(
      projects,
      pid ?? '',
      pid ? (projectName.get(pid) ?? pid) : '',
      undefined,
      r.threadId,
      r
    );
  }

  const hours = new Array<number>(24).fill(0);
  let durationSum = 0;
  let durationCount = 0;
  for (const t of turns) {
    active.add(t.threadId);
    hours[new Date(t.startedAtMs).getHours()] += 1;
    const i = bucketOf(t.startedAtMs);
    if (i !== undefined) buckets[i].turns += 1;
    if (t.durationMs !== null && t.durationMs > 0) {
      durationSum += t.durationMs;
      durationCount += 1;
    }
  }
  // Codex's own sub-threads count toward tokens, not toward chats.
  totals.chats = [...active].filter((id) => !threadById.get(id)?.subagent).length;
  totals.avgTurnMs = durationCount > 0 ? durationSum / durationCount : null;

  const calendarFrom = startOfDay(now) - 26 * 7 * DAY_MS;
  const calendar = new Map<string, number>();
  for (const t of stats.turns) {
    if (t.startedAtMs < calendarFrom || !threadById.has(t.threadId)) continue;
    const k = dayKey(t.startedAtMs);
    calendar.set(k, (calendar.get(k) ?? 0) + 1);
  }

  const finish = (map: Map<string, Share & { threads: Set<string> }>) =>
    [...map.values()]
      .map(({ threads, ...s }) => ({ ...s, chats: threads.size }))
      .sort((a, b) => b.tokens - a.tokens);

  return {
    totals,
    buckets,
    byModel: finish(models),
    byProject: finish(projects),
    hours,
    calendar,
  };
}

/** 1234 → 1.2K, 3_400_000 → 3.4M. */
export function compact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
  return String(Math.round(n));
}

export const hitRate = (cached: number, input: number) => (input > 0 ? cached / input : 0);
