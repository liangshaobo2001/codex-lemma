import type { TFunction } from 'i18next';
import type { JsonValue } from '@/bindings/serde_json/JsonValue';
import type {
  GuardianApprovalReviewAction,
  ItemGuardianApprovalReviewCompletedNotification,
} from '@/bindings/v2';

/** One-line description of what an auto-review was asked to decide. */
export function reviewActionSummary(action: GuardianApprovalReviewAction, t: TFunction): string {
  switch (action.type) {
    case 'command':
      return action.command;
    case 'execve':
      return action.argv.length > 0 ? action.argv.join(' ') : action.program;
    case 'writeStdin':
      return t('autoReview.stdin');
    case 'applyPatch':
      return action.files.length === 1
        ? t('autoReview.patchFile', { file: action.files[0] })
        : t('autoReview.patchFiles', { count: action.files.length });
    case 'networkAccess':
      return t('autoReview.network', { target: action.target });
    case 'mcpToolCall':
      return t('autoReview.mcpTool', {
        tool: action.toolTitle ?? `${action.connectorName ?? action.server}.${action.toolName}`,
      });
    case 'requestPermissions':
      return action.reason ?? t('autoReview.permissions');
  }
}

const snake = (value: string) => value.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/**
 * The denial as Codex's own `GuardianAssessmentEvent`, the payload
 * `thread/approveGuardianDeniedAction` takes, or null when it cannot be retried from here.
 * Stdin and permission-request actions carry paths and profiles in a different shape in
 * core, so they are left to the CLI's `/approve`.
 */
export function deniedReviewEvent(
  params: ItemGuardianApprovalReviewCompletedNotification
): JsonValue | null {
  const { action, review } = params;
  if (review.status !== 'denied') return null;
  if (action.type === 'writeStdin' || action.type === 'requestPermissions') return null;

  const coreAction: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(action)) {
    if (value === undefined) continue;
    coreAction[snake(key)] =
      key === 'type' || key === 'source' || key === 'protocol' ? snake(String(value)) : value;
  }

  return {
    id: params.reviewId,
    turn_id: params.turnId,
    started_at_ms: params.startedAtMs,
    completed_at_ms: params.completedAtMs,
    status: 'denied',
    risk_level: review.riskLevel,
    user_authorization: review.userAuthorization,
    rationale: review.rationale,
    decision_source: snake(params.decisionSource),
    action: coreAction,
  };
}
