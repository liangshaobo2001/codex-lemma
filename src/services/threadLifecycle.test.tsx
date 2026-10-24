import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Thread } from '@/bindings/v2';

const wire = vi.hoisted(() => ({ post: vi.fn(), mutate: vi.fn() }));
vi.mock('@/services/apiAdapt/shared', async (load) => ({
  ...await load<typeof import('@/services/apiAdapt/shared')>(),
  postJson: wire.post,
  postJsonWithOptions: wire.mutate,
}));
vi.mock('react-i18next', async (load) => ({ ...await load<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string) => key }) }));

import { useCodexStore } from '@/components/codex/stores';
import { useServerNotificationHandler } from '@/components/codex/hooks/useServerNotificationHandler';
import { ThreadList } from '@/components/codex/thread/ThreadList';
import { ArchivedThreadSettings } from '@/components/settings/codex/ArchivedThreadSettings';
import { SideBarPinnedList } from '@/components/layout/SideBarPinnedList';
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';
import { archiveThread, deleteThread, unarchiveThread } from '@/services/apiAdapt';
import { useAgentCenterStore } from '@/stores/useAgentCenterStore';
import { useInputStore } from '@/stores/useInputStore';
import { useLayoutStore } from '@/stores/useLayoutStore';
import { usePinStore } from '@/stores/usePinStore';
import { useThreadVisibilityStore } from '@/stores/useThreadVisibilityStore';

const thread = (id: string) => ({ id, name: `Chat ${id}`, preview: id, cwd: 'D:/fixture',
  projectId: null, updatedAt: 1, createdAt: 1, turns: [] }) as unknown as Thread;
const page = { data: [thread('a'), thread('b')], nextCursor: null, backwardsCursor: null, readStates: null };
function deferred() {
  let resolve!: (value?: unknown) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const refs = { isCodexThreadActiveRef: { current: true }, taskCompleteBeepModeRef: { current: 'never' as const }, preventSleepDuringTasksRef: { current: false } };

beforeEach(() => {
  vi.clearAllMocks();
  wire.post.mockResolvedValue(page);
  wire.mutate.mockResolvedValue({});
  useThreadVisibilityStore.setState({ entries: {}, reloadVersion: 0 });
  useCodexStore.setState({ threads: page.data, currentThreadId: 'a', currentTurnId: 'turn-a', inputFocusTrigger: 0, events: {}, threadStatusMap: {}, turnTimingMap: {} });
  useAgentCenterStore.setState({ cards: [{kind: 'codex', id: 'a'}], currentAgentCardId: 'a' });
  useLayoutStore.setState({ view: 'agent' });
  useInputStore.setState({ inputValue: '' });
  usePinStore.setState({ pinned: [{kind: 'codex', id: 'a', title: 'Pinned A', cwd: 'D:/fixture'}] });
});

describe('thread lifecycle visible behavior', () => {
  it('hides archive immediately across both sidebar lists and pins, despite stale server and live rows', async () => {
    const request = deferred();
    wire.mutate.mockReturnValue(request.promise);
    render(<><ThreadList all /><ThreadList cwd="D:/fixture" /><SideBarPinnedList /></>);
    await waitFor(() => expect(screen.getAllByText('Chat a')).toHaveLength(2));
    fireEvent.click(screen.getAllByRole('button', {name: 'threadList.archiveThread'})[0]);
    expect(screen.queryByText('Chat a')).toBeNull();
    expect(screen.queryByText('Pinned A')).toBeNull();
    expect(useCodexStore.getState().currentThreadId).toBeNull();
    await act(async () => request.resolve({}));
    await waitFor(() => expect(wire.post.mock.calls.length).toBeGreaterThan(2));
    expect(screen.queryByText('Chat a')).toBeNull();
    expect(useCodexStore.getState().threads.map(t => t.id)).toEqual(['b']);
    expect(usePinStore.getState().pinned).toEqual([]);
    expect(screen.getAllByText('Chat b')).toHaveLength(2);
  });

  it.each([['archive', archiveThread], ['delete', deleteThread]] as const)('%s rolls back a failed request and restores selection without dropping history', async (_, mutate) => {
    const request = deferred();
    wire.mutate.mockReturnValue(request.promise);
    render(<ThreadList all />);
    await screen.findByText('Chat a');
    let work!: Promise<unknown>;
    act(() => { work = mutate('a'); });
    expect(screen.queryByText('Chat a')).toBeNull();
    const failed = expect(work).rejects.toThrow('offline');
    await act(async () => { request.reject(new Error('offline')); await failed; });
    expect(screen.getByText('Chat a')).toBeTruthy();
    expect(useCodexStore.getState().currentThreadId).toBe('a');
    expect(useCodexStore.getState().currentTurnId).toBe('turn-a');
    expect(usePinStore.getState().pinned).toHaveLength(1);
    expect(useAgentCenterStore.getState().cards).toHaveLength(1);
  });

  it.each(['another chat', 'new chat', 'draft', 'settings'])('does not undo user navigation to %s after a failed delete', async (navigation) => {
    const request = deferred(); wire.mutate.mockReturnValue(request.promise);
    const work = deleteThread('a');
    if (navigation === 'another chat') useCodexStore.setState({currentThreadId: 'b'});
    if (navigation === 'new chat') useCodexStore.getState().triggerInputFocus();
    if (navigation === 'draft') useInputStore.setState({inputValue: 'new draft'});
    if (navigation === 'settings') useLayoutStore.getState().setView('settings');
    const failed = expect(work).rejects.toThrow('offline');
    request.reject(new Error('offline')); await failed;
    expect(useCodexStore.getState().currentThreadId).toBe(navigation === 'another chat' ? 'b' : null);
    expect(useThreadVisibilityStore.getState().entries.a).toBeUndefined();
  });

  it('never steals the newly selected chat when delete succeeds', async () => {
    const request = deferred(); wire.mutate.mockReturnValue(request.promise);
    const work = deleteThread('a');
    useCodexStore.setState({currentThreadId: 'b'});
    request.resolve({}); await work;
    expect(useCodexStore.getState().currentThreadId).toBe('b');
    expect(useThreadVisibilityStore.getState().entries.a.hidden).toBe(true);
  });

  it('uses the same immediate behavior through the archive keyboard shortcut', async () => {
    const request = deferred(); wire.mutate.mockReturnValue(request.promise);
    renderHook(() => useGlobalShortcuts());
    fireEvent.keyDown(window, {key: 'a', code: 'KeyA', ctrlKey: true, shiftKey: true});
    expect(wire.mutate).toHaveBeenCalledWith('/api/codex/thread/archive', {threadId:'a'}, {suppressToast:true});
    expect(useCodexStore.getState().currentThreadId).toBeNull();
    expect(useThreadVisibilityStore.getState().entries.a.hidden).toBe(true);
    await act(async () => request.resolve({}));
  });
});

it('restores the latest completed-turn state if a turn finishes during failed archive', async () => {
  const request = deferred(); wire.mutate.mockReturnValue(request.promise);
  const work = archiveThread('a');
  useCodexStore.setState({turnTimingMap:{a:{turnId:'turn-a',startedAtMs:1,durationMs:10,status:'completed'}}});
  const failed = expect(work).rejects.toThrow('offline');
  request.reject(new Error('offline')); await failed;
  expect(useCodexStore.getState().currentThreadId).toBe('a');
  expect(useCodexStore.getState().currentTurnId).toBeNull();
});

it('keeps concurrent unarchive rollback local to its own row and lists custom providers', async () => {
  const a=deferred(), b=deferred();
  wire.mutate.mockImplementation((_path, params) => params.threadId === 'a' ? a.promise : b.promise);
  render(<ArchivedThreadSettings />);
  await screen.findByText('a');
  expect(wire.post).toHaveBeenCalledWith('/api/codex/thread/list', expect.objectContaining({archived:true,modelProviders:[]}));
  fireEvent.click(screen.getAllByRole('button',{name:'archived.unarchive'})[0]);
  expect(screen.queryByText('a')).toBeNull();
  fireEvent.click(screen.getAllByRole('button',{name:'archived.unarchive'})[0]);
  await act(async () => b.resolve({}));
  await act(async () => a.reject(new Error('offline')));
  expect(screen.getByText('a')).toBeTruthy();
  expect(screen.queryByText('b')).toBeNull();
});

describe('server lifecycle notifications and HTTP races', () => {
  it.each(['archived', 'deleted'] as const)('handles external %s notification without adding transcript events', (event) => {
    const addEvent = vi.spyOn(useCodexStore.getState(), 'addEvent');
    const {result} = renderHook(() => useServerNotificationHandler(refs, vi.fn()));
    act(() => result.current({method: `thread/${event}`, params:{threadId:'a'}}));
    expect(useCodexStore.getState().currentThreadId).toBeNull();
    expect(useCodexStore.getState().threads.map(t=>t.id)).toEqual(['b']);
    expect(addEvent).not.toHaveBeenCalled();
  });

  it('keeps confirmed archive when its notification precedes a transport error', async () => {
    const request = deferred(); wire.mutate.mockReturnValue(request.promise);
    const {result} = renderHook(() => useServerNotificationHandler(refs, vi.fn()));
    let work!: Promise<unknown>;
    act(() => { work = archiveThread('a'); result.current({method:'thread/archived',params:{threadId:'a'}}); });
    await act(async () => { request.reject(new Error('connection lost')); await work; });
    expect(useThreadVisibilityStore.getState().entries.a).toMatchObject({hidden:true,pending:false});
    expect(useCodexStore.getState().currentThreadId).toBeNull();
  });

  it('does not let a late archive response reverse a newer unarchive notification', async () => {
    const request = deferred(); wire.mutate.mockReturnValue(request.promise);
    const {result} = renderHook(() => useServerNotificationHandler(refs, vi.fn()));
    let work!: Promise<unknown>;
    act(() => { work = archiveThread('a'); result.current({method:'thread/archived',params:{threadId:'a'}}); result.current({method:'thread/unarchived',params:{threadId:'a'}}); });
    await act(async () => { request.resolve({}); await work; });
    expect(useThreadVisibilityStore.getState().entries.a.hidden).toBe(false);
  });

  it('reloads the regular sidebar when unarchive completes without a notification', async () => {
    await archiveThread('a');
    render(<ThreadList all />);
    await screen.findByText('Chat b');
    expect(screen.queryByText('Chat a')).toBeNull();
    await act(async () => { await unarchiveThread('a'); });
    expect(await screen.findByText('Chat a')).toBeTruthy();
    expect(useThreadVisibilityStore.getState().entries.a.hidden).toBe(false);
  });

  it('filters an old list request that completes after delete confirmation', async () => {
    const oldList = deferred(); wire.post.mockReturnValue(oldList.promise);
    render(<ThreadList all />);
    await act(async () => { await deleteThread('a'); });
    await act(async () => oldList.resolve(page));
    expect(screen.queryByText('Chat a')).toBeNull();
    expect(screen.getByText('Chat b')).toBeTruthy();
  });
});
