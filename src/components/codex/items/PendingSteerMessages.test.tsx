import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import '@/lib/i18n';
import { getRunningTurnId } from '@/components/codex/stores';
import { usePendingSteers } from '@/components/codex/stores/usePendingSteers';
import { codexService } from '@/services/codexService';
import { PendingSteerMessages } from './PendingSteerMessages';

vi.mock('@/components/codex/stores', () => ({ getRunningTurnId: vi.fn() }));
vi.mock('@/services/codexService', () => ({ codexService: { turnSteer: vi.fn(), turnStart: vi.fn() } }));
vi.mock('@/components/ui/message-scroller', () => ({ MessageScrollerItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('./UserMessageItem', () => ({ UserMessageItem: ({ content }: { content: Array<{ text?: string }> }) => <p>{content.map(c => c.text).join('')}</p> }));

beforeEach(() => { vi.resetAllMocks(); usePendingSteers.setState({ items: [], observed: [] }); });
const add = (threadId: string, text: string) => usePendingSteers.getState().begin(threadId, 'turn', [{ type: 'text', text, text_elements: [] }]);

it('immediately shows only the selected thread and preserves acceptance until canonical receipt', () => {
  const id = add('a', 'Followup A'); add('b', 'Followup B');
  const { rerender } = render(<PendingSteerMessages threadId="a" />);
  expect(screen.getByText('Followup A')).toBeTruthy();
  expect(screen.queryByText('Followup B')).toBeNull();
  rerender(<PendingSteerMessages threadId="b" />);
  expect(screen.queryByText('Followup A')).toBeNull();
  expect(screen.getByText('Followup B')).toBeTruthy();
  usePendingSteers.getState().update(id, 'accepted');
  rerender(<PendingSteerMessages threadId="a" />);
  expect(screen.getByText('Followup A')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('retries failed steering only after an explicit click, and does not submit on render', async () => {
  const id = add('a', 'Retry this');
  usePendingSteers.getState().update(id, 'failed', 'Transport interrupted');
  vi.mocked(getRunningTurnId).mockReturnValue('running-turn');
  vi.mocked(codexService.turnSteer).mockResolvedValue({ turnId: 'running-turn' });
  render(<PendingSteerMessages threadId="a" />);
  expect(codexService.turnSteer).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /Retry/i }));
  await waitFor(() => expect(codexService.turnSteer).toHaveBeenCalledWith('a', 'running-turn', 'Retry this', []));
  expect(codexService.turnStart).not.toHaveBeenCalled();
});

it('keeps a failed idle retry available and lets the user dismiss it', async () => {
  const id = add('a', 'Keep on error');
  usePendingSteers.getState().update(id, 'failed', 'Offline');
  vi.mocked(getRunningTurnId).mockReturnValue(null);
  vi.mocked(codexService.turnStart).mockRejectedValue(new Error('Still offline'));
  render(<PendingSteerMessages threadId="a" />);
  fireEvent.click(screen.getByRole('button', { name: /Retry/i }));
  await screen.findByText('Still offline');
  fireEvent.click(screen.getByRole('button', { name: /Dismiss/i }));
  expect(usePendingSteers.getState().items).toHaveLength(0);
  expect(codexService.turnSteer).not.toHaveBeenCalled();
});
