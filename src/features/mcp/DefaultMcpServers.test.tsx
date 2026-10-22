import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const addUnified = vi.fn().mockResolvedValue(undefined);
vi.mock('@/services', () => ({
  unifiedAddMcpServer: (...args: unknown[]) => addUnified(...args),
}));

import '@/lib/i18n';
import { DefaultMcpServers } from './DefaultMcpServers';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('featured connectors', () => {
  it('lists FXMacroData under its category, below Featured, and adds it to Codex', async () => {
    const added = vi.fn();
    render(<DefaultMcpServers agent="codex" servers={{}} onServerAdded={added} />);
    const featured = screen.getByRole('region', { name: 'Featured' });
    expect(within(featured).queryByRole('button', { name: 'Add FXMacroData' })).toBeNull();
    const analytics = screen.getByRole('region', { name: 'Analytics' });
    fireEvent.click(within(analytics).getByRole('button', { name: 'Add FXMacroData' }));
    await waitFor(() => expect(added).toHaveBeenCalledOnce());
    expect(addUnified).toHaveBeenCalledWith(
      expect.objectContaining({ clientName: 'codex', serverName: 'fxmacrodata' })
    );
  });

  it('marks a connector that is already configured', () => {
    render(
      <DefaultMcpServers agent="codex" servers={{ fxmacrodata: {} }} onServerAdded={vi.fn()} />
    );
    expect(screen.getByLabelText('FXMacroData configured')).toBeTruthy();
  });
});
