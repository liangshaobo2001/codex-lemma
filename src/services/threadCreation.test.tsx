import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Thread } from '@/bindings/v2';

const wire = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/services/apiAdapt/shared', async (load) => ({
  ...await load<typeof import('@/services/apiAdapt/shared')>(),
  postJson: wire.post,
}));
vi.mock('react-i18next', async (load) => ({
  ...await load<typeof import('react-i18next')>(),
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { useServerNotificationHandler } from '@/components/codex/hooks/useServerNotificationHandler';
import { useCodexStore, useConfigStore } from '@/components/codex/stores';
import { useThreadModels } from '@/components/codex/stores/useThreadModels';
import { ThreadList } from '@/components/codex/thread/ThreadList';
import { useServerProjectsStore } from '@/features/projects/useServerProjectsStore';
import { useThreadVisibilityStore } from '@/stores/useThreadVisibilityStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { codexService } from './codexService';

const thread = (id: string, cwd = 'D:/fixture') => ({
  id, cwd, projectId: null, name: `Chat ${id}`, preview: '', turns: [],
  modelProvider: 'fixture', model: 'fixture-model', createdAt: 1, updatedAt: 1,
}) as unknown as Thread;
const page = (data: Thread[]) => ({ data, nextCursor: null, backwardsCursor: null, readStates: null });
const started = (id: string) => ({
  thread: thread(id), modelProvider: 'fixture', model: 'fixture-model', reasoningEffort: 'medium',
});
const refs = {
  isCodexThreadActiveRef: { current: true },
  taskCompleteBeepModeRef: { current: 'never' as const },
  preventSleepDuringTasksRef: { current: false },
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  wire.post.mockImplementation(async (path: string) =>
    path === '/api/codex/thread/start' ? started('new') : page([thread('old')])
  );
  useCodexStore.setState({
    threads: [thread('old')], currentThreadId: 'old', currentTurnId: null,
    activeThreadIds: ['old'], events: { old: [] }, inputFocusTrigger: 0,
    threadStatusMap: {}, turnTimingMap: {},
  });
  useThreadModels.setState({ confirmed: {}, pending: {}, errors: {} });
  useThreadVisibilityStore.setState({ entries: {}, reloadVersion: 0 });
  useServerProjectsStore.setState({ projects: [], status: 'ready', threadsVersion: 0 });
  useWorkspaceStore.setState({ cwd: 'D:/fixture' });
  useConfigStore.setState({
    model: 'fixture-model', modelProvider: 'fixture', reasoningEffort: 'medium', threadCwdMode: 'local',
  });
});
afterEach(() => vi.restoreAllMocks());

describe('new chats stay reachable without a reload', () => {
  it('keeps a created chat in the sidebar when an older workspace-list request finishes later', async () => {
    const oldList = deferred<ReturnType<typeof page>>();
    wire.post.mockImplementation(async (path: string) =>
      path === '/api/codex/thread/start' ? started('new') : oldList.promise
    );
    render(<ThreadList cwd="D:/fixture" />);
    const loading = codexService.loadThreads('D:/fixture');
    await act(async () => { await codexService.threadStart(); });
    expect(screen.getByText('Chat new')).toBeTruthy();
    await act(async () => { oldList.resolve(page([thread('old')])); await loading; });
    act(() => useCodexStore.setState({ currentThreadId: 'old' }));
    expect(screen.getByText('Chat new')).toBeTruthy();
    const select = vi.spyOn(codexService, 'setCurrentThread').mockResolvedValue();
    fireEvent.click(screen.getByText('Chat new'));
    expect(select).toHaveBeenCalledWith('new');
  });

  it('keeps loaded chats from other workspaces when the user switches projects', async () => {
    await codexService.threadStart();
    wire.post.mockResolvedValue(page([thread('other', 'D:/other')]));
    await codexService.loadThreads('D:/other');
    render(<ThreadList cwd="D:/fixture" />);
    expect(screen.getByText('Chat new')).toBeTruthy();
  });

  it('does not erase a created chat when refreshing the list fails', async () => {
    await codexService.threadStart();
    wire.post.mockRejectedValue(new Error('offline'));
    await codexService.loadThreads('D:/fixture');
    expect(useCodexStore.getState().threads.some(t => t.id === 'new')).toBe(true);
  });

  it('inserts a started notification without stealing selection, then deduplicates the HTTP response', async () => {
    const request = deferred<ReturnType<typeof started>>();
    wire.post.mockReturnValue(request.promise);
    const { result } = renderHook(() => useServerNotificationHandler(refs, vi.fn()));
    const creation = codexService.threadStart();
    act(() => result.current({ method: 'thread/started', params: { thread: thread('new') } }));
    expect(useCodexStore.getState().threads.some(t => t.id === 'new')).toBe(true);
    expect(useCodexStore.getState().currentThreadId).toBe('old');
    await act(async () => { request.resolve(started('new')); await creation; });
    expect(useCodexStore.getState().threads.filter(t => t.id === 'new')).toHaveLength(1);
  });

  it('ignores an old workspace response after a newer workspace has loaded', async () => {
    const oldList = deferred<ReturnType<typeof page>>();
    wire.post.mockImplementation(async (_path, params) =>
      params.cwd === 'D:/fixture' ? oldList.promise : page([thread('other', 'D:/other')])
    );
    const oldLoad = codexService.loadThreads('D:/fixture');
    await codexService.loadThreads('D:/other');
    oldList.resolve(page([thread('stale')]));
    await oldLoad;
    expect(useCodexStore.getState().threads.some(t => t.id === 'other')).toBe(true);
    expect(useCodexStore.getState().threads.some(t => t.id === 'stale')).toBe(false);
  });

  it('shows a newly started chat in its project and the combined list before the DB indexes it', async () => {
    wire.post.mockResolvedValue(page([]));
    render(<><ThreadList projectId="project-a" /><ThreadList projectId="project-b" /><ThreadList all /></>);
    const { result } = renderHook(() => useServerNotificationHandler(refs, vi.fn()));
    act(() => result.current({
      method: 'thread/started',
      params: { thread: { ...thread('new'), projectId: 'project-a' } },
    }));
    expect(screen.getAllByText('Chat new')).toHaveLength(2);
    expect(useCodexStore.getState().currentThreadId).toBe('old');
  });

  it('does not revert a confirmed model when an older started notification arrives', () => {
    useThreadModels.getState().confirm('old', {
      modelProvider: 'other-provider', model: 'chosen-model', reasoningEffort: 'low',
    });
    const { result } = renderHook(() => useServerNotificationHandler(refs, vi.fn()));
    act(() => result.current({ method: 'thread/started', params: { thread: thread('old') } }));
    expect(useCodexStore.getState().threads[0]).toMatchObject({
      modelProvider: 'other-provider', model: 'chosen-model', reasoningEffort: 'low', turns: [],
    });
  });
});
