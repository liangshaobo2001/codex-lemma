import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useModels } from '@/components/codex/hooks/useModels';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import {
  getReviewerSettings,
  type ReviewerStatus,
  type ReviewerSettings as Settings,
  saveReviewerSettings,
} from '@/services/apiAdapt/reviewer';

export function ReviewerSettings() {
  const { t } = useTranslation('settings');
  const { configProviders, storedModels } = useModels();
  const [status, setStatus] = useState<ReviewerStatus | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    void getReviewerSettings()
      .then((result) => {
        if (current) {
          setStatus(result);
          setForm(result.saved);
        }
      })
      .catch((e) => {
        if (current) setError(String(e));
      });
    return () => {
      current = false;
    };
  }, []);
  const save = async () => {
    if (!form) return;
    setSaving(true);
    setError('');
    try {
      const result = await saveReviewerSettings(form);
      setStatus(result);
      setForm(result.saved);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };
  const providers = configProviders.filter((p) => p.name !== 'openai');
  const models = form ? (storedModels[form.provider] ?? []) : [];
  const valid =
    form &&
    (!form.independent ||
      (form.provider &&
        form.model &&
        Number.isInteger(form.contextWindow) &&
        form.contextWindow >= 1024 &&
        form.contextWindow <= 1048576));
  return (
    <section className="space-y-3">
      <h3 className="px-1 text-sm font-medium">{t('reviewer.title')}</h3>
      <Card>
        <CardContent className="space-y-4 px-4">
          <p className="text-xs text-muted-foreground">{t('reviewer.mainSelection')}</p>
          {form && (
            <>
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="independent-reviewer">{t('reviewer.independent')}</Label>
                <Switch
                  id="independent-reviewer"
                  checked={form.independent}
                  onCheckedChange={(independent) => setForm({ ...form, independent })}
                  disabled={saving}
                />
              </div>
              {form.independent && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="reviewer-provider">{t('reviewer.provider')}</Label>
                    <Select
                      value={form.provider}
                      disabled={saving}
                      onValueChange={(provider) => setForm({ ...form, provider, model: '' })}
                    >
                      <SelectTrigger id="reviewer-provider">
                        <SelectValue placeholder={t('reviewer.selectProvider')} />
                      </SelectTrigger>
                      <SelectContent>
                        {providers.map((provider) => (
                          <SelectItem key={provider.name} value={provider.name}>
                            {provider.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="reviewer-model">{t('reviewer.model')}</Label>
                    <Select
                      value={form.model}
                      disabled={saving || !form.provider}
                      onValueChange={(model) => setForm({ ...form, model })}
                    >
                      <SelectTrigger id="reviewer-model">
                        <SelectValue placeholder={t('reviewer.selectModel')} />
                      </SelectTrigger>
                      <SelectContent>
                        {models.map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="reviewer-context">{t('reviewer.context')}</Label>
                    <Input
                      id="reviewer-context"
                      type="number"
                      min={1024}
                      max={1048576}
                      value={form.contextWindow || ''}
                      disabled={saving}
                      onChange={(e) => setForm({ ...form, contextWindow: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="reviewer-effort">{t('reviewer.effort')}</Label>
                    <Select
                      value={form.effort}
                      disabled={saving}
                      onValueChange={(effort) => setForm({ ...form, effort })}
                    >
                      <SelectTrigger id="reviewer-effort">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['none', 'minimal', 'low', 'medium', 'high', 'xhigh'].map((effort) => (
                          <SelectItem key={effort} value={effort}>
                            {effort}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              {status && (
                <div className="space-y-1 text-xs text-muted-foreground" role="status">
                  <p>
                    {t('reviewer.active')}:{' '}
                    {status.active.independent && status.routingReady
                      ? `${status.active.provider} / ${status.active.model} · ${status.active.contextWindow.toLocaleString()} · ${status.active.effort}`
                      : t(status.error ? 'reviewer.unavailable' : 'reviewer.default')}
                  </p>
                  {status.restartRequired && <p>{t('reviewer.restartRequired')}</p>}
                  {status.error && <p role="alert">{status.error}</p>}
                </div>
              )}
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving || !valid}
                  onClick={() => void save()}
                >
                  {t(saving ? 'reviewer.saving' : 'reviewer.save')}
                </Button>
                <span className="text-xs text-muted-foreground">{t('reviewer.restartHint')}</span>
              </div>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">{t('reviewer.details')}</summary>
                <p className="mt-2">{t('reviewer.compatibility')}</p>
              </details>
            </>
          )}
          {error && (
            <p role="alert" className="break-words text-xs">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
