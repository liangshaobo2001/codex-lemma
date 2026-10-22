import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ReasoningEffort } from '@/bindings';
import type { ApprovalsReviewer, AskForApproval, SandboxMode } from '@/bindings/v2';
import type { Provider } from '@/stores/settings';

export type Personality = 'friendly' | 'pragmatic';
export type ModeKind = 'default' | 'plan';
export type ThreadCwdMode = 'local' | 'worktree';

// The composer's permission modes, named after the Codex app's presets.
export type AccessMode = 'ask' | 'run' | 'auto' | 'full';

export interface ConfigStore {
  accessMode: AccessMode;
  reasoningEffort: ReasoningEffort;
  webSearchRequest: boolean;
  modelProvider: Provider;
  model: string;
  // Last-used model id per provider key (e.g. { openai: 'o3', custom: 'my-model' })
  providerModels: Record<string, string>;
  personality: Personality | null;
  collaborationMode: ModeKind;
  threadCwdMode: ThreadCwdMode;
  setModel: (model: string) => void;
  setModelProvider: (provider: Provider) => void;
  setAccessMode: (mode: AccessMode) => void;
  setReasoningEffort: (effort: ReasoningEffort) => void;
  setWebSearch: (webSearchRequest: boolean) => void;
  setPersonality: (personality: Personality | null) => void;
  setCollaborationMode: (mode: ModeKind) => void;
  setThreadCwdMode: (mode: ThreadCwdMode) => void;
}

// "Ask for approval" and "Approve for me" share the workspace-write sandbox; they differ
// only in who answers its approval requests, the user or Codex's auto-reviewer.
export const ACCESS_MODES: Record<
  AccessMode,
  {
    sandbox: SandboxMode;
    approvalPolicy: AskForApproval;
    approvalsReviewer: ApprovalsReviewer;
    /** Network inside the sandbox regardless of the web-search toggle. */
    networkAccess?: boolean;
  }
> = {
  ask: { sandbox: 'workspace-write', approvalPolicy: 'on-request', approvalsReviewer: 'user' },
  // Local fork, like Claude Code's auto mode: commands run without asking or an AI review; the sandbox keeps
  // writes inside the workspace, and an escalation is refused so the model works around it. Measured
  // 2026-10-22: the reviewer of "Approve for me" is a second Strata conversation that evicted the task's
  // prompt cache on every command (a 77-minute task spent ~58 min re-reading its prompt).
  run: {
    sandbox: 'workspace-write',
    approvalPolicy: 'never',
    approvalsReviewer: 'user',
    networkAccess: true,
  },
  auto: {
    sandbox: 'workspace-write',
    approvalPolicy: 'on-request',
    approvalsReviewer: 'auto_review',
  },
  full: { sandbox: 'danger-full-access', approvalPolicy: 'never', approvalsReviewer: 'user' },
};

// v0 stored the sandbox and its approval policy; each sandbox was one menu entry.
const V0_SANDBOX_MODES: Record<string, AccessMode> = {
  'read-only': 'ask',
  'workspace-write': 'auto',
  'danger-full-access': 'full',
};

export function migrateConfigStore(persisted: unknown, version: number): Record<string, unknown> {
  const state = (persisted ?? {}) as Record<string, unknown>;
  if (version < 1) {
    const { sandbox, approvalPolicy: _approvalPolicy, ...rest } = state;
    return { ...rest, accessMode: V0_SANDBOX_MODES[String(sandbox)] ?? 'ask' };
  }
  // v2 (local fork): Auto mode became the default, so an existing install switches to it once.
  if (version < 2) return { ...state, accessMode: 'run' };
  return state;
}

export const useConfigStore = create<ConfigStore>()(
  persist(
    (set) => ({
      webSearchRequest: false,
      accessMode: 'run',
      reasoningEffort: 'medium',
      modelProvider: 'openai',
      model: '',
      providerModels: {},
      personality: 'friendly',
      collaborationMode: 'default',
      threadCwdMode: 'local',

      setModel: (model: string) => {
        set((state) => ({
          model,
          providerModels: { ...state.providerModels, [state.modelProvider]: model },
        }));
      },

      setModelProvider: (modelProvider: Provider) => {
        set((state) => ({
          modelProvider,
          model: state.providerModels[modelProvider] ?? '',
        }));
      },

      setAccessMode: (accessMode: AccessMode) => {
        set({ accessMode });
      },

      setReasoningEffort: (effort: ReasoningEffort) => {
        set({ reasoningEffort: effort });
      },

      setWebSearch: (webSearchRequest: boolean) => {
        set({ webSearchRequest });
      },

      setPersonality: (personality: Personality | null) => {
        set({ personality });
      },

      setCollaborationMode: (mode: ModeKind) => {
        set({ collaborationMode: mode });
      },

      setThreadCwdMode: (mode: ThreadCwdMode) => {
        set({ threadCwdMode: mode });
      },
    }),
    {
      name: 'codex-config-storage',
      version: 2,
      migrate: (persisted, version) =>
        migrateConfigStore(persisted, version) as unknown as ConfigStore,
    }
  )
);
