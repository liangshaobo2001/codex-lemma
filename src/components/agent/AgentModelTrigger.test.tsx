import '@/lib/i18n';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AgentModelTrigger } from './AgentModelTrigger';

const { state } = vi.hoisted(() => ({ state: {
  model: 'qwen-fixture', reasoningEffort: 'medium', effortInherited: false, pending: false,
} }));
vi.mock('@/components/codex/hooks/useComposerModel', () => ({ useComposerModel: () => state }));
beforeEach(() => { state.pending = false; });

it('keeps model and effort available through the icon tooltip and accessible name', () => {
  const onClick = vi.fn();
  const { container } = render(<AgentModelTrigger onClick={onClick} />);
  const button = screen.getByRole('button', { name: /qwen-fixture.*Medium/i });
  expect(button.getAttribute('title')).toMatch(/qwen-fixture.*Medium/i);
  expect(container.querySelector('[data-toolbar-model-details]')?.textContent).toMatch(/Medium/i);
  expect(container.querySelector('[data-toolbar-model-icon]')).not.toBeNull();
  fireEvent.click(button);
  expect(onClick).toHaveBeenCalledOnce();
});

it('preserves the disabled model-switching state', () => {
  state.pending = true;
  render(<AgentModelTrigger />);
  const button = screen.getByRole('button');
  expect(button.hasAttribute('disabled')).toBe(true);
  expect(button.getAttribute('aria-busy')).toBe('true');
});
