import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThreadStepChain, type StepEntry } from './ThreadStepChain';

vi.mock('./ThreadStepItem', () => ({ ThreadStepItem: () => <span>Step</span> }));

const steps: StepEntry[] = ['a', 'b'].map((id) => ({
  item: { type: 'reasoning', id, summary: [], content: [] }, running: false,
}));

describe('turn-scoped Working expansion', () => {
  it('stays open through gaps and added work, then collapses on turn completion', () => {
    const { rerender } = render(<ThreadStepChain steps={steps} turnRunning />);
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true');
    rerender(<ThreadStepChain steps={[...steps, { ...steps[0], item: { ...steps[0].item, id: 'c' } }]} turnRunning />);
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true');
    rerender(<ThreadStepChain steps={steps} turnRunning={false} />);
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false');
  });

  it('respects manual folding while work continues and manual expansion after completion', () => {
    const { rerender } = render(<ThreadStepChain steps={steps} turnRunning />);
    fireEvent.click(screen.getByRole('button'));
    rerender(<ThreadStepChain steps={steps} turnRunning />);
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(screen.getByRole('button'));
    rerender(<ThreadStepChain steps={steps} turnRunning={false} />);
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true');
  });
});
