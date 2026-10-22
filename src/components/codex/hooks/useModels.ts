import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import type { Model } from '@/bindings/v2';
import type {
  ConfigProvider,
  FrontendProviderModels,
  ModelListItem,
  ProviderPreset,
} from '@/components/codex/types';
import {
  listConfigProviders,
  listModels,
  listOtherModels,
  listProviderPresets,
} from '@/services/apiAdapt';
import { useModelSettingsStore, useSettingsStore } from '@/stores/settings';

type ModelCacheStore = {
  openAiModels: Model[];
  otherModels: Record<string, ModelListItem[]>;
  // Providers read from the user's config.toml — the source of truth for which
  // providers exist at all.
  configProviders: ConfigProvider[];
  // llms.json entries: suggested models a user can add, never auto-listed.
  presets: ProviderPreset[];
  loaded: boolean;
  load: () => void;
  refreshProviders: () => Promise<void>;
};

// Shared across every selector instance so the model lists are fetched once.
const useModelCacheStore = create<ModelCacheStore>()((set, get) => ({
  openAiModels: [],
  otherModels: {},
  configProviders: [],
  presets: [],
  loaded: false,

  refreshProviders: async () => {
    try {
      set({ configProviders: await listConfigProviders() });
    } catch {
      // Codex backend unavailable: keep whatever was loaded before.
    }
  },

  load: () => {
    if (get().loaded) return;
    set({ loaded: true });

    void get().refreshProviders();

    void listProviderPresets()
      .then((presets) => set({ presets }))
      .catch(() => {});

    void listModels()
      .then((res) => set({ openAiModels: res.data }))
      .catch(() => {});

    void listOtherModels()
      .then((items: FrontendProviderModels[]) => {
        const grouped: Record<string, ModelListItem[]> = {};
        for (const item of items) {
          grouped[item.provider] = item.models.map((m) => ({ id: m.id, label: m.id }));
        }
        set({ otherModels: grouped });
      })
      .catch(() => {});
  },
}));

export function useModels() {
  const openAiModels = useModelCacheStore((s) => s.openAiModels);
  const otherModels = useModelCacheStore((s) => s.otherModels);
  const load = useModelCacheStore((s) => s.load);
  const configProviders = useModelCacheStore((s) => s.configProviders);
  const refreshProviders = useModelCacheStore((s) => s.refreshProviders);
  const presets = useModelCacheStore((s) => s.presets);
  const storedModels = useModelSettingsStore((s) => s.models);
  const loadStoredModels = useModelSettingsStore((s) => s.load);
  const showOpenAiModels = useSettingsStore((s) => s.showOpenAiModels);

  useEffect(() => {
    load();
    loadStoredModels();
  }, [load, loadStoredModels]);

  // What the picker lists: the models the user added, per provider, in config order (built-ins such as
  // ollama only once the user added a model for them). OpenAI's own models only when that setting is on.
  const itemsByProvider = useMemo(() => {
    const map: Record<string, ModelListItem[]> = {};
    if (showOpenAiModels && openAiModels.length > 0) {
      map.openai = openAiModels.map((m) => ({
        id: m.id,
        label: m.displayName || m.model,
        description: m.description,
      }));
    }
    for (const { name: provider } of configProviders) {
      if (provider === 'openai') continue;
      const stored = (storedModels[provider] ?? []).map((m) => ({ id: m.id, label: m.name }));
      if (stored.length > 0) map[provider] = stored;
    }
    return map;
  }, [openAiModels, storedModels, configProviders, showOpenAiModels]);

  const allProviders = useMemo(() => Object.keys(itemsByProvider), [itemsByProvider]);

  const providerItems = useMemo(
    () =>
      (provider: string): ModelListItem[] =>
        itemsByProvider[provider] ?? [],
    [itemsByProvider]
  );

  // Models llms.json knows about that the user has not added yet.
  const providerSuggestions = useMemo(
    () =>
      (provider: string): ModelListItem[] => {
        const listed = itemsByProvider[provider] ?? [];
        const preset = presets.find((p) => p.model_provider === provider);
        return (preset?.models ?? [])
          .filter((m) => !listed.some((item) => item.id === m.id))
          .map((m) => ({ id: m.id, label: m.id }));
      },
    [presets, itemsByProvider]
  );

  // Context window the user set for a model, passed to Codex when a thread starts or resumes.
  const contextWindowOf = useMemo(
    () =>
      (provider: string, id: string): number | undefined =>
        (storedModels[provider] ?? []).find((m) => m.id === id)?.contextWindow,
    [storedModels]
  );

  return {
    openAiModels,
    contextWindowOf,
    presets,
    storedModels,
    // Models found by asking auto-discovering providers (ollama, lmstudio) for their list.
    discoveredModels: otherModels,
    providerSuggestions,
    itemsByProvider,
    providerItems,
    allProviders,
    configProviders,
    refreshProviders,
  };
}
