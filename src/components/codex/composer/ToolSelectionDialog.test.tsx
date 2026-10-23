import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/lib/i18n';
import { ToolSelectionDialog } from './ToolSelectionDialog';
import { useCodexStore } from '../stores';
import { useThreadModels } from '../stores/useThreadModels';
import { useSessionTools } from '../stores/useSessionTools';
import { readSessionTools, saveSessionTools, type ToolSnapshot } from '@/services/apiAdapt/toolDiscovery';
vi.mock('@/services/apiAdapt/toolDiscovery', () => ({ readSessionTools: vi.fn(), saveSessionTools: vi.fn(), recheckSessionTools: vi.fn() }));
vi.mock('@/services/codexService', () => ({ codexService: { threadStart: vi.fn() } }));
const snapshot: ToolSnapshot = { threadId: 'a', provider: 'local', model: 'qwen', phase: 'ready', mode: 'direct', selected: [], error: null, tools: [{ id: 'mcp__fixture.read', name: 'Read fixture', group: 'mcp__fixture', description: '' }] };
function resetThread(id: string, provider = 'local') {
  useCodexStore.setState({ currentThreadId: id, threadStatusMap: {} });
  useThreadModels.setState({ confirmed: { [id]: { modelProvider: provider, model: 'qwen', reasoningEffort: 'none' } }, pending: {}, errors: {} });
}
describe('session fallback tool selection', () => {
  beforeEach(() => { vi.resetAllMocks(); resetThread('a'); useSessionTools.setState({ snapshots: {}, pending: {}, errors: {} }); vi.mocked(readSessionTools).mockResolvedValue(snapshot); });
  it('saves to the current chat, waits for confirmation and preserves failures', async () => {
    let reject!: (reason: Error) => void;
    vi.mocked(saveSessionTools).mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
    render(<ToolSelectionDialog open onOpenChange={vi.fn()} />);
    const checkbox = await screen.findByRole('checkbox', { name: /Read fixture/ });
    fireEvent.click(checkbox);
    expect(saveSessionTools).toHaveBeenCalledWith('a', ['mcp__fixture.read']);
    expect(useSessionTools.getState().pending.a).toBe(true);
    expect(checkbox.hasAttribute('disabled')).toBe(true);
    await act(async () => { reject(new Error('Save refused')); });
    expect(useSessionTools.getState().errors.a).toContain('Save refused');
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
  it('does not show a late inventory from another chat', async () => {
    let resolve!: (value: ToolSnapshot) => void;
    vi.mocked(readSessionTools).mockReturnValueOnce(new Promise((done) => { resolve = done; })).mockResolvedValueOnce({ ...snapshot, threadId: 'b', tools: [] });
    render(<ToolSelectionDialog open onOpenChange={vi.fn()} />);
    await act(async () => { resetThread('b'); });
    await waitFor(() => expect(readSessionTools).toHaveBeenCalledWith('b'));
    await act(async () => { resolve(snapshot); });
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(useSessionTools.getState().snapshots.a).toBeUndefined();
  });
  it('keeps tools managed by Codex for the official provider', () => {
    resetThread('a', 'openai');render(<ToolSelectionDialog open onOpenChange={vi.fn()} />);
    expect(readSessionTools).not.toHaveBeenCalled();expect(screen.queryByRole('checkbox')).toBeNull();
  });
  it('does not claim a previous model capability was verified for a new model', async () => {
    vi.mocked(readSessionTools).mockResolvedValue({ ...snapshot, model: 'previous', mode: 'native' });
    render(<ToolSelectionDialog open onOpenChange={vi.fn()} />);
    expect(await screen.findByText('Checked on the next request')).toBeTruthy();
    expect(screen.queryByText('Native discovery')).toBeNull();
  });
});
