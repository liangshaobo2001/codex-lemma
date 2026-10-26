import type { ReasoningEffort, ServerNotification } from '@/bindings';
import type {
  SandboxMode,
  SandboxPolicy,
  Thread,
  ThreadForkParams,
  ThreadGoalClearParams,
  ThreadGoalSetParams,
  ThreadListParams,
  ThreadResumeParams,
  ThreadRevertParams,
  ThreadStartParams,
  UserInput,
} from '@/bindings/v2';
import {
  ACCESS_MODES,
  useCodexStore,
  useConfigStore,
  useThreadQueueStore,
  useThreadReadStateStore,
} from '@/components/codex/stores';
import {
  historyEvents,
  LIVE_EVENT_LIMIT,
  mergeHistoryEvents,
  useThreadHistory,
} from '@/components/codex/stores/threadHistory';
import { useSessionTools } from '@/components/codex/stores/useSessionTools';
import { useThreadModels } from '@/components/codex/stores/useThreadModels';
import {
  isWriterConflict,
  useWriterConflictStore,
} from '@/components/codex/stores/useWriterConflictStore';
import { findProjectForCwd } from '@/features/projects/projectModel';
import { useServerProjectsStore } from '@/features/projects/useServerProjectsStore';
import { useWorkspaceStore } from '@/stores';
import { useModelSettingsStore, useSettingsStore } from '@/stores/settings';
import {
  threadStart as apiThreadStart,
  gitCreateWorktree,
  listThreads,
  readThread,
  skillList,
  threadCompactStart,
  threadFork,
  threadGoalClear,
  threadGoalSet,
  threadQueueAdd,
  threadQueueDelete,
  threadQueueReorder,
  threadQueueStart,
  threadResume,
  threadRevert,
  turnInterrupt,
  turnSettingsUpdate,
  turnStart,
  turnSteer,
} from './apiAdapt';
import { historyPage } from './apiAdapt/history';
import { loadToolUsage } from './apiAdapt/toolUsage';
import {
  confirmThreadModel,
  modelOperation,
  refreshThreadModel,
  requireThreadModel,
} from './threadModelService';

function requireSavedTools(threadId: string) {
  const tools = useSessionTools.getState();
  if (tools.pending[threadId] || tools.errors[threadId])
    throw new Error('Finish saving or reload the tool selection before sending.');
}

/** The context window the user set for a model in Settings → Models, as a Codex config override. */
const contextWindowConfig = (provider: string, model: string): Record<string, number> => {
  const contextWindow = useModelSettingsStore
    .getState()
    .models[provider]?.find((m) => m.id === model)?.contextWindow;
  return contextWindow ? { model_context_window: contextWindow } : {};
};

/** Resume overrides for a thread opened as it is: its own model's context window, read from its metadata. */
async function resumeConfigFor(threadId: string): Promise<Omit<ThreadResumeParams, 'threadId'>> {
  let meta: Thread | undefined = useCodexStore.getState().threads.find((t) => t.id === threadId);
  if (!meta) {
    try {
      meta = (await readThread({ threadId, includeTurns: false })).thread;
    } catch {
      return {};
    }
  }
  if (!meta?.modelProvider || !meta.model) return {};
  const config = contextWindowConfig(meta.modelProvider, meta.model);
  return Object.keys(config).length > 0 ? { config } : {};
}

const sandboxModeToPolicy = (mode: SandboxMode, networkAccess: boolean): SandboxPolicy => {
  switch (mode) {
    case 'read-only':
      return { type: 'readOnly', networkAccess };
    case 'workspace-write':
      return {
        type: 'workspaceWrite',
        writableRoots: [],
        networkAccess,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false,
      };
    case 'danger-full-access':
      return { type: 'dangerFullAccess' };
  }
};

const resolveThreadCwd = (threadId: string): string | null => {
  const { threads } = useCodexStore.getState();
  const item = threads.find((thread) => thread.id === threadId);
  if (!item) {
    return null;
  }
  const cwd = item.cwd?.trim();
  return cwd ? cwd : null;
};

const generateWorktreeKey = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `thread-${crypto.randomUUID()}`;
  }
  return `thread-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

/** Build the agents config fragment to inject into thread config params. */
const buildAgentsConfigFragment = (): Record<string, unknown> => {
  const { agentsMaxThreads, agentsMaxDepth } = useSettingsStore.getState();
  return {
    'features.multi_agents': true,
    'agents.max_threads': agentsMaxThreads,
    'agents.max_depth': agentsMaxDepth,
  };
};

/** Build UserInput[] from text + image paths, ensuring at least one entry. */
const buildUserInputs = (input: string, images: string[] = []): UserInput[] => {
  const userInputs: UserInput[] = [];

  if (input.trim()) {
    userInputs.push({ type: 'text', text: input, text_elements: [] });
  }

  for (const imagePath of images) {
    userInputs.push({ type: 'localImage', path: imagePath });
  }

  // If both are empty, send an empty text input as a fallback.
  if (userInputs.length === 0) {
    userInputs.push({ type: 'text', text: '', text_elements: [] });
  }

  return userInputs;
};

const getThreadPreviewFromInput = (userInputs: UserInput[]): string => {
  for (const item of userInputs) {
    if (item.type !== 'text') {
      continue;
    }
    const text = item.text.trim();
    if (text) {
      return text;
    }
  }
  return '';
};

/** Synchronizes thread data to the Zustand store with consistent logic */
const syncThreadToStore = (
  threadId: string,
  thread: Thread,
  historicalEvents: ServerNotification[],
  options: {
    resetCurrentTurnId?: boolean;
    activate?: boolean;
  } = {}
) => {
  const { resetCurrentTurnId = false, activate = true } = options;
  const confirmedModel = useThreadModels.getState().confirmed[threadId];
  thread = { ...thread, ...confirmedModel };
  const { activeThreadIds, events, threads, inputFocusTrigger } = useCodexStore.getState();

  return {
    ...(activate ? { currentThreadId: threadId, inputFocusTrigger: inputFocusTrigger + 1 } : {}),
    activeThreadIds: activeThreadIds.includes(threadId)
      ? activeThreadIds
      : [...activeThreadIds, threadId],
    threads: threads.some((t) => t.id === threadId)
      ? threads.map((t) => (t.id === threadId ? { ...thread, turns: [] } : t))
      : [{ ...thread, turns: [] }, ...threads],
    events: {
      ...events,
      [threadId]: historicalEvents.slice(-LIVE_EVENT_LIMIT),
    },
    ...(resetCurrentTurnId ? { currentTurnId: null } : {}),
  };
};

// This store feeds every sidebar scope, although a request only lists one cwd.
let threadListRequest = 0;

export const codexService = {
  async loadThreads(
    cwd: string | null,
    archived: boolean = false,
    sortKey: 'created_at' | 'updated_at' = 'updated_at'
  ) {
    const request = ++threadListRequest;
    const before = new Map(useCodexStore.getState().threads.map((thread) => [thread.id, thread]));
    try {
      const params: ThreadListParams = {
        cursor: null,
        limit: 20,
        modelProviders: null,
        archived,
        sortKey,
        cwd,
        useStateDbOnly: true,
      };
      const response = await listThreads(params);
      if (request !== threadListRequest) return;
      useThreadReadStateStore.getState().mergeFromList(response.readStates);
      useCodexStore.setState((state) => {
        const current = new Map(state.threads.map((thread) => [thread.id, thread]));
        const active = new Set(state.activeThreadIds);
        const rows = new Map<string, Thread>(
          response.data.map((thread) => {
            const live = current.get(thread.id);
            // A create, rename or model update after this request began wins.
            return [
              thread.id,
              live && before.get(thread.id) !== live
                ? { ...thread, ...live, turns: [] }
                : { ...thread, turns: [] },
            ];
          })
        );
        for (const live of state.threads) {
          // A filtered/paginated DB page is not a deletion of an open chat.
          if (!rows.has(live.id) && (active.has(live.id) || before.get(live.id) !== live)) {
            rows.set(live.id, live);
          }
        }
        return { threads: [...rows.values()], threadListNextCursor: response.nextCursor ?? null };
      });
    } catch (error: unknown) {
      if (request !== threadListRequest) return;
      console.error('[CodexService] Failed to load threads:', error);
      useCodexStore.getState().setThreadListNextCursor(null);
    }
  },
  async setCurrentThread(threadId: string | null) {
    // Live threads (already in activeThreadIds with cached events) just
    // switch view + derive activeTurnId. Dormant threads are resumed
    // automatically so the agent process is ready for the next message.
    const set = useCodexStore.setState;
    try {
      if (!threadId) {
        set((state) => ({
          currentThreadId: null,
          currentTurnId: null,
          inputFocusTrigger: state.inputFocusTrigger + 1,
        }));
        return;
      }

      const state = useCodexStore.getState();

      if (state.activeThreadIds.includes(threadId) && state.events[threadId]) {
        set({ currentThreadId: threadId });
        await refreshThreadModel(threadId);
        const liveState = useCodexStore.getState();
        if (liveState.currentThreadId !== threadId) return;
        // Live thread — derive the active turn id from streaming events so the
        // Stop button works correctly when a turn is in progress.
        const threadEvents = liveState.events[threadId] ?? [];
        const timing = liveState.turnTimingMap[threadId];
        let activeTurnId: string | null = timing?.status === 'inProgress' ? timing.turnId : null;
        for (let i = threadEvents.length - 1; !timing && activeTurnId === null && i >= 0; i--) {
          const e = threadEvents[i];
          if (e.method === 'turn/started') {
            activeTurnId = (e.params as { turn: { id: string } }).turn.id;
            break;
          }
          if (e.method === 'turn/completed' || e.method === 'error') {
            break;
          }
        }
        set((state) => ({
          currentThreadId: threadId,
          currentTurnId: activeTurnId,
          inputFocusTrigger: state.inputFocusTrigger + 1,
        }));
        if (!useThreadHistory.getState().threads[threadId]) {
          if (
            threadEvents.length === 0 &&
            !liveState.threads.find((t) => t.id === threadId)?.preview.trim()
          ) {
            useThreadHistory.getState().reset(threadId, { entries: [], nextCursor: null });
            return;
          }
          const version = useThreadHistory.getState().begin(threadId);
          try {
            void loadToolUsage(threadId);
            const page = await historyPage(threadId);
            if (useThreadHistory.getState().threads[threadId]?.generation === version)
              useThreadHistory.getState().reset(threadId, page);
          } catch (error) {
            if (useThreadHistory.getState().threads[threadId]?.generation === version)
              useThreadHistory.getState().fail(threadId, error);
          }
        }
      } else {
        // Dormant — switch view and resume the agent process immediately.
        set((state) => ({
          currentThreadId: threadId,
          currentTurnId: null,
          inputFocusTrigger: state.inputFocusTrigger + 1,
        }));
        await codexService.threadResume(threadId);
      }
    } catch (error: unknown) {
      console.error('[CodexService] setCurrentThread error:', error);
      throw error;
    }
  },
  async threadStart() {
    const set = useCodexStore.setState;
    try {
      const {
        model,
        modelProvider,
        accessMode,
        reasoningEffort,
        webSearchRequest,
        threadCwdMode,
        collaborationMode,
      } = useConfigStore.getState();
      const { sandbox, approvalPolicy, approvalsReviewer } = ACCESS_MODES[accessMode];
      const { cwd } = useWorkspaceStore.getState();
      let threadCwd = cwd;
      if (threadCwdMode === 'worktree' && cwd) {
        try {
          const prepared = await gitCreateWorktree(cwd, generateWorktreeKey());
          threadCwd = prepared.worktree_path;
        } catch (error) {
          console.warn(
            '[CodexService] Failed to prepare thread worktree, fallback to workspace cwd',
            error
          );
        }
      }
      // Assign the chat to the app-server project that owns this workspace, so
      // other clients list it there. Only sent once projects are known to work.
      const projectState = useServerProjectsStore.getState();
      const projectId =
        projectState.status === 'ready'
          ? (findProjectForCwd(projectState.projects, cwd)?.id ?? null)
          : null;
      const params: ThreadStartParams = {
        model,
        modelProvider,
        cwd: threadCwd,
        ...(projectId ? { projectId } : {}),
        approvalPolicy,
        approvalsReviewer,
        sandbox,
        baseInstructions: null,
        developerInstructions: null,
        config: {
          ...contextWindowConfig(modelProvider, model),
          model_reasoning_effort: reasoningEffort,
          show_raw_agent_reasoning: false,
          model_reasoning_summary: 'auto',
          web_search_request: webSearchRequest,
          view_image_tool: true,
          // Inject user-configured multi-agent limits.
          ...buildAgentsConfigFragment(),
          // Inject plan mode when selected.
          ...(collaborationMode === 'plan'
            ? {
                collaboration_mode: {
                  mode: 'plan',
                  settings: {
                    model,
                    reasoning_effort: reasoningEffort,
                    developer_instructions: null,
                  },
                },
              }
            : {}),
        },
      };
      const response = await apiThreadStart(params);
      const thread = response.thread;
      confirmThreadModel(thread.id, response);

      set({ ...syncThreadToStore(thread.id, thread, []) });

      console.log('[CodexService] threadStart completed successfully');
      return thread;
    } catch (error: unknown) {
      console.error('[CodexService] threadStart error:', error);
      throw error;
    }
  },
  async threadResume(threadId: string, overrides?: Omit<ThreadResumeParams, 'threadId'>) {
    const set = useCodexStore.setState;
    const version = useThreadHistory.getState().begin(threadId);
    const selectedAtStart = useCodexStore.getState().currentThreadId;
    const activate = () =>
      useCodexStore.getState().currentThreadId === threadId ||
      (selectedAtStart === null && useCodexStore.getState().currentThreadId === null);
    try {
      const extra =
        overrides?.config || overrides?.modelProvider ? {} : await resumeConfigFor(threadId);
      const previousEvents = new Set(useCodexStore.getState().events[threadId] ?? []);
      const response = await modelOperation(threadId, async () => {
        const result = await threadResume({ threadId, ...extra, ...overrides, excludeTurns: true });
        confirmThreadModel(threadId, result);
        return result;
      });

      void loadToolUsage(threadId);
      const page = await historyPage(threadId);
      if (useThreadHistory.getState().threads[threadId]?.generation !== version) return;

      const state = useCodexStore.getState();
      const liveTurnId = state.turnTimingMap[threadId]?.turnId;
      const live = (state.events[threadId] ?? []).filter((event) => {
        const params = event.params as { turnId?: string; turn?: { id: string } };
        return (
          !previousEvents.has(event) ||
          (liveTurnId !== undefined && (params.turnId ?? params.turn?.id) === liveTurnId)
        );
      });
      const historicalEvents = mergeHistoryEvents(historyEvents(page, threadId), live);
      useThreadHistory.getState().reset(threadId, page);
      const normalized = { ...response.thread, turns: [] };

      useWriterConflictStore.getState().unlock(threadId);
      set({
        ...syncThreadToStore(threadId, normalized, historicalEvents, { activate: activate() }),
      });
    } catch (error: unknown) {
      if (useThreadHistory.getState().threads[threadId]?.generation !== version) return;
      if (!isWriterConflict(error)) {
        useThreadHistory.getState().fail(threadId, error);
        console.error('[CodexService] threadResume error:', error);
        throw error;
      }
      // Another client owns the thread. Show its history read-only and lock the
      // composer now, rather than waiting for a send to fail.
      console.warn('[CodexService] thread is owned by another client:', threadId);
      try {
        const { thread } = await readThread({ threadId, includeTurns: false });
        void loadToolUsage(threadId);
        const page = await historyPage(threadId);
        if (useThreadHistory.getState().threads[threadId]?.generation !== version) return;
        const historicalEvents = historyEvents(page, threadId);
        useThreadHistory.getState().reset(threadId, page);
        set({ ...syncThreadToStore(threadId, thread, historicalEvents, { activate: activate() }) });
        useWriterConflictStore.getState().lock(threadId);
      } catch (readError) {
        if (useThreadHistory.getState().threads[threadId]?.generation === version)
          useThreadHistory.getState().fail(threadId, readError);
        throw readError;
      }
    }
  },
  async threadFork(threadId: string) {
    const set = useCodexStore.setState;
    try {
      const params: ThreadForkParams = {
        threadId,
        excludeTurns: true,
      };
      const response = await threadFork(params);
      confirmThreadModel(response.thread.id, response);
      const page = await historyPage(response.thread.id);
      useThreadHistory.getState().reset(response.thread.id, page);
      set({
        ...syncThreadToStore(
          response.thread.id,
          response.thread,
          historyEvents(page, response.thread.id),
          { resetCurrentTurnId: true }
        ),
      });
      return response.thread;
    } catch (error: unknown) {
      console.error('[CodexService] threadFork error:', error);
      throw error;
    }
  },
  async threadRevert(threadId: string, beforeTurnId: string) {
    try {
      const params: ThreadRevertParams = { threadId, beforeTurnId };
      await threadRevert(params);
      // The revert response omits turns, so reload the retained history.
      await codexService.threadResume(threadId);
    } catch (error: unknown) {
      console.error('[CodexService] threadRevert error:', error);
      throw error;
    }
  },
  async turnStart(threadId: string, input: string, images: string[] = []) {
    const set = useCodexStore.setState;
    try {
      const userInputs = buildUserInputs(input, images);

      const { model, reasoningEffort } = await requireThreadModel(threadId);
      requireSavedTools(threadId);
      const { accessMode, webSearchRequest } = useConfigStore.getState();
      const { sandbox, approvalPolicy, approvalsReviewer } = ACCESS_MODES[accessMode];

      const response = await turnStart({
        threadId,
        input: userInputs,
        cwd: resolveThreadCwd(threadId),
        approvalPolicy,
        approvalsReviewer,
        sandboxPolicy: sandboxModeToPolicy(sandbox, webSearchRequest),
        model: model || null,
        effort: reasoningEffort ?? null,
      });

      const preview = getThreadPreviewFromInput(userInputs);
      set((state) => ({
        currentTurnId: response.turn.id,
        threads: state.threads.map((thread) => {
          if (thread.id !== threadId) {
            return thread;
          }
          if (thread.preview.trim() || !preview) {
            return thread;
          }
          return {
            ...thread,
            preview,
          };
        }),
      }));
      return response.turn;
    } catch (error: unknown) {
      console.error('[CodexService] turnStart error:', error);
      throw error;
    }
  },
  async turnSteer(threadId: string, expectedTurnId: string, input: string, images: string[] = []) {
    try {
      const userInputs = buildUserInputs(input, images);

      await requireThreadModel(threadId);
      requireSavedTools(threadId);
      const response = await turnSteer({
        threadId,
        expectedTurnId,
        input: userInputs,
      });

      return response;
    } catch (error: unknown) {
      console.error('[CodexService] turnSteer error:', error);
      throw error;
    }
  },
  /**
   * Queues a message on the app-server; it starts when the thread next goes
   * idle after a completed turn. Throws if the server rejects it.
   */
  async threadQueueAdd(threadId: string, input: string, images: string[] = []) {
    await requireThreadModel(threadId);
    requireSavedTools(threadId);
    const response = await threadQueueAdd({
      threadId,
      input: buildUserInputs(input, images),
      clientUserMessageId: crypto.randomUUID(),
    });
    await useThreadQueueStore.getState().refresh(threadId);
    return response.queuedSubmission;
  },
  async threadQueueDelete(threadId: string, queuedSubmissionId: string) {
    await threadQueueDelete({ threadId, queuedSubmissionId });
    await useThreadQueueStore.getState().refresh(threadId);
  },
  /** `queuedSubmissionIds` is the complete new order of the thread's queue. */
  async threadQueueReorder(threadId: string, queuedSubmissionIds: string[]) {
    await threadQueueReorder({ threadId, queuedSubmissionIds });
    await useThreadQueueStore.getState().refresh(threadId);
  },
  /** Starts one queued message now; the server rejects it while a turn is active. */
  async threadQueueStart(threadId: string, queuedSubmissionId: string) {
    try {
      await requireThreadModel(threadId);
      requireSavedTools(threadId);
      const response = await threadQueueStart({ threadId, queuedSubmissionId });
      useCodexStore.setState({ currentTurnId: response.turn.id });
      return response.turn;
    } finally {
      await useThreadQueueStore.getState().refresh(threadId);
    }
  },
  /**
   * Changes model/effort of one running turn only (experimental). Resolves with
   * the server status; `targetUnavailable` means nothing was changed.
   */
  async turnSettingsUpdate(
    threadId: string,
    turnId: string,
    settings: { model?: string; effort?: ReasoningEffort }
  ) {
    const response = await turnSettingsUpdate({ threadId, turnId, ...settings });
    return response.status;
  },
  async turnInterrupt(threadId: string, turnId: string) {
    const set = useCodexStore.setState;
    try {
      await turnInterrupt({ threadId, turnId });
      set({ currentTurnId: null });
    } catch (error: unknown) {
      console.error('[CodexService] turnInterrupt error:', error);
      throw error;
    }
  },
  async listSkills(cwd: string | null) {
    if (!cwd) return [];
    try {
      const response = await skillList(cwd);
      return response.data;
    } catch (error: unknown) {
      console.error('[CodexService] listSkills error:', error);
      throw error;
    }
  },
  async threadGoalSet(params: ThreadGoalSetParams) {
    try {
      await requireThreadModel(params.threadId);
      requireSavedTools(params.threadId);
      const response = await threadGoalSet(params);
      return response;
    } catch (error: unknown) {
      console.error('[CodexService] threadGoalSet error:', error);
      throw error;
    }
  },
  async threadCompact(threadId: string) {
    try {
      await requireThreadModel(threadId);
      requireSavedTools(threadId);
      return await threadCompactStart({ threadId });
    } catch (error: unknown) {
      console.error('[CodexService] threadCompact error:', error);
      throw error;
    }
  },
  async threadGoalClear(params: ThreadGoalClearParams) {
    try {
      const response = await threadGoalClear(params);
      return response;
    } catch (error: unknown) {
      console.error('[CodexService] threadGoalClear error:', error);
      throw error;
    }
  },
};
