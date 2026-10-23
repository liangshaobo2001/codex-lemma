import { postJson } from './shared';

export interface ToolSnapshot {
  threadId: string;
  provider?: string;
  model?: string | null;
  phase: 'waiting' | 'probing' | 'ready' | 'error' | 'unavailable';
  mode: 'native' | 'function' | 'direct' | null;
  busy?: boolean;
  catalogReady?: boolean;
  error: string | null;
  tools: { id: string; name: string; group: string | null; description: string }[];
  selected: string[];
}
export function readSessionTools(threadId: string) {
  return postJson<ToolSnapshot>('/api/codex/thread/tools', { threadId });
}
export function saveSessionTools(threadId: string, selected: string[]) {
  return postJson<ToolSnapshot>('/api/codex/thread/tools/select', { threadId, selected });
}
export function recheckSessionTools(threadId: string) {
  return postJson<ToolSnapshot>('/api/codex/thread/tools/recheck', { threadId });
}
