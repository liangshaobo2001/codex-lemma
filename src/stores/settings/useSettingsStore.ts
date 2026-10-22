import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TaskDetail = 'steps' | 'stepsWithCommand' | 'stepsWithOutput';
export type TaskCompleteBeepMode = 'never' | 'unfocused' | 'always';

// --- Agents config ---
// UI caps: max_threads ≤ 12, max_depth ≤ 4 (mirrors CodexMonitor product limits).
export const AGENTS_MAX_THREADS_CAP = 12;
export const AGENTS_MAX_DEPTH_CAP = 4;

export interface AgentsSettings {
  agentsMaxThreads: number;
  agentsMaxDepth: number;
  setAgentsMaxThreads: (value: number) => void;
  setAgentsMaxDepth: (value: number) => void;
}

/** The usage widgets next to the composer's send button. */
export type ComposerWidget = 'cost' | 'speed' | 'cache' | 'context';

export interface SettingState extends AgentsSettings {
  hiddenNames: string[];
  taskDetail: TaskDetail;
  setTaskDetail: (taskDetail: TaskDetail) => void;
  setHiddenNames: (hiddenNames: string[]) => void;
  addHiddenName: (name: string) => void;
  removeHiddenName: (name: string) => void;
  resetHiddenNames: () => void;
  autoCommitGitWorktree: boolean;
  setAutoCommitGitWorktree: (enabled: boolean) => void;
  enableTaskCompleteBeep: TaskCompleteBeepMode;
  setEnableTaskCompleteBeep: (mode: TaskCompleteBeepMode) => void;
  preventSleepDuringTasks: boolean;
  setPreventSleepDuringTasks: (enabled: boolean) => void;
  /** List OpenAI's own models (ChatGPT sign-in or API key) beside the configured providers. */
  showOpenAiModels: boolean;
  setShowOpenAiModels: (enabled: boolean) => void;
  composerWidgets: Record<ComposerWidget, boolean>;
  setComposerWidget: (widget: ComposerWidget, enabled: boolean) => void;
  showReasoning: boolean;
  setShowReasoning: (enabled: boolean) => void;
  enabledQuoteCategories: string[];
  setEnabledQuoteCategories: (categories: string[]) => void;
  customStunServers: string[];
  setCustomStunServers: (servers: string[]) => void;
  p2pAutoStart: boolean;
  setP2pAutoStart: (enabled: boolean) => void;
}

const DEFAULT_HIDDEN_NAMES = [
  'node_modules',
  'DS_Store',
  '.git',
  '__pycache__',
  '.venv',
  '.vscode',
  '.idea',
  '.pytest_cache',
  '.mypy_cache',
  '.eggs',
  'target',
];

export const useSettingsStore = create<SettingState>()(
  persist(
    (set) => ({
      hiddenNames: DEFAULT_HIDDEN_NAMES,
      showExplorer: true,
      taskDetail: 'steps',
      setHiddenNames: (hiddenNames: string[]) => set({ hiddenNames }),
      addHiddenName: (name: string) =>
        set((state) =>
          state.hiddenNames.includes(name) ? state : { hiddenNames: [...state.hiddenNames, name] }
        ),
      removeHiddenName: (name: string) =>
        set((state) => ({ hiddenNames: state.hiddenNames.filter((item) => item !== name) })),
      resetHiddenNames: () => set({ hiddenNames: DEFAULT_HIDDEN_NAMES }),
      setTaskDetail: (taskDetail: TaskDetail) => set({ taskDetail }),
      autoCommitGitWorktree: true,
      enableTaskCompleteBeep: 'always',
      preventSleepDuringTasks: true,
      showOpenAiModels: false,
      showReasoning: true,
      enabledQuoteCategories: ['economics', 'interest', 'life', 'management', 'programming'],
      setAutoCommitGitWorktree: (enabled: boolean) => set({ autoCommitGitWorktree: enabled }),
      setEnableTaskCompleteBeep: (mode: TaskCompleteBeepMode) =>
        set({ enableTaskCompleteBeep: mode }),
      setPreventSleepDuringTasks: (enabled: boolean) => set({ preventSleepDuringTasks: enabled }),
      setShowOpenAiModels: (enabled: boolean) => set({ showOpenAiModels: enabled }),
      composerWidgets: { cost: true, speed: true, cache: true, context: true },
      setComposerWidget: (widget: ComposerWidget, enabled: boolean) =>
        set((state) => ({ composerWidgets: { ...state.composerWidgets, [widget]: enabled } })),
      setShowReasoning: (enabled: boolean) => set({ showReasoning: enabled }),
      setEnabledQuoteCategories: (categories: string[]) =>
        set({ enabledQuoteCategories: categories }),
      customStunServers: [],
      setCustomStunServers: (servers: string[]) => set({ customStunServers: servers }),
      p2pAutoStart: false,
      setP2pAutoStart: (enabled: boolean) => set({ p2pAutoStart: enabled }),
      // Agents defaults: max_threads=6 (upstream Codex default), max_depth=1 (product default)
      agentsMaxThreads: 6,
      agentsMaxDepth: 1,
      setAgentsMaxThreads: (value: number) =>
        set({ agentsMaxThreads: Math.min(Math.max(1, value), AGENTS_MAX_THREADS_CAP) }),
      setAgentsMaxDepth: (value: number) =>
        set({ agentsMaxDepth: Math.min(Math.max(1, value), AGENTS_MAX_DEPTH_CAP) }),
    }),
    {
      name: 'settings-storage',
      version: 13,
      migrate: (persistedState: any) => {
        if (persistedState) {
          delete persistedState.analyticsEnabled;
          delete persistedState.analyticsConsentShown;
          // v13: telemetry consent moved to the backend (removed since).
          delete persistedState.telemetryConsent;
        }
        return persistedState;
      },
    }
  )
);
