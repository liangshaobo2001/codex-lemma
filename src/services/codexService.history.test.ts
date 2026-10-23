import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerNotification } from '@/bindings';
import type { Thread, ThreadResumeResponse } from '@/bindings/v2';
import { useCodexStore } from '@/components/codex/stores';
import { useThreadHistory } from '@/components/codex/stores/threadHistory';
import { threadResume } from './apiAdapt';
import { historyPage, type HistoryPage } from './apiAdapt/history';
import { codexService } from './codexService';

vi.mock('./apiAdapt', async (load) => ({ ...await load<typeof import('./apiAdapt')>(), threadResume: vi.fn() }));
vi.mock('./apiAdapt/history', () => ({ historyPage: vi.fn() }));
const thread = (id: string) => ({ id, turns: [], preview: 'fixture', model: null, modelProvider: 'fixture', cwd: 'D:/fixture' }) as unknown as Thread;
const response = (id: string) => ({ thread: thread(id) }) as ThreadResumeResponse;
const page: HistoryPage = { entries: [], nextCursor: null };
const delta = (text: string): ServerNotification => ({ method: 'item/agentMessage/delta', params: { threadId: 'a', turnId: 'turn-a', itemId: 'message-a', delta: text } });

describe('bounded history opens', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useCodexStore.setState({ threads: [thread('a'), thread('b')], currentThreadId: 'a', activeThreadIds: [], events: {}, turnTimingMap: {} });
    useThreadHistory.setState({ threads: {} });
    vi.mocked(historyPage).mockResolvedValue(page);
    vi.mocked(threadResume).mockImplementation(async (p) => response(p.threadId));
  });
  it('requests metadata-only resume and shows loading state before fetching history', async () => {
    let resolve!: (v: ThreadResumeResponse) => void;
    vi.mocked(threadResume).mockReturnValue(new Promise((r) => { resolve = r; }));
    const work = codexService.threadResume('a');
    expect(useThreadHistory.getState().threads.a.loading).toBe(true);
    await vi.waitFor(() => expect(threadResume).toHaveBeenCalled());
    expect(vi.mocked(threadResume).mock.calls[0][0].excludeTurns).toBe(true);
    resolve(response('a')); await work;
    expect(historyPage).toHaveBeenCalledWith('a');
    expect(useThreadHistory.getState().threads.a.loading).toBe(false);
    expect(useCodexStore.getState().threads.find((t) => t.id === 'a')?.turns).toEqual([]);
  });
  it('does not steal selection when an earlier thread finishes opening later', async () => {
    let resolve!: (v: ThreadResumeResponse) => void;
    vi.mocked(threadResume).mockImplementation(async (p) => p.threadId === 'a' ? new Promise((r) => { resolve = r; }) : response('b'));
    const a = codexService.threadResume('a');
    await vi.waitFor(() => expect(threadResume).toHaveBeenCalledTimes(1));
    useCodexStore.setState({ currentThreadId: 'b' });
    await codexService.threadResume('b');
    resolve(response('a')); await a;
    expect(useCodexStore.getState().currentThreadId).toBe('b');
    expect(useThreadHistory.getState().threads.a.pages).toHaveLength(1);
  });
  it('preserves full streamed text from before and during a history request', async () => {
    useCodexStore.setState({ events: { a: [delta('before ')] }, turnTimingMap: { a: { turnId: 'turn-a', startedAtMs: 1, durationMs: null, status: 'inProgress' } } });
    let resolve!: (v: HistoryPage) => void;
    vi.mocked(historyPage).mockReturnValue(new Promise((r) => { resolve = r; }));
    const work = codexService.threadResume('a');
    await vi.waitFor(() => expect(historyPage).toHaveBeenCalled());
    useCodexStore.getState().addEvent('a', delta('during'));
    resolve(page); await work;
    const events = useCodexStore.getState().events.a;
    const message = events.find((e) => e.method === 'item/agentMessage/delta');
    expect(message?.method === 'item/agentMessage/delta' && message.params.delta).toBe('before during');
  });
  it('keeps failed opens visible and retryable without hydrating all turns', async () => {
    vi.mocked(historyPage).mockRejectedValue(new Error('history unavailable'));
    await expect(codexService.threadResume('a')).rejects.toThrow('history unavailable');
    expect(useThreadHistory.getState().threads.a.error).toContain('history unavailable');
    expect(useThreadHistory.getState().threads.a.loading).toBe(false);
  });
  it('restores the active turn control after its start event leaves the live display window', async () => {
    useCodexStore.setState({ activeThreadIds: ['a'], events: { a: [delta('still running')] }, turnTimingMap: { a: { turnId: 'turn-a', startedAtMs: 1, durationMs: null, status: 'inProgress' } } });
    useThreadHistory.getState().reset('a', page);
    await codexService.setCurrentThread('a');
    expect(useCodexStore.getState().currentTurnId).toBe('turn-a');
  });
  it('keeps a newly created empty chat usable before Codex materializes its history', async () => {
    useCodexStore.setState({ threads: [{ ...thread('a'), preview: '' }], activeThreadIds: ['a'], events: { a: [] } });
    await codexService.setCurrentThread('a');
    expect(historyPage).not.toHaveBeenCalled();
    expect(useThreadHistory.getState().threads.a.error).toBeNull();
    expect(useThreadHistory.getState().threads.a.pages[0].entries).toEqual([]);
  });

});
