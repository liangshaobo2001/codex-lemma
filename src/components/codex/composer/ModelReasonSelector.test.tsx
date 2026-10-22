import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@/lib/i18n';
import { CodexModelSelector } from './ModelReasonSelector';

// cmdk scrolls the active item into view; jsdom does not implement it.
Element.prototype.scrollIntoView = vi.fn();

const itemsByProvider: Record<string, { id: string; label: string }[]> = {};
vi.mock('../hooks/useModels', () => ({
  useModels: () => ({ openAiModels: [], itemsByProvider }),
}));
vi.mock('@/services/codexService', () => ({ codexService: {} }));
vi.mock('@/components/icons', () => ({ ProviderIcons: () => null }));

const renderPanel = (onSelectModel = vi.fn()) =>
  render(
    <CodexModelSelector
      mode="panel"
      provider="local"
      onProviderChange={vi.fn()}
      value="qwen"
      onValueChange={vi.fn()}
      onSelectModel={onSelectModel}
    />
  );

describe('CodexModelSelector panel mode', () => {
  it('lists every configured provider with its models and picks across providers', () => {
    itemsByProvider.local = [{ id: 'qwen', label: 'Qwen local' }];
    itemsByProvider.deepseek = [{ id: 'deepseek-chat', label: 'DeepSeek Chat' }];
    const onSelectModel = vi.fn();
    renderPanel(onSelectModel);

    expect(screen.getByRole('option', { name: 'Qwen local' })).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: 'DeepSeek Chat' }));
    expect(onSelectModel).toHaveBeenCalledWith('deepseek', 'deepseek-chat');
  });

  it('points to the model settings when nothing is configured', () => {
    for (const key of Object.keys(itemsByProvider)) delete itemsByProvider[key];
    renderPanel();
    expect(screen.getByRole('option', { name: /Manage models/ })).toBeTruthy();
  });
});
