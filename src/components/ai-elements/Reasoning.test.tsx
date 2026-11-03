import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Reasoning } from './Reasoning';

vi.mock('@/components/Markdown', () => ({ Markdown: ({ value }: { value: string }) => <div data-full-reasoning>{value}</div> }));

describe('collapsed streaming reasoning', () => {
  it('keeps a bounded, single-line live tail and never opens itself on deltas or completion', () => {
    const { container, rerender } = render(<Reasoning title="Thinking" text="" running />);
    const trigger = screen.getByRole('button', { name: 'Thinking' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    const text = `${'old content '.repeat(100)}\nlatest\n\nreasoning tail`;
    rerender(<Reasoning title="Thinking" text={text} running />);
    const preview = container.querySelector('[data-reasoning-preview]')!;
    expect(preview.textContent).toContain('latest reasoning tail');
    expect(preview.textContent!.length).toBeLessThanOrEqual(256);
    expect(preview.textContent).not.toContain('\n');
    expect(preview.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('button', { name: 'Thinking' })).toBe(trigger);
    const body = container.querySelector('[data-slot=trace-collapsible-content]')!;
    expect(body.hasAttribute('hidden')).toBe(true);
    expect(body.textContent).toBe('');
    rerender(<Reasoning title="Thought for 3s" text={text} />);
    expect(screen.getByRole('button', { name: 'Thought for 3s' }).getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[data-reasoning-preview]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Thought for 3s' }));
    expect(container.querySelector('[data-full-reasoning]')?.textContent).toBe(text);
  });

  it('preserves manual expansion across streamed updates and completion', () => {
    const { container, rerender } = render(<Reasoning title="Thinking" text="first" running />);
    fireEvent.click(screen.getByRole('button', { name: 'Thinking' }));
    rerender(<Reasoning title="Thinking" text="first then second" running />);
    expect(screen.getByRole('button', { name: 'Thinking' }).getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('[data-reasoning-preview]')).toBeNull();
    expect(screen.getByText('first then second')).toBeTruthy();
    rerender(<Reasoning title="Thought" text="first then second" />);
    expect(screen.getByRole('button', { name: 'Thought' }).getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('[data-full-reasoning]')?.textContent).toBe('first then second');
  });
});
