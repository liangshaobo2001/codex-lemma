import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerNotification } from '@/bindings';
import { historyPage, type HistoryPage } from '@/services/apiAdapt/history';
import { HISTORY_CACHE_PAGES, historyEvents, historyEventKey, mergeHistoryEvents, useThreadHistory } from './threadHistory';

vi.mock('@/services/apiAdapt/history', () => ({ historyPage: vi.fn() }));
const page = (index: number, count = 40): HistoryPage => ({
  entries: Array.from({ length: count }, (_, i) => ({ turnId: 'turn-' + index,
    item: { type: 'agentMessage', id: index + '-' + i, text: 'fixture', phase: null, memoryCitation: null, delivery: null, questions: null },
    truncated: false, detailCursor: null })), nextCursor: 'cursor-' + (index + 1),
});

describe('bounded history windows', () => {
  beforeEach(() => { useThreadHistory.setState({ threads: {} }); vi.resetAllMocks(); });

  it('retains only three payload pages after scrolling through 100 pages and reloads evicted pages', async () => {
    vi.mocked(historyPage).mockImplementation(async (_id, cursor) => page(cursor ? Number(cursor.split('-')[1]) : 0));
    useThreadHistory.getState().reset('t', page(0));
    for (let i = 0; i < 100; i++) await useThreadHistory.getState().older('t');
    let state = useThreadHistory.getState().threads.t;
    expect(state.pages).toHaveLength(HISTORY_CACHE_PAGES);
    expect(state.pages.reduce((n, p) => n + p.entries.length, 0)).toBe(120);
    expect(state.start).toBe(98);
    expect(state.cursors).toHaveLength(101);
    await useThreadHistory.getState().newer('t');
    state = useThreadHistory.getState().threads.t;
    expect(historyPage).toHaveBeenLastCalledWith('t', 'cursor-97');
    expect(state.start).toBe(97);
    expect(state.pages).toHaveLength(3);
  });

  it('coalesces simultaneous edge loads and ignores stale responses after a reopen', async () => {
    let resolve!: (p: HistoryPage) => void;
    vi.mocked(historyPage).mockReturnValue(new Promise((r) => { resolve = r; }));
    useThreadHistory.getState().reset('t', page(0));
    const a = useThreadHistory.getState().older('t');
    const b = useThreadHistory.getState().older('t');
    expect(historyPage).toHaveBeenCalledTimes(1);
    useThreadHistory.getState().reset('t', page(99));
    resolve(page(1)); await Promise.all([a, b]);
    expect(useThreadHistory.getState().threads.t.pages[0].entries[0].turnId).toBe('turn-99');
  });

  it('keeps retryable failure state and never consumes the continuation cursor on failure', async () => {
    useThreadHistory.getState().reset('t', page(0));
    vi.mocked(historyPage).mockRejectedValue(new Error('offline'));
    await useThreadHistory.getState().older('t');
    expect(useThreadHistory.getState().threads.t.error).toContain('offline');
    expect(useThreadHistory.getState().threads.t.pages[0].nextCursor).toBe('cursor-1');
    expect(useThreadHistory.getState().threads.t.loading).toBe(false);
  });

  it('bounds cached threads and returns to a fresh latest page without depending on evicted payloads', async () => {
    for (let i = 0; i < 8; i++) useThreadHistory.getState().reset('t' + i, page(i));
    expect(Object.keys(useThreadHistory.getState().threads)).toHaveLength(5);
    vi.mocked(historyPage).mockResolvedValue(page(100));
    await useThreadHistory.getState().latest('t7');
    const state = useThreadHistory.getState().threads.t7;
    expect(state.pages).toHaveLength(1);
    expect(state.start).toBe(0);
    expect(state.pages[0].entries[0].turnId).toBe('turn-100');
  });

  it('keeps event identity stable on prepend and prefers live updates over snapshot items', () => {
    const old = historyEvents(page(0, 1), 't');
    const completed = old[1] as Extract<ServerNotification, { method: 'item/completed' }>;
    const updated = { ...completed, params: { ...completed.params, item: { ...completed.params.item, text: 'updated' } } } as ServerNotification;
    const combined = mergeHistoryEvents(old, [updated]);
    expect(combined).toHaveLength(2);
    expect(combined[1]).toBe(updated);
    expect(historyEventKey(completed, 1)).toBe(historyEventKey(completed, 999));
  });

  it('isolates truncated rich payloads from normal renderers and retains their detail token', () => {
    const p = page(0, 1); p.entries[0].truncated = true; p.entries[0].detailCursor = 'detail';
    const events = historyEvents(p, 't');
    expect(events[1].method).toBe('item/completed');
    expect((events[1].params as unknown as { historyPreview: { detailCursor: string } }).historyPreview.detailCursor).toBe('detail');
  });
});
