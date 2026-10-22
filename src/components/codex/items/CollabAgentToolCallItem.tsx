import type { TFunction } from 'i18next';
import { Bot } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  CollabAgentState,
  CollabAgentStatus,
  CollabAgentTool,
  CollabAgentToolCallStatus,
} from '@/bindings/v2';
import { Subagent } from '@/components/ai-elements/Subagent';
import { TraceIcon, TraceLine, TraceTitle } from '@/components/ui/trace';

// Shape of the collabAgentToolCall item from item/completed.
export interface CollabAgentToolCallItemData {
  type: 'collabAgentToolCall';
  id: string;
  tool: CollabAgentTool;
  status: CollabAgentToolCallStatus;
  senderThreadId: string;
  receiverThreadIds: string[];
  prompt: string | null;
  model: string | null;
  reasoningEffort: string | null;
  agentsStates: Record<string, CollabAgentState>;
}

// Human-readable label for each collab tool operation.
function toolLabel(tool: CollabAgentTool, status: CollabAgentToolCallStatus, t: TFunction): string {
  const done = status === 'completed';
  switch (tool) {
    case 'spawnAgent':
      return done ? t('collab.spawned') : t('collab.spawning');
    case 'sendInput':
      return done ? t('collab.sent') : t('collab.sending');
    case 'resumeAgent':
      return done ? t('collab.resumed') : t('collab.resuming');
    case 'wait':
      return done ? t('collab.waited') : t('collab.waiting');
    case 'closeAgent':
      return done ? t('collab.closed') : t('collab.closing');
    default:
      return t('collab.operation');
  }
}

// Map agent-level status to a badge variant + label.
function agentStatusDisplay(
  status: CollabAgentStatus,
  t: TFunction
): {
  label: string;
  className: string;
} {
  switch (status) {
    case 'running':
      return {
        label: t('collab.status.running'),
        className: 'bg-muted text-muted-foreground',
      };
    case 'completed':
      return {
        label: t('collab.status.done'),
        className: 'bg-muted text-muted-foreground',
      };
    case 'errored':
      return {
        label: t('collab.status.errored'),
        className: 'bg-muted text-muted-foreground',
      };
    case 'interrupted':
      return {
        label: t('collab.status.stopped'),
        className: 'bg-muted text-muted-foreground',
      };
    case 'shutdown':
      return { label: t('collab.status.shutdown'), className: 'bg-muted text-muted-foreground' };
    case 'pendingInit':
      return { label: t('collab.status.starting'), className: 'bg-muted text-muted-foreground' };
    case 'notFound':
      return {
        label: t('collab.status.notFound'),
        className: 'bg-muted text-muted-foreground',
      };
    default:
      return { label: status, className: 'bg-muted text-muted-foreground' };
  }
}

// Shorten a full thread UUID to the last 8 chars for display.
function shortId(threadId: string): string {
  return threadId.length > 8 ? `…${threadId.slice(-8)}` : threadId;
}

interface CollabAgentToolCallItemProps {
  item: CollabAgentToolCallItemData;
}

export function CollabAgentToolCallItem({ item }: CollabAgentToolCallItemProps) {
  const { t } = useTranslation('chat');
  const { tool, status, receiverThreadIds, prompt, agentsStates } = item;
  const agentEntries = Object.entries(agentsStates ?? {});
  const state = status === 'completed' ? 'done' : status === 'failed' ? 'error' : 'running';
  const hasDetails = !!prompt || agentEntries.length > 0;

  return (
    <Subagent
      title={toolLabel(tool, status, t)}
      description={receiverThreadIds.map(shortId).join(' ') || undefined}
      state={state}
    >
      {hasDetails ? (
        <>
          {prompt && (
            <p className="italic line-clamp-3">
              {prompt.length > 240 ? `${prompt.slice(0, 240)}…` : prompt}
            </p>
          )}
          {agentEntries.map(([threadId, agentState]) => {
            const { label, className } = agentStatusDisplay(agentState.status, t);
            return (
              <TraceLine key={threadId}>
                <TraceIcon>
                  <Bot />
                </TraceIcon>
                <code className="font-mono text-xs">{shortId(threadId)}</code>
                <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${className}`}>
                  {label}
                </span>
                {agentState.message && <TraceTitle>{agentState.message}</TraceTitle>}
              </TraceLine>
            );
          })}
        </>
      ) : null}
    </Subagent>
  );
}
