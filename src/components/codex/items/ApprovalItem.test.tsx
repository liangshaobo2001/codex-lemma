import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/lib/i18n';

const respondToCommandExecutionApproval = vi.fn();
const respondToFileChangeApproval = vi.fn();
vi.mock('@/services', () => ({
  respondToCommandExecutionApproval: (...a: unknown[]) => respondToCommandExecutionApproval(...a),
  respondToFileChangeApproval: (...a: unknown[]) => respondToFileChangeApproval(...a),
}));

import { type ApprovalRequest, useApprovalStore } from '@/components/codex/stores';
import { ApprovalItem } from './ApprovalItem';

const commandApproval = (overrides: Partial<ApprovalRequest> = {}): ApprovalRequest =>
  ({
    type: 'commandExecution',
    requestId: 'r1',
    kind: 'command',
    threadId: 't1',
    turnId: 'turn',
    itemId: 'item',
    startedAtMs: 0,
    environmentId: null,
    reason: 'May I run curl outside the sandbox?',
    command: "/bin/zsh -lc 'curl -sI https://example.com'",
    commandActions: [{ type: 'unknown', command: 'curl -sI https://example.com' }],
    ...overrides,
  }) as ApprovalRequest;

describe('ApprovalItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    respondToCommandExecutionApproval.mockResolvedValue(undefined);
    useApprovalStore.setState({ pendingApprovals: [], currentApproval: null });
  });

  it('shows the reason and the unwrapped command for the current thread only', () => {
    useApprovalStore.setState({
      pendingApprovals: [commandApproval({ threadId: 'other', reason: 'Elsewhere' }), commandApproval()],
    });
    render(<ApprovalItem threadId="t1" />);
    expect(screen.getByText('May I run curl outside the sandbox?')).toBeTruthy();
    expect(screen.getByText('curl -sI https://example.com')).toBeTruthy();
    expect(screen.queryByText('Elsewhere')).toBeNull();
  });

  it('approves once from the primary button', async () => {
    useApprovalStore.setState({ pendingApprovals: [commandApproval()] });
    render(<ApprovalItem threadId="t1" />);
    fireEvent.click(screen.getByRole('button', { name: /Allow once/ }));
    await waitFor(() => expect(respondToCommandExecutionApproval).toHaveBeenCalledWith('r1', 'accept'));
  });

  it('denies with Esc, falling back to cancel when decline is not offered', async () => {
    useApprovalStore.setState({
      pendingApprovals: [commandApproval({ availableDecisions: ['accept', 'cancel'] })],
    });
    render(<ApprovalItem threadId="t1" />);
    fireEvent.keyDown(screen.getByRole('button', { name: /Allow once/ }), { key: 'Escape' });
    await waitFor(() => expect(respondToCommandExecutionApproval).toHaveBeenCalledWith('r1', 'cancel'));
  });

  it('renders nothing without a pending approval for the thread', () => {
    useApprovalStore.setState({ pendingApprovals: [commandApproval({ threadId: 'other' })] });
    const { container } = render(<ApprovalItem threadId="t1" />);
    expect(container.innerHTML).toBe('');
  });
});
