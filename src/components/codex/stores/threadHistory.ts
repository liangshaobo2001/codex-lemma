import { create } from 'zustand';
import type { ServerNotification } from '@/bindings';
import type { ThreadItem } from '@/bindings/v2';
import { type HistoryPage, historyPage } from '@/services/apiAdapt/history';

export const HISTORY_CACHE_PAGES = 3;
export const LIVE_EVENT_LIMIT = 400;
const CACHE_THREADS = 5;

/** Preserve identity while old pages are prepended and streamed items are replaced. */
export function historyEventKey(event: ServerNotification, index: number): string {
  const p = event.params as {
    turnId?: string;
    itemId?: string;
    item?: { id: string };
    turn?: { id: string };
  };
  const id = p.item?.id ?? p.itemId ?? p.turn?.id;
  return id ? JSON.stringify([event.method, p.turnId ?? p.turn?.id, id]) : `event-${index}`;
}

export function historyEvents(page: HistoryPage, threadId: string): ServerNotification[] {
  const events: ServerNotification[] = page.entries.flatMap((entry) => {
    // Truncated structures are displayed as plain previews, never passed to
    // renderers that expect complete diffs, tool results, or rich content.
    const item: ThreadItem = entry.truncated
      ? {
          type: 'agentMessage',
          id: entry.item.id,
          text: '',
          phase: null,
          memoryCitation: null,
          delivery: null,
          questions: null,
        }
      : entry.item;
    const params = { threadId, turnId: entry.turnId, item };
    return [
      { method: 'item/started', params: { ...params, startedAtMs: 0 } },
      {
        method: 'item/completed',
        params: {
          ...params,
          completedAtMs: 0,
          ...(entry.truncated ? { historyPreview: entry } : {}),
        },
      },
    ] as ServerNotification[];
  });
  // Close each completed turn after its last visible item. Merging pages
  // deduplicates this marker in favor of the newer (final) turn segment.
  for (const turn of page.turns ?? []) {
    if (turn.status === 'inProgress') continue;
    let end = -1;
    for (let i = 0; i < events.length; i++) {
      const params = events[i].params as { turnId?: string };
      if (params.turnId === turn.id) end = i;
    }
    events.splice(end + 1, 0, { method: 'turn/completed', params: { threadId, turn } });
  }
  return events;
}

export function mergeHistoryEvents(
  older: ServerNotification[],
  newer: ServerNotification[]
): ServerNotification[] {
  const seen = new Set(newer.map((event, i) => historyEventKey(event, i)));
  return [...older.filter((event, i) => !seen.has(historyEventKey(event, i))), ...newer];
}

export interface HistoryWindow {
  pages: HistoryPage[]; // Newest first; only three pages retain payloads.
  cursors: Array<string | null>; // Tiny continuation tokens allow evicted pages to be revisited.
  start: number;
  loading: boolean;
  error: string | null;
  generation: number;
}
interface HistoryStore {
  threads: Record<string, HistoryWindow>;
  reset: (threadId: string, page: HistoryPage) => void;
  begin: (threadId: string) => number;
  fail: (threadId: string, error: unknown) => void;
  older: (threadId: string) => Promise<void>;
  newer: (threadId: string) => Promise<void>;
  latest: (threadId: string) => Promise<void>;
}
let generation = 0;

export const useThreadHistory = create<HistoryStore>((set, get) => {
  const load = async (id: string, direction: 'older' | 'newer') => {
    let before = get().threads[id];
    if (!before || before.loading) return;
    if (direction === 'older' && before.start === 0 && before.pages.length === 1) {
      set((s) => ({ threads: { ...s.threads, [id]: { ...before, loading: true, error: null } } }));
      try {
        const fresh = await historyPage(id);
        if (get().threads[id]?.generation !== before.generation) return;
        before = {
          ...before,
          pages: [fresh],
          cursors: [fresh.reloadCursor ?? null],
          loading: false,
        };
        set((s) => ({ threads: { ...s.threads, [id]: before } }));
      } catch (error) {
        if (get().threads[id]?.generation !== before.generation) return;
        set((s) => ({
          threads: { ...s.threads, [id]: { ...before, loading: false, error: String(error) } },
        }));
        return;
      }
    }
    const index = direction === 'older' ? before.start + before.pages.length : before.start - 1;
    if (index < 0) return;
    const cursor =
      direction === 'older'
        ? before.pages[before.pages.length - 1]?.nextCursor
        : before.cursors[index];
    if (cursor === undefined || (direction === 'older' && cursor === null)) return;
    set((s) => ({ threads: { ...s.threads, [id]: { ...before, loading: true, error: null } } }));
    try {
      const page = await historyPage(id, cursor);
      const current = get().threads[id];
      if (!current || current.generation !== before.generation) return;
      const cursors = [...current.cursors];
      cursors[index] = page.reloadCursor ?? cursor;
      const pages = direction === 'older' ? [...current.pages, page] : [page, ...current.pages];
      let start = direction === 'older' ? current.start : index;
      if (pages.length > HISTORY_CACHE_PAGES) {
        if (direction === 'older') {
          pages.shift();
          start++;
        } else pages.pop();
      }
      set((s) => ({
        threads: { ...s.threads, [id]: { ...current, pages, cursors, start, loading: false } },
      }));
    } catch (error) {
      const current = get().threads[id];
      if (current?.generation !== before.generation) return;
      set((s) => ({
        threads: { ...s.threads, [id]: { ...current, loading: false, error: String(error) } },
      }));
    }
  };
  return {
    threads: {},
    begin: (id) => {
      const current = get().threads[id];
      const version = ++generation;
      set((s) => ({
        threads: {
          ...s.threads,
          [id]: {
            ...(current ?? { pages: [], cursors: [null], start: 0 }),
            loading: true,
            error: null,
            generation: version,
          },
        },
      }));
      return version;
    },
    fail: (id, error) =>
      set((s) => {
        const current = s.threads[id];
        if (!current) return s;
        return {
          threads: { ...s.threads, [id]: { ...current, loading: false, error: String(error) } },
        };
      }),
    reset: (id, page) =>
      set((s) => {
        const threads = { ...s.threads };
        delete threads[id];
        while (Object.keys(threads).length >= CACHE_THREADS)
          delete threads[Object.keys(threads)[0]];
        threads[id] = {
          pages: [page],
          cursors: [page.reloadCursor ?? null],
          start: 0,
          loading: false,
          error: null,
          generation: ++generation,
        };
        return { threads };
      }),
    older: (id) => load(id, 'older'),
    newer: (id) => load(id, 'newer'),
    latest: async (id) => {
      const current = get().threads[id];
      if (!current || current.loading) return;
      set((s) => ({ threads: { ...s.threads, [id]: { ...current, loading: true, error: null } } }));
      try {
        const page = await historyPage(id);
        if (get().threads[id]?.generation === current.generation) get().reset(id, page);
      } catch (error) {
        if (get().threads[id]?.generation !== current.generation) return;
        set((s) => ({
          threads: { ...s.threads, [id]: { ...current, loading: false, error: String(error) } },
        }));
      }
    },
  };
});
