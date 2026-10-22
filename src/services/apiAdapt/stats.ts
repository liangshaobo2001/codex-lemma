import { postJson } from './shared';

export interface ThreadStat {
  id: string;
  createdAtMs: number;
  modelProvider: string;
  model: string | null;
  projectId: string | null;
  cwd: string;
  archived: boolean;
  /** Spawned by Codex itself (e.g. the guardian reviewer), not started by the user. */
  subagent: boolean;
}

/** One model request; token counts are what that request added. */
export interface RequestStat {
  threadId: string;
  tsMs: number;
  input: number;
  cached: number;
  output: number;
  reasoning: number;
}

export interface TurnStat {
  threadId: string;
  startedAtMs: number;
  durationMs: number | null;
  status: string;
}

export interface UsageStats {
  threads: ThreadStat[];
  requests: RequestStat[];
  turns: TurnStat[];
  projects: { id: string; name: string }[];
}

/** Usage of the chats in this app's Codex home (see crates/codex/src/stats.rs). */
export async function getUsageStats() {
  return await postJson<UsageStats>('/api/codex/stats');
}
