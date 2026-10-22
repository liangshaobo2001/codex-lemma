import { describe, expect, it } from 'vitest';
import type { ItemGuardianApprovalReviewCompletedNotification } from '@/bindings/v2';
import { deniedReviewEvent } from './autoReview';

const completed = (
  action: Record<string, unknown>,
  status = 'denied'
): ItemGuardianApprovalReviewCompletedNotification =>
  ({
    threadId: 't1',
    turnId: 'turn1',
    startedAtMs: 10,
    completedAtMs: 20,
    reviewId: 'r1',
    targetItemId: 'item1',
    decisionSource: 'agent',
    review: { status, riskLevel: 'high', userAuthorization: 'low', rationale: 'risky' },
    action,
  }) as unknown as ItemGuardianApprovalReviewCompletedNotification;

describe('deniedReviewEvent', () => {
  it("converts a denial to Codex's snake_case assessment event", () => {
    const event = deniedReviewEvent(
      completed({ type: 'command', source: 'unifiedExec', command: 'curl x', cwd: '/repo' })
    );

    expect(event).toEqual({
      id: 'r1',
      turn_id: 'turn1',
      started_at_ms: 10,
      completed_at_ms: 20,
      status: 'denied',
      risk_level: 'high',
      user_authorization: 'low',
      rationale: 'risky',
      decision_source: 'agent',
      action: { type: 'command', source: 'unified_exec', command: 'curl x', cwd: '/repo' },
    });
  });

  it('renames camelCase action fields and enum values', () => {
    const network = deniedReviewEvent(
      completed({
        type: 'networkAccess',
        target: 'h:1',
        host: 'h',
        protocol: 'socks5Tcp',
        port: 1,
      })
    ) as { action: unknown };
    expect(network.action).toEqual({
      type: 'network_access',
      target: 'h:1',
      host: 'h',
      protocol: 'socks5_tcp',
      port: 1,
    });

    const mcp = deniedReviewEvent(
      completed({
        type: 'mcpToolCall',
        server: 's',
        toolName: 'run',
        connectorId: null,
        connectorName: null,
        toolTitle: null,
      })
    ) as { action: unknown };
    expect(mcp.action).toEqual({
      type: 'mcp_tool_call',
      server: 's',
      tool_name: 'run',
      connector_id: null,
      connector_name: null,
      tool_title: null,
    });
  });

  it('offers no retry for timeouts or actions core shapes differently', () => {
    expect(deniedReviewEvent(completed({ type: 'command' }, 'timedOut'))).toBeNull();
    expect(deniedReviewEvent(completed({ type: 'writeStdin' }))).toBeNull();
    expect(deniedReviewEvent(completed({ type: 'requestPermissions' }))).toBeNull();
  });
});
