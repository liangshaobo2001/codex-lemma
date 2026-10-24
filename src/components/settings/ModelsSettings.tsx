import { ExternalLink, KeyRound, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useModels } from '@/components/codex/hooks/useModels';
import type { ConfigProvider, ProviderPreset } from '@/components/codex/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useExternalUrl } from '@/features/plugins/hooks/useExternalUrl';
import { addModelProvider, removeModelProvider } from '@/services/apiAdapt';
import type { CustomModel } from '@/services/apiAdapt/customModels';
import { useModelSettingsStore, useSettingsStore } from '@/stores/settings';
import { ReviewerSettings } from './ReviewerSettings';

/** Providers Codex has built in: never written to config.toml, listed once the user adds a model for them. */
const BUILTIN_PROVIDERS = new Set(['ollama', 'lmstudio']);
const RESERVED_IDS = new Set(['openai']);
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const CUSTOM_PRESET = 'custom';

type ModelRow = { id: string; name: string; contextWindow: string };

const emptyRow = (): ModelRow => ({ id: '', name: '', contextWindow: '' });

const toRows = (models: CustomModel[]): ModelRow[] =>
  models.map((m) => ({
    id: m.id,
    name: m.name === m.id ? '' : m.name,
    contextWindow: m.contextWindow ? String(m.contextWindow) : '',
  }));

const formatTokens = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
      ? `${Math.round(n / 1000)}K`
      : `${n}`;

type FormTarget = { kind: 'new' } | { kind: 'edit'; provider: ConfigProvider };

function ProviderFormDialog({
  target,
  presets,
  onClose,
}: {
  target: FormTarget | null;
  presets: ProviderPreset[];
  onClose: () => void;
}) {
  const { t } = useTranslation('settings');
  const { storedModels, discoveredModels, refreshProviders } = useModels();
  const addModel = useModelSettingsStore((s) => s.addModel);
  const removeModel = useModelSettingsStore((s) => s.removeModel);
  const { openExternalUrl: openUrl } = useExternalUrl();
  const editing = target?.kind === 'edit' ? target.provider : null;

  const [presetKey, setPresetKey] = useState(CUSTOM_PRESET);
  const [id, setId] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [rows, setRows] = useState<ModelRow[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [loadedFor, setLoadedFor] = useState<FormTarget | null>(null);

  // Reset the form whenever the dialog opens for another target.
  if (target !== loadedFor) {
    setLoadedFor(target);
    if (editing) {
      setPresetKey(
        presets.some((p) => p.model_provider === editing.name) ? editing.name : CUSTOM_PRESET
      );
      setId(editing.name);
      setBaseUrl(editing.base_url ?? '');
      const existing = toRows(storedModels[editing.name] ?? []);
      setRows(existing.length > 0 ? existing : [emptyRow()]);
    } else {
      setPresetKey(CUSTOM_PRESET);
      setId('');
      setBaseUrl('');
      setRows([emptyRow()]);
    }
    setApiKey('');
  }

  const preset = presets.find((p) => p.model_provider === presetKey);
  const builtin = BUILTIN_PROVIDERS.has(id);
  const discovered = (discoveredModels[id] ?? []).filter(
    (m) => !rows.some((row) => row.id.trim() === m.id)
  );

  const applyPreset = (key: string) => {
    setPresetKey(key);
    const next = presets.find((p) => p.model_provider === key);
    if (!next || key === CUSTOM_PRESET) return;
    if (!editing) setId(next.model_provider);
    setBaseUrl(next.base_url);
  };

  const updateRow = (index: number, patch: Partial<ModelRow>) =>
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const save = async () => {
    const providerId = id.trim();
    const models = rows.filter((row) => row.id.trim());
    if (!ID_PATTERN.test(providerId)) return toast.error(t('modelsPage.invalidId'));
    if (RESERVED_IDS.has(providerId)) return toast.error(t('modelsPage.reservedId'));
    if (!builtin && !baseUrl.trim()) return toast.error(t('modelsPage.needUrl'));
    if (models.length === 0) return toast.error(t('modelsPage.needModel'));

    setSaving(true);
    try {
      if (!builtin) {
        await addModelProvider({
          provider: providerId,
          baseUrl: baseUrl.trim(),
          // Editing with the field left empty keeps the stored key.
          apiKey: editing && !apiKey.trim() ? undefined : apiKey.trim(),
        });
      }
      for (const row of models) {
        const contextWindow = Number.parseInt(row.contextWindow.replace(/[^0-9]/g, ''), 10);
        await addModel(providerId, {
          id: row.id.trim(),
          name: row.name.trim() || row.id.trim(),
          ...(contextWindow > 0 ? { contextWindow } : {}),
        });
      }
      if (editing) {
        const kept = new Set(models.map((row) => row.id.trim()));
        for (const old of storedModels[editing.name] ?? []) {
          if (!kept.has(old.id)) await removeModel(editing.name, old.id);
        }
      }
      await refreshProviders();
      toast.success(t('modelsPage.saved'));
      onClose();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {editing ? t('modelsPage.editProvider') : t('modelsPage.addProvider')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {!editing && (
            <div className="space-y-1">
              <Label className="text-xs">{t('modelsPage.preset')}</Label>
              <Select value={presetKey} onValueChange={applyPreset}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {presets
                    .filter((p) => p.model_provider !== CUSTOM_PRESET)
                    .map((p) => (
                      <SelectItem key={p.model_provider} value={p.model_provider}>
                        {p.model_provider}
                      </SelectItem>
                    ))}
                  <SelectItem value={CUSTOM_PRESET}>{t('modelsPage.custom')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <div className="space-y-1">
              <Label className="text-xs">{t('modelsPage.providerId')}</Label>
              <Input
                className="h-8"
                value={id}
                disabled={Boolean(editing)}
                placeholder="deepseek"
                onChange={(e) => setId(e.target.value.toLowerCase())}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('modelsPage.baseUrl')}</Label>
              <Input
                className="h-8"
                value={baseUrl}
                disabled={builtin}
                placeholder="https://api.example.com/v1"
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>
          </div>
          {!editing && (
            <p className="text-xs text-muted-foreground">{t('modelsPage.providerIdHint')}</p>
          )}

          {!builtin && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs">{t('modelsPage.apiKey')}</Label>
                {preset?.api_key_url && (
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => void openUrl(preset.api_key_url as string)}
                  >
                    {t('modelsPage.getKey')}
                    <ExternalLink className="h-3 w-3" />
                  </button>
                )}
              </div>
              <Input
                className="h-8"
                type="password"
                autoComplete="off"
                value={apiKey}
                placeholder={
                  editing?.has_api_key ? t('modelsPage.apiKeyKeep') : t('modelsPage.apiKeyOptional')
                }
                onChange={(e) => setApiKey(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('modelsPage.keyPlaintext')}</p>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">{t('modelsPage.models')}</Label>
            <div className="grid grid-cols-[2fr_2fr_1fr_auto] gap-1.5 text-xs text-muted-foreground">
              <span>{t('modelsPage.modelId')}</span>
              <span>{t('modelsPage.displayName')}</span>
              <span title={t('modelsPage.contextHint')}>{t('modelsPage.contextWindow')}</span>
              <span className="w-7" />
              {rows.map((row, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity until saved
                <div key={index} className="contents">
                  <Input
                    className="h-8"
                    value={row.id}
                    placeholder="deepseek-chat"
                    onChange={(e) => updateRow(index, { id: e.target.value })}
                  />
                  <Input
                    className="h-8"
                    value={row.name}
                    placeholder={row.id || 'DeepSeek Chat'}
                    onChange={(e) => updateRow(index, { name: e.target.value })}
                  />
                  <Input
                    className="h-8"
                    inputMode="numeric"
                    value={row.contextWindow}
                    placeholder={t('modelsPage.contextDefault')}
                    onChange={(e) => updateRow(index, { contextWindow: e.target.value })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-7"
                    title={t('modelsPage.removeModel')}
                    onClick={() =>
                      setRows((prev) =>
                        prev.length > 1 ? prev.filter((_, i) => i !== index) : [emptyRow()]
                      )
                    }
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setRows((prev) => [...prev, emptyRow()])}
              >
                <Plus className="h-3.5 w-3.5" />
                {t('modelsPage.addModel')}
              </Button>
              {discovered.map((m) => (
                <Button
                  key={m.id}
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={() =>
                    setRows((prev) => [
                      ...prev.filter((row) => row.id.trim()),
                      { id: m.id, name: '', contextWindow: '' },
                    ])
                  }
                >
                  <Plus className="h-3 w-3" />
                  {m.id}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              {t('modelsPage.cancel')}
            </Button>
            <Button size="sm" disabled={saving} onClick={() => void save()}>
              {t('modelsPage.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Settings → Models: the providers in Codex's config and the models added for each. */
export function ModelsSettings() {
  const { t } = useTranslation('settings');
  const { configProviders, storedModels, presets, refreshProviders } = useModels();
  const removeModel = useModelSettingsStore((s) => s.removeModel);
  const showOpenAiModels = useSettingsStore((s) => s.showOpenAiModels);
  const setShowOpenAiModels = useSettingsStore((s) => s.setShowOpenAiModels);
  const [formTarget, setFormTarget] = useState<FormTarget | null>(null);

  const providers = useMemo(
    () =>
      configProviders.filter(
        (p) =>
          p.name !== 'openai' &&
          (!BUILTIN_PROVIDERS.has(p.name) || (storedModels[p.name] ?? []).length > 0)
      ),
    [configProviders, storedModels]
  );

  const removeProvider = async (provider: ConfigProvider) => {
    if (!window.confirm(t('modelsPage.confirmRemove', { name: provider.name }))) return;
    try {
      for (const m of storedModels[provider.name] ?? []) await removeModel(provider.name, m.id);
      if (!BUILTIN_PROVIDERS.has(provider.name)) await removeModelProvider(provider.name);
      await refreshProviders();
    } catch (error) {
      toast.error(String(error));
    }
  };

  return (
    <div className="space-y-6">
      <ReviewerSettings />
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4 px-1">
          <div>
            <h3 className="text-sm font-medium">{t('modelsPage.title')}</h3>
            <p className="text-xs text-muted-foreground">{t('modelsPage.intro')}</p>
          </div>
          <Button size="sm" onClick={() => setFormTarget({ kind: 'new' })}>
            <Plus className="h-4 w-4" />
            {t('modelsPage.addProvider')}
          </Button>
        </div>

        {providers.length === 0 && (
          <Card>
            <CardContent className="px-4 text-sm text-muted-foreground">
              {t('modelsPage.noProviders')}
            </CardContent>
          </Card>
        )}

        {providers.map((provider) => {
          const models = storedModels[provider.name] ?? [];
          const builtin = BUILTIN_PROVIDERS.has(provider.name);
          return (
            <Card key={provider.name}>
              <CardContent className="space-y-3 px-4">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{provider.name}</span>
                  {builtin ? (
                    <Badge variant="secondary">{t('modelsPage.builtin')}</Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1 font-normal">
                      <KeyRound className="h-3 w-3" />
                      {provider.has_api_key
                        ? t('modelsPage.apiKeyStored')
                        : t('modelsPage.noApiKey')}
                    </Badge>
                  )}
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {provider.base_url}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title={t('modelsPage.edit')}
                    onClick={() => setFormTarget({ kind: 'edit', provider })}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title={t('modelsPage.removeProvider')}
                    onClick={() => void removeProvider(provider)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-delete-icon!" />
                  </Button>
                </div>
                {models.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('modelsPage.noModels')}</p>
                ) : (
                  <ul className="divide-y rounded-md border text-xs">
                    {models.map((m) => (
                      <li key={m.id} className="flex items-center gap-3 px-3 py-1.5">
                        <span className="min-w-0 flex-1 truncate">{m.name}</span>
                        {m.name !== m.id && (
                          <span className="truncate font-mono text-muted-foreground">{m.id}</span>
                        )}
                        <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">
                          {m.contextWindow ? formatTokens(m.contextWindow) : '—'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="space-y-3">
        <Card>
          <CardContent className="px-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="text-sm font-medium">{t('modelsPage.showOpenAi')}</div>
                <div className="text-xs text-muted-foreground">
                  {t('modelsPage.showOpenAiHint')}
                </div>
              </div>
              <Switch checked={showOpenAiModels} onCheckedChange={setShowOpenAiModels} />
            </div>
          </CardContent>
        </Card>
      </section>

      <ProviderFormDialog
        target={formTarget}
        presets={presets}
        onClose={() => setFormTarget(null)}
      />
    </div>
  );
}
