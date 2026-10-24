import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ check: vi.fn(), download: vi.fn(), install: vi.fn(), open: vi.fn() }));
vi.mock('@/hooks/runtime', () => ({ isWindows: () => true }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: api.open }));
vi.mock('@/services/apiAdapt/updates', () => ({ checkLemmaUpdate: api.check, downloadLemmaUpdate: api.download, installLemmaUpdate: api.install }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
import { UpdateSettings } from './UpdateSettings';
beforeEach(() => { vi.clearAllMocks(); api.check.mockResolvedValue({ version: '0.1.99', notes: 'Release notes' }); api.download.mockResolvedValue(undefined); api.install.mockResolvedValue(undefined); });
it('mounting, rerendering and focus never check or download updates', async () => {
  const view=render(<UpdateSettings />); view.rerender(<UpdateSettings />);
  await act(async () => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); await Promise.resolve(); });
  expect(api.check).not.toHaveBeenCalled(); expect(api.download).not.toHaveBeenCalled(); expect(api.open).not.toHaveBeenCalled();
});
it('requires a separate click for check, download, and install', async () => {
  render(<UpdateSettings />); fireEvent.click(screen.getByRole('button', { name: 'updates.check' }));
  await waitFor(() => expect(screen.getByRole('button',{name:'updates.download'})).toBeTruthy());
  expect(api.check).toHaveBeenCalledTimes(1); expect(api.download).not.toHaveBeenCalled(); expect(api.install).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'updates.download'}));
  await waitFor(() => expect(screen.getByRole('button',{name:'updates.install'})).toBeTruthy()); expect(api.install).not.toHaveBeenCalled();
  api.install.mockRejectedValue('Finish running tasks first.'); fireEvent.click(screen.getByRole('button',{name:'updates.install'}));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Finish running tasks'));
  expect((screen.getByRole('button',{name:'updates.install'}) as HTMLButtonElement).disabled).toBe(false);
});
it('does not offer installation after a failed signature check', async () => {
  api.download.mockRejectedValue('Signature verification failed'); render(<UpdateSettings />);
  fireEvent.click(screen.getByRole('button',{name:'updates.check'}));
  await screen.findByRole('button',{name:'updates.download'}); fireEvent.click(screen.getByRole('button',{name:'updates.download'}));
  await screen.findByRole('alert'); expect(screen.queryByRole('button',{name:'updates.install'})).toBeNull(); expect(api.install).not.toHaveBeenCalled();
});
