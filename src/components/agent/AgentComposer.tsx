import { cn } from 'cn';
import { Composer as CodexComposer } from '@/components/codex/composer';
import { useApprovalStore, useCodexStore } from '@/components/codex/stores';
import { useWriterConflictStore } from '@/components/codex/stores/useWriterConflictStore';
import { useAgentCenterStore } from '@/stores';
import { WorkspaceSwitcher } from '../common';
import { WriterConflictNotice } from './WriterConflictNotice';

export function AgentComposer() {
  const { currentAgentCardId } = useAgentCenterStore();
  const currentThreadId = useCodexStore((s) => s.currentThreadId);
  // The thread shows the approval card in the composer's place, like Codex
  // does. Hide rather than unmount so an unsent draft survives.
  const approvalPending = useApprovalStore((s) =>
    s.pendingApprovals.some((a) => a.threadId === currentThreadId)
  );
  // Another client owns this Codex thread, so the notice replaces the composer.
  const writerBlocked = useWriterConflictStore((s) =>
    Boolean(currentThreadId && s.locked[currentThreadId])
  );
  const composerHidden = approvalPending || writerBlocked;

  return (
    <div className="flex flex-col">
      <div className={cn('flex flex-col', composerHidden && 'hidden')}>
        {/* Project bar sits on top of the input, like the composer's own header */}
        {!currentAgentCardId && <WorkspaceSwitcher className="pb-1" />}
        {/* Input area */}
        <div className="shrink-0 pb-3">
          <CodexComposer />
        </div>
      </div>
      {writerBlocked && !approvalPending && (
        <div className="shrink-0 pb-3">
          <WriterConflictNotice />
        </div>
      )}
    </div>
  );
}
