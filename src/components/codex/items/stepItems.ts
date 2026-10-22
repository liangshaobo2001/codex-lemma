import type { ThreadItem } from '@/bindings/v2';

/** Thread items shown as one-line "steps" (tool calls, commands, thinking) in the transcript. */
export type StepItem = Extract<
  ThreadItem,
  {
    type:
      | 'reasoning'
      | 'commandExecution'
      | 'mcpToolCall'
      | 'dynamicToolCall'
      | 'webSearch'
      | 'imageView'
      | 'imageGeneration'
      | 'contextCompaction'
      | 'functionCallOutput'
      | 'hookPrompt'
      | 'sleep'
      | 'collabAgentToolCall'
      | 'subAgentActivity';
  }
>;

const STEP_TYPES = new Set<ThreadItem['type']>([
  'reasoning',
  'commandExecution',
  'mcpToolCall',
  'dynamicToolCall',
  'webSearch',
  'imageView',
  'imageGeneration',
  'contextCompaction',
  'functionCallOutput',
  'hookPrompt',
  'sleep',
  'collabAgentToolCall',
  'subAgentActivity',
]);

export const isStepItem = (item: ThreadItem): item is StepItem => STEP_TYPES.has(item.type);

/** True when the step ended in an error, so groups can report failures. */
export function isStepFailed(item: StepItem): boolean {
  switch (item.type) {
    case 'commandExecution':
      // A command that ran and exited non-zero is not a failure here (a search with no match exits 1); the row
      // shows its exit code instead. Failed means it never ran: declined, or failed without an exit code.
      return item.status === 'declined' || (item.status === 'failed' && item.exitCode === null);
    case 'mcpToolCall':
    case 'dynamicToolCall':
    case 'collabAgentToolCall':
      return item.status === 'failed';
    case 'imageGeneration':
      return item.failure !== null && item.failure !== undefined;
    default:
      return false;
  }
}

/**
 * The command as the user would type it. `command` is the full shell wrapper
 * (e.g. `/bin/zsh -lc '...'`); `commandActions` carry the parsed inner commands.
 */
export function displayCommand(item: Extract<ThreadItem, { type: 'commandExecution' }>): string {
  const parsed = item.commandActions.map((action) => action.command).filter(Boolean);
  return parsed.length > 0 ? parsed.join(' && ') : item.command;
}

/** Short duration for step lines: 120ms, 2.4s, 1:05. */
export function formatStepDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const totalSec = Math.floor(ms / 1000);
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`;
}
