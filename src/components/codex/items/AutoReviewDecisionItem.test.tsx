import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/lib/i18n';
import type { ItemGuardianApprovalReviewCompletedNotification } from '@/bindings/v2';
import { useCodexStore } from '@/components/codex/stores';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AutoReviewDecisionItem } from './AutoReviewDecisionItem';

const approve = vi.fn();
vi.mock('@/services/apiAdapt', () => ({
  threadApproveGuardianDeniedAction: (...args: unknown[]) => approve(...args),
}));

const denial = {
  threadId: 't1',
  turnId: 'turn1',
  startedAtMs: 0,
  completedAtMs: 1,
  reviewId: 'r1',
  targetItemId: null,
  decisionSource: 'agent',
  review: { status: 'denied', riskLevel: 'high', userAuthorization: null, rationale: null },
  action: { type: 'command', source: 'shell', command: 'rm -rf /tmp/x', cwd: '/repo' },
} as unknown as ItemGuardianApprovalReviewCompletedNotification;

const renderItem = () =>
  render(
    <TooltipProvider>
      <AutoReviewDecisionItem params={denial} />
    </TooltipProvider>
  );

describe('AutoReviewDecisionItem retry', () => {
  beforeEach(() => {
    approve.mockReset();
    useCodexStore.setState({ approvedDenialIds: {} });
  });

  it('approves a denial once and then shows it as approved', async () => {
    approve.mockResolvedValue({});
    renderItem();

    fireEvent.click(screen.getByRole('button', { name: 'Approve once' }));

    await waitFor(() => expect(screen.getByText('Approved for one retry')).toBeTruthy());
    expect(approve).toHaveBeenCalledWith({
      threadId: 't1',
      event: expect.objectContaining({ id: 'r1', status: 'denied' }),
    });
    expect(screen.queryByRole('button', { name: 'Approve once' })).toBeNull();
  });

  it('keeps the button and shows the error when the request fails', async () => {
    approve.mockRejectedValue(new Error('thread not found'));
    renderItem();

    fireEvent.click(screen.getByRole('button', { name: 'Approve once' }));

    await waitFor(() => expect(screen.getByText('thread not found')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Approve once' })).toBeTruthy();
  });
});
