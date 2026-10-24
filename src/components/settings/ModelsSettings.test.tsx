import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const model = vi.hoisted(() => ({ add: vi.fn().mockResolvedValue(undefined), refresh: vi.fn().mockResolvedValue(undefined) }));
vi.mock('react-i18next', async (load) => ({ ...await load<typeof import('react-i18next')>(), useTranslation: () => ({t: (key: string) => key}) }));
vi.mock('@/components/codex/hooks/useModels', () => ({ useModels: () => ({
  configProviders: [{name:'local',base_url:'http://fixture.invalid/v1',has_api_key:false}],
  storedModels: {local:[{id:'inherited',name:'inherited'},{id:'explicit',name:'explicit',contextWindow:32768}]},
  discoveredModels: {}, presets: [], refreshProviders: model.refresh,
}) }));
vi.mock('@/services/apiAdapt', async (load) => ({ ...await load<typeof import('@/services/apiAdapt')>(), addModelProvider: vi.fn().mockResolvedValue(undefined) }));
import { useModelSettingsStore } from '@/stores/settings';
import { ModelsSettings } from './ModelsSettings';

it('labels inherited context honestly and preserves missing overrides when saving an unchanged provider', async () => {
  useModelSettingsStore.setState({addModel:model.add});
  render(<ModelsSettings />);
  fireEvent.click(screen.getByTitle('modelsPage.edit'));
  const contexts = screen.getAllByPlaceholderText('modelsPage.contextDefault') as HTMLInputElement[];
  expect(contexts.map(input=>input.value)).toEqual(['','32768']);
  expect(screen.queryByPlaceholderText('128000')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'modelsPage.save'}));
  await waitFor(()=>expect(model.refresh).toHaveBeenCalled());
  expect(model.add).toHaveBeenCalledWith('local',{id:'inherited',name:'inherited'});
  expect(model.add).toHaveBeenCalledWith('local',{id:'explicit',name:'explicit',contextWindow:32768});
});
