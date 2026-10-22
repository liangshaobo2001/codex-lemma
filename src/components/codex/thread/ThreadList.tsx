import { listen } from '@tauri-apps/api/event';
import type { LucideIcon } from 'lucide-react';
import { Archive, FolderX, GitFork, Loader2, MailOpen, Pin, PinOff } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ServerNotification } from '@/bindings/ServerNotification';
import type {
  Thread,
  ThreadListParams,
  ThreadListResponse,
  ThreadNameUpdatedNotification,
} from '@/bindings/v2';
import {
  isThreadUnread,
  useCodexStore,
  useThreadListStore,
  useThreadReadStateStore,
} from '@/components/codex/stores';
import { RenameThreadDialog } from '@/components/codex/thread/RenameThreadDialog';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { toast } from '@/components/ui/use-toast';
import { threadInScope } from '@/features/projects/projectModel';
import { useServerProjectsStore } from '@/features/projects/useServerProjectsStore';
import { isDesktopTauri } from '@/hooks/runtime';
import { THREADS_CHANGED_EVENT } from '@/hooks/useGlobalShortcuts';
import { archiveThread, deleteThread, listThreads, renameThread } from '@/services/apiAdapt';
import { gitRemoveWorktree } from '@/services/apiAdapt/git';
import { codexService } from '@/services/codexService';
import { setThreadReadState } from '@/services/threadReadState';
import { useAgentCenterStore, useLayoutStore } from '@/stores';
import { usePinStore } from '@/stores/usePinStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { formatThreadAge } from '@/utils/formatThreadAge';

interface ThreadListProps {
  /** Lists threads whose session cwd matches; ignored when `projectId` is set. */
  cwd?: string;
  /**
   * Lists the threads app-server assigned to this project, or the unassigned
   * ones for `null` (the "Recent" group). Takes precedence over `cwd`.
   */
  projectId?: string | null;
  /** Lists every thread regardless of project or cwd (the one-list sidebar view). */
  all?: boolean;
}

interface ThreadAction {
  label: string;
  icon?: LucideIcon;
  destructive?: boolean;
  separatorBefore?: boolean;
  onSelect: () => void;
}

const EMPTY_LIST: ThreadListResponse = {
  data: [],
  nextCursor: null,
  backwardsCursor: null,
  readStates: null,
};

const PAGE_SIZE = 3;
const ALL_PAGE_SIZE = 20;

export function ThreadList({ cwd: cwdProp, projectId, all = false }: ThreadListProps) {
  const { t } = useTranslation('chat');
  const byProject = projectId !== undefined;
  const cwd = cwdProp ?? '';
  const scopeKey = all ? 'all' : byProject ? `project:${projectId}` : cwd;
  const pageSize = all ? ALL_PAGE_SIZE : PAGE_SIZE;
  const threadsVersion = useServerProjectsStore((s) => s.threadsVersion);
  const { cwd: workspaceCwd, setCwd } = useWorkspaceStore();
  const { setView } = useLayoutStore();
  const { addAgentCard, setCurrentAgentCardId } = useAgentCenterStore();
  const { currentThreadId, threadStatusMap, threads: storeThreads } = useCodexStore();
  const { sortKey } = useThreadListStore();
  const pinnedIds = usePinStore((s) => s.pinned);
  const togglePin = usePinStore((s) => s.togglePin);
  const readStates = useThreadReadStateStore((s) => s.states);
  const [response, setResponse] = useState<ThreadListResponse>(EMPTY_LIST);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [renameThreadId, setRenameThreadId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [pressedThreadId, setPressedThreadId] = useState<string | null>(null);

  const nextCursor = response.nextCursor;

  // A freshly started thread is not in the state DB yet, so the backend list
  // does not return it. Merge in live threads from the store so it shows up
  // immediately; the DB row takes over on the next reload.
  const threads = useMemo(() => {
    const seen = new Set(response.data.map((t) => t.id));
    const live = storeThreads.filter(
      (t) =>
        (all || (byProject ? threadInScope(t, projectId ?? null) : t.cwd === cwd)) &&
        !seen.has(t.id)
    );
    if (live.length === 0) return response.data;
    const key = sortKey === 'created_at' ? 'createdAt' : 'updatedAt';
    return [...live, ...response.data].sort((a, b) => b[key] - a[key]);
  }, [response.data, storeThreads, all, byProject, projectId, cwd, sortKey]);

  // --- Thread loading (search + sort delegated to backend) ---

  // Threads of every provider; an empty filter means all of them (Codex's thread/list).
  const providerFilter = useMemo<string[]>(() => [], []);

  // Keep however many threads are already visible when the list reloads
  // (select / delete / archive / fork) instead of collapsing back to one page.
  const loadedRef = useRef({ scope: scopeKey, count: 0 });
  if (loadedRef.current.scope !== scopeKey) loadedRef.current = { scope: scopeKey, count: 0 };

  // Project scope filters on the server's assignment; otherwise on exact cwd.
  const scopeParams = useMemo<Pick<ThreadListParams, 'cwd' | 'projectId'>>(
    () => (all ? {} : byProject ? { projectId } : { cwd }),
    [all, byProject, projectId, cwd]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshCounter is the manual reload trigger
  useEffect(() => {
    let cancelled = false;
    const params: ThreadListParams = {
      limit: Math.max(pageSize, loadedRef.current.count),
      sortKey,
      modelProviders: providerFilter,
      ...scopeParams,
      useStateDbOnly: true,
    };
    const load = async () => {
      try {
        const res = await listThreads(params);
        if (cancelled) return;
        loadedRef.current = { scope: scopeKey, count: res.data.length };
        useThreadReadStateStore.getState().mergeFromList(res.readStates);
        setResponse(res);
      } catch (err) {
        if (!cancelled) console.error('Failed to load threads:', err);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [scopeKey, scopeParams, sortKey, providerFilter, refreshCounter, threadsVersion]);

  const refresh = useCallback(() => setRefreshCounter((n) => n + 1), []);

  // Shortcuts (e.g. archive chat) change the list from outside this component.
  useEffect(() => {
    window.addEventListener(THREADS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(THREADS_CHANGED_EVENT, refresh);
  }, [refresh]);

  // When a new thread is created in the store (e.g. after threadStart),
  // refresh the list so the sidebar reflects it immediately.
  const seenStoreIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const localIds = new Set(response.data.map((t) => t.id));
    const newIds = storeThreads
      .filter(
        (t) =>
          (byProject ? threadInScope(t, projectId ?? null) : t.cwd === cwd) &&
          !localIds.has(t.id) &&
          !seenStoreIdsRef.current.has(t.id)
      )
      .map((t) => t.id);
    if (newIds.length === 0) return;
    for (const id of newIds) seenStoreIdsRef.current.add(id);
    refresh();
  }, [storeThreads, response.data, byProject, projectId, cwd, refresh]);

  useEffect(() => {
    if (!isDesktopTauri()) return;

    const unlisten = listen<ServerNotification>('codex:notification', (event) => {
      const { method, params } = event.payload;
      if (method !== 'thread/name/updated') return;
      const { threadId, threadName } = params as ThreadNameUpdatedNotification;
      setResponse((prev) => ({
        ...prev,
        data: prev.data.map((t) => (t.id === threadId ? { ...t, name: threadName ?? null } : t)),
      }));
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  // --- Thread actions ---

  const handleSelectThread = useCallback(
    async (threadId: string, threadCwd: string) => {
      if (threadId === currentThreadId) return;
      if (threadCwd && threadCwd !== workspaceCwd) setCwd(threadCwd);
      await codexService.setCurrentThread(threadId);
    },
    [currentThreadId, workspaceCwd, setCwd]
  );

  const handleOpenThread = useCallback(
    async (threadId: string, threadCwd: string, preview?: string) => {
      addAgentCard({ kind: 'codex', id: threadId, preview, cwd: threadCwd });
      setCurrentAgentCardId(threadId);
      setView('agent');
      await handleSelectThread(threadId, threadCwd);
    },
    [handleSelectThread, setView, setCurrentAgentCardId, addAgentCard]
  );

  const handleArchive = useCallback(
    async (threadId: string) => {
      try {
        await archiveThread(threadId);
      } catch (err) {
        toast.error(t('threadList.archiveFailed'), { description: String(err) });
        return;
      }
      refresh();
    },
    [refresh, t]
  );

  const handleFork = useCallback(
    async (threadId: string) => {
      const thread = threads.find((t) => t.id === threadId);
      try {
        await codexService.threadFork(threadId);
      } catch (err) {
        toast.error(t('threadList.forkFailed'), { description: String(err) });
        return;
      }
      addAgentCard({
        kind: 'codex',
        id: threadId,
        preview: thread?.preview,
        cwd: thread?.cwd || cwd,
      });
      setCurrentAgentCardId(threadId);
      setView('agent');
      refresh();
    },
    [cwd, threads, addAgentCard, setCurrentAgentCardId, setView, refresh, t]
  );

  const handleDeleteWorktree = useCallback(
    async (thread: Thread) => {
      const { cwd: mainCwd } = useWorkspaceStore.getState();
      if (!mainCwd || !thread.cwd.includes('/.codex-lemma/worktrees/')) return;
      const key = thread.cwd.split('/').pop() ?? '';
      try {
        await gitRemoveWorktree(mainCwd, key);
        toast.success(t('threadList.worktreeDeleted'));
      } catch (err) {
        toast.error(t('threadList.deleteWorktreeFailed'), { description: String(err) });
      }
    },
    [t]
  );

  const handleDelete = useCallback(
    async (threadId: string) => {
      try {
        await deleteThread(threadId);
      } catch (err) {
        toast.error(t('threadList.deleteFailed'), { description: String(err) });
        return;
      }
      if (currentThreadId === threadId) {
        await codexService.setCurrentThread(null);
      }
      refresh();
    },
    [currentThreadId, refresh, t]
  );

  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const params: ThreadListParams = {
        cursor: nextCursor,
        limit: 20,
        modelProviders: providerFilter,
        useStateDbOnly: true,
        sortKey,
        ...scopeParams,
      };
      const res = await listThreads(params);
      useThreadReadStateStore.getState().mergeFromList(res.readStates);
      setResponse((prev) => {
        const seen = new Set(prev.data.map((t) => t.id));
        const data = [...prev.data, ...res.data.filter((t) => !seen.has(t.id))];
        loadedRef.current = { scope: scopeKey, count: data.length };
        return { ...res, data };
      });
    } finally {
      setIsLoadingMore(false);
    }
  }, [scopeKey, scopeParams, isLoadingMore, nextCursor, sortKey, providerFilter]);

  const openRenameDialog = useCallback((thread: Thread) => {
    // Prefer explicit name, fall back to preview (first message).
    setRenameThreadId(thread.id);
    setRenameValue(thread.name ?? thread.preview);
  }, []);

  const handleRenameSubmit = useCallback(async () => {
    if (!renameThreadId || !renameValue.trim()) return;
    try {
      await renameThread(renameThreadId, renameValue.trim());
    } catch (err) {
      toast.error(t('threadList.renameFailed'), { description: String(err) });
      return;
    }
    setRenameThreadId(null);
    // thread/name/updated notification patches response.data directly.
  }, [renameThreadId, renameValue, t]);

  // --- Touch long press opens the context menu (touch devices get no
  // native contextmenu event, so synthesize one at the touch point) ---

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setPressedThreadId(null);
  }, []);

  const startLongPress = useCallback(
    (e: ReactPointerEvent, threadId: string) => {
      if (e.pointerType === 'mouse') return;
      const target = e.currentTarget;
      const { clientX, clientY } = e;
      cancelLongPress();
      longPressFiredRef.current = false;
      setPressedThreadId(threadId);
      longPressTimerRef.current = setTimeout(() => {
        longPressFiredRef.current = true;
        setPressedThreadId(null);
        // The press may have started a native text selection that runs past
        // the row; drop it before opening the menu.
        window.getSelection()?.removeAllRanges();
        target.dispatchEvent(
          new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX, clientY })
        );
      }, 450);
    },
    [cancelLongPress]
  );

  useEffect(() => cancelLongPress, [cancelLongPress]);

  // Shared action list for the context menu.
  const threadActions = useCallback(
    (thread: Thread): ThreadAction[] => {
      const isPinned = pinnedIds.some((p) => p.id === thread.id);
      return [
        { label: t('threadList.rename'), onSelect: () => openRenameDialog(thread) },
        {
          label: isPinned ? t('threadList.unpin') : t('threadList.pin'),
          icon: isPinned ? PinOff : Pin,
          onSelect: () =>
            togglePin({
              kind: 'codex',
              id: thread.id,
              title: thread.name ?? thread.preview,
              cwd: thread.cwd || cwd,
            }),
        },
        {
          label: isThreadUnread(readStates, thread.id)
            ? t('threadList.markRead')
            : t('threadList.markUnread'),
          icon: MailOpen,
          onSelect: () =>
            void setThreadReadState(
              thread.id,
              isThreadUnread(readStates, thread.id) ? 'read' : 'unread'
            ),
        },
        { label: t('threadList.fork'), icon: GitFork, onSelect: () => void handleFork(thread.id) },
        {
          label: t('threadList.archive'),
          icon: Archive,
          onSelect: () => void handleArchive(thread.id),
        },
        ...(thread.cwd.includes('/.codex-lemma/worktrees/')
          ? [
              {
                label: t('threadList.deleteWorktree'),
                icon: FolderX,
                onSelect: () => void handleDeleteWorktree(thread),
              },
            ]
          : []),
        {
          label: t('threadList.delete'),
          destructive: true,
          onSelect: () => void handleDelete(thread.id),
        },
        {
          label: t('threadList.copyId'),
          separatorBefore: true,
          onSelect: () => void navigator.clipboard.writeText(thread.id),
        },
      ];
    },
    [
      cwd,
      readStates,
      pinnedIds,
      togglePin,
      openRenameDialog,
      handleFork,
      handleArchive,
      handleDeleteWorktree,
      handleDelete,
      t,
    ]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col select-none [-webkit-user-select:none] [-webkit-touch-callout:none]">
      <div className="min-h-0 flex-1">
        {threads.map((thread) => (
          <ContextMenu key={thread.id}>
            <ContextMenuTrigger asChild>
              <div
                onClick={() => {
                  if (longPressFiredRef.current) {
                    longPressFiredRef.current = false;
                    return;
                  }
                  void handleOpenThread(thread.id, thread.cwd || cwd, thread.preview);
                }}
                onPointerDown={(e) => startLongPress(e, thread.id)}
                onPointerUp={cancelLongPress}
                onPointerMove={cancelLongPress}
                onPointerCancel={cancelLongPress}
                role="button"
                tabIndex={0}
                className={`group/row grid grid-cols-[1fr_auto] relative items-center gap-2 w-full text-left py-2 pr-2 pl-[26px] rounded-lg transition-all duration-200 touch-pan-y select-none [-webkit-user-select:none] [-webkit-touch-callout:none] ${
                  currentThreadId === thread.id ? 'bg-foreground/10' : 'hover:bg-foreground/5'
                } ${
                  pressedThreadId === thread.id
                    ? 'scale-[0.97] bg-accent/60 ring-1 ring-ring/60'
                    : 'scale-100'
                }`}
              >
                {/* Title starts where the project name starts (row px-1 + 14px folder icon + gap-2); the
                    spinner and unread dot hang in that gutter under the folder icon, so the title never moves. */}
                <span className="absolute left-[5px] top-1/2 flex -translate-y-1/2 items-center gap-0.5">
                  {threadStatusMap[thread.id]?.type === 'active' && (
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
                  )}
                  {isThreadUnread(readStates, thread.id) && (
                    <span
                      role="img"
                      aria-label={t('threadList.unread')}
                      className="h-2 w-2 shrink-0 rounded-full bg-blue-500"
                    />
                  )}
                </span>
                <div className="text-sm font-normal truncate min-w-0 pr-2 flex items-center">
                  <span className="truncate">
                    {thread.name ?? (thread.preview || t('threadList.newChat'))}
                  </span>
                </div>
                <div className="flex items-center justify-end h-6 w-12 relative">
                  <span className="text-xs text-muted-foreground whitespace-nowrap group-hover/row:hidden">
                    {formatThreadAge(thread.updatedAt)}
                  </span>
                  <button
                    type="button"
                    aria-label={t('threadList.archiveThread')}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleArchive(thread.id);
                    }}
                    className="absolute right-0 inline-flex items-center justify-center h-6 w-6 rounded hover:bg-accent/50 transition-colors text-muted-foreground opacity-0 group-hover/row:opacity-100"
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-44">
              {threadActions(thread).map((action) => (
                <Fragment key={action.label}>
                  {action.separatorBefore && <ContextMenuSeparator />}
                  <ContextMenuItem
                    variant={action.destructive ? 'destructive' : 'default'}
                    onSelect={action.onSelect}
                  >
                    {action.icon && <action.icon className="mr-2 h-4 w-4" />}
                    {action.label}
                  </ContextMenuItem>
                </Fragment>
              ))}
            </ContextMenuContent>
          </ContextMenu>
        ))}
        {threads.length === 0 && (
          <div className="py-2 pr-2 pl-[26px] text-xs text-sidebar-foreground/50">
            {t('threadList.empty')}
          </div>
        )}
      </div>
      {nextCursor && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLoadMore}
          disabled={isLoadingMore}
          className="justify-start"
        >
          {isLoadingMore ? t('common.loadingMore') : t('common.loadMore')}
        </Button>
      )}
      <RenameThreadDialog
        open={!!renameThreadId}
        onOpenChange={(open) => !open && setRenameThreadId(null)}
        renameValue={renameValue}
        setRenameValue={setRenameValue}
        handleRenameSubmit={handleRenameSubmit}
      />
    </div>
  );
}
