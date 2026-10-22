import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const turnStart = vi.fn();
const threadResume = vi.fn();
const threadFork = vi.fn();
const setCurrentThread = vi.fn();
vi.mock('@/services/codexService', () => ({
  codexService: {
    turnStart: (...a: unknown[]) => turnStart(...a),
    threadResume: (...a: unknown[]) => threadResume(...a),
    threadFork: (...a: unknown[]) => threadFork(...a),
    setCurrentThread: (...a: unknown[]) => setCurrentThread(...a),
  },
}));

import { useCodexStore } from '@/components/codex/stores';
import { useWriterConflictStore } from '@/components/codex/stores/useWriterConflictStore';
import { useAgentCenterStore } from '@/stores';
import { WriterConflictNotice } from './WriterConflictNotice';

const draft = { text: 'hello', images: ['a.png'] };

describe('WriterConflictNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCodexStore.setState({ currentThreadId: 't1' });
    useWriterConflictStore.setState({ locked: { t1: { draft } }, handoff: null, recovering: false });
  });

  it('explains the conflict in two lines with Retry and Fork chat', () => {
    render(<WriterConflictNotice />);

    expect(screen.getByText('This is open in another app')).toBeTruthy();
    expect(screen.getByText('Close it there to continue here.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fork chat' })).toBeTruthy();
  });

  it('re-attaches and sends the refused draft once the thread is free', async () => {
    threadResume.mockImplementation(async () => {
      useWriterConflictStore.getState().unlock('t1');
    });
    turnStart.mockResolvedValue({ id: 'turn-2' });
    render(<WriterConflictNotice />);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(turnStart).toHaveBeenCalledWith('t1', 'hello', ['a.png']));
    expect(useWriterConflictStore.getState().locked.t1).toBeUndefined();
  });

  it('stays locked when the other app still owns the thread', async () => {
    // threadResume keeps the thread locked instead of throwing.
    threadResume.mockResolvedValue(undefined);
    render(<WriterConflictNotice />);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(threadResume).toHaveBeenCalledWith('t1'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Retry' }).hasAttribute('disabled')).toBe(false)
    );
    expect(turnStart).not.toHaveBeenCalled();
    expect(useWriterConflictStore.getState().locked.t1).toEqual({ draft });
  });

  it('forks the thread and hands the draft back to the composer', async () => {
    threadFork.mockResolvedValue({ id: 'fork-1', preview: 'hi', cwd: '/w' });
    setCurrentThread.mockResolvedValue(undefined);
    render(<WriterConflictNotice />);

    fireEvent.click(screen.getByRole('button', { name: 'Fork chat' }));

    await waitFor(() => expect(setCurrentThread).toHaveBeenCalledWith('fork-1'));
    expect(threadFork).toHaveBeenCalledWith('t1');
    expect(useAgentCenterStore.getState().currentAgentCardId).toBe('fork-1');
    expect(useWriterConflictStore.getState().handoff).toEqual(draft);
  });
});
