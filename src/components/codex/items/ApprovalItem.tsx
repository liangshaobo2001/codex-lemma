import type { TFunction } from 'i18next';
import { FilePen, Globe, SquareTerminal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CommandExecutionApprovalDecision } from '@/bindings/v2';
import { type ApprovalRequest, useApprovalStore, useCodexStore } from '@/components/codex/stores';
import { ApprovalCard, ApprovalCode, type ApprovalOption } from '@/components/common';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';

type CommandApproval = Extract<ApprovalRequest, { type: 'commandExecution' }>;
type FileApproval = Extract<ApprovalRequest, { type: 'fileChange' }>;

const DEFAULT_COMMAND_DECISIONS: CommandExecutionApprovalDecision[] = [
  'accept',
  'acceptForSession',
  'decline',
];

interface ApprovalItemProps {
  threadId: string | null;
}

export function ApprovalItem({ threadId }: ApprovalItemProps) {
  const pendingApprovals = useApprovalStore((s) => s.pendingApprovals);
  const pending = pendingApprovals.filter((a) => a.threadId === threadId);
  const approval = pending[0];
  if (!approval) return null;

  return approval.type === 'commandExecution' ? (
    <CommandApprovalCard approval={approval} pendingCount={pending.length} />
  ) : (
    <FileApprovalCard approval={approval} pendingCount={pending.length} />
  );
}

/** Decisions the server offers, or the legacy defaults for older servers. */
function availableDecisions(approval: CommandApproval): CommandExecutionApprovalDecision[] {
  if (approval.availableDecisions?.length) return approval.availableDecisions;
  const amendment = approval.proposedExecpolicyAmendment;
  return amendment
    ? [
        ...DEFAULT_COMMAND_DECISIONS,
        { acceptWithExecpolicyAmendment: { execpolicy_amendment: amendment } },
      ]
    : DEFAULT_COMMAND_DECISIONS;
}

/** Menu entry for a secondary decision; accept and deny have their own buttons. */
function describeDecision(
  decision: CommandExecutionApprovalDecision,
  t: TFunction<'thread'>
): Omit<ApprovalOption, 'onSelect'> | null {
  if (decision === 'accept' || decision === 'decline' || decision === 'cancel') return null;
  if (decision === 'acceptForSession') {
    return {
      key: 'session',
      label: t('approval.allowSession'),
      hint: t('approval.allowSessionCommandHint'),
    };
  }
  if ('acceptWithExecpolicyAmendment' in decision) {
    const prefix = decision.acceptWithExecpolicyAmendment.execpolicy_amendment.join(' ');
    return {
      key: 'prefix',
      label: t('approval.allowPrefix'),
      hint: t('approval.allowPrefixHint', { prefix }),
    };
  }
  const { host, action } = decision.applyNetworkPolicyAmendment.network_policy_amendment;
  return {
    key: `network-${action}-${host}`,
    label:
      action === 'allow' ? t('approval.allowHost', { host }) : t('approval.blockHost', { host }),
  };
}

function CommandApprovalCard({
  approval,
  pendingCount,
}: {
  approval: CommandApproval;
  pendingCount: number;
}) {
  const { t } = useTranslation('thread');
  const respondToApproval = useApprovalStore((s) => s.respondToApproval);
  const workspaceCwd = useWorkspaceStore((s) => s.cwd);

  const respond = (decision: CommandExecutionApprovalDecision) =>
    respondToApproval(approval.requestId, true, decision);

  const host = approval.networkApprovalContext?.host;
  const decisions = availableDecisions(approval);
  const options = decisions.flatMap((decision) => {
    const option = describeDecision(decision, t);
    return option ? [{ ...option, onSelect: () => respond(decision) }] : [];
  });

  const title =
    approval.reason ||
    (host
      ? t('approval.networkAccess', { host })
      : approval.kind === 'writeStdin'
        ? t('approval.sendInput')
        : t('approval.runCommand'));
  // Servers that drop `decline` only offer `cancel` (abort the turn).
  const denyDecision =
    decisions.includes('decline') || !decisions.includes('cancel') ? 'decline' : 'cancel';
  // Parsed actions skip the `/bin/zsh -lc '…'` wrapper around a single command.
  const command =
    approval.commandActions?.length === 1 ? approval.commandActions[0].command : approval.command;
  // The working directory only matters when it differs from the project.
  const showCwd = approval.cwd && approval.cwd !== workspaceCwd;
  const extraPermissions = approval.additionalPermissions
    ? JSON.stringify(approval.additionalPermissions, null, 2)
    : null;

  return (
    <ApprovalCard
      icon={host ? <Globe /> : <SquareTerminal />}
      kind={host ? t('approval.network') : t('approval.terminal')}
      title={title}
      pendingCount={pendingCount}
      deny={{ key: 'deny', label: t('approval.deny'), onSelect: () => respond(denyDecision) }}
      allow={{ key: 'once', label: t('approval.allowOnce'), onSelect: () => respond('accept') }}
      moreOptions={options}
      details={
        extraPermissions && (
          <>
            <div>{t('approval.extraPermissions')}</div>
            <ApprovalCode>{extraPermissions}</ApprovalCode>
          </>
        )
      }
    >
      {command && <ApprovalCode>{command}</ApprovalCode>}
      {showCwd && (
        <div className="truncate font-mono text-xs text-muted-foreground">
          {t('approval.inDirectory', { path: approval.cwd })}
        </div>
      )}
    </ApprovalCard>
  );
}

function FileApprovalCard({
  approval,
  pendingCount,
}: {
  approval: FileApproval;
  pendingCount: number;
}) {
  const { t } = useTranslation('thread');
  const respondToApproval = useApprovalStore((s) => s.respondToApproval);
  // The request only carries the item id; the paths live on the started item.
  const changes = useCodexStore((s) => {
    for (const event of s.events[approval.threadId] ?? []) {
      if (event.method !== 'item/started') continue;
      const item = event.params.item;
      if (item.type === 'fileChange' && item.id === approval.itemId) return item.changes;
    }
    return undefined;
  });

  const respond = (decision: 'accept' | 'acceptForSession' | 'decline') =>
    respondToApproval(approval.requestId, false, decision);

  return (
    <ApprovalCard
      icon={<FilePen />}
      kind={t('approval.editFiles')}
      title={approval.reason || t('approval.makeEdits')}
      pendingCount={pendingCount}
      deny={{ key: 'deny', label: t('approval.deny'), onSelect: () => respond('decline') }}
      allow={{ key: 'once', label: t('approval.allowOnce'), onSelect: () => respond('accept') }}
      moreOptions={[
        {
          key: 'session',
          label: t('approval.allowSession'),
          hint: t('approval.allowSessionFilesHint'),
          onSelect: () => respond('acceptForSession'),
        },
      ]}
    >
      {changes && changes.length > 0 && (
        <ApprovalCode>
          {changes.map((change) => `${change.kind.type} ${change.path}`).join('\n')}
        </ApprovalCode>
      )}
      {approval.grantRoot && (
        <div className="truncate font-mono text-xs text-muted-foreground">
          {t('approval.writesUnder', { path: approval.grantRoot })}
        </div>
      )}
    </ApprovalCard>
  );
}
