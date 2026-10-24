import { openUrl } from '@tauri-apps/plugin-opener';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { isWindows } from '@/hooks/runtime';
import {
  checkLemmaUpdate,
  downloadLemmaUpdate,
  installLemmaUpdate,
  type LemmaRelease,
} from '@/services/apiAdapt/updates';
import { version } from '../../../package.json';

export function UpdateSettings() {
  const { t } = useTranslation('settings');
  const [release, setRelease] = useState<LemmaRelease | null>(null);
  const [phase, setPhase] = useState<
    'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'ready' | 'installing'
  >('idle');
  const [error, setError] = useState('');
  if (!isWindows()) return null;
  const busy = ['checking', 'downloading', 'installing'].includes(phase);
  const check = async () => {
    setError('');
    setRelease(null);
    setPhase('checking');
    try {
      const update = await checkLemmaUpdate();
      setRelease(update);
      setPhase(update ? 'available' : 'current');
    } catch (e) {
      setError(String(e));
      setPhase('idle');
    }
  };
  const download = async () => {
    setError('');
    setPhase('downloading');
    try {
      await downloadLemmaUpdate();
      setPhase('ready');
    } catch (e) {
      setError(String(e));
      setPhase('available');
    }
  };
  const install = async () => {
    setError('');
    setPhase('installing');
    try {
      await installLemmaUpdate();
    } catch (e) {
      setError(String(e));
      setPhase('ready');
    }
  };
  return (
    <section className="space-y-3">
      <h3 className="px-1 text-sm font-medium">{t('updates.title')}</h3>
      <Card>
        <CardContent className="space-y-3 px-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm">Codex Lemma {version}</p>
              <p className="text-xs text-muted-foreground">{t('updates.manualOnly')}</p>
            </div>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void check()}>
              {t(phase === 'checking' ? 'updates.checking' : 'updates.check')}
            </Button>
          </div>
          {phase === 'current' && (
            <p role="status" className="text-sm">
              {t('updates.current')}
            </p>
          )}
          {release && (
            <div className="space-y-3">
              <p className="text-sm">{t('updates.available', { version: release.version })}</p>
              {release.notes && (
                <details>
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    {t('updates.notes')}
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap font-sans text-xs">
                    {release.notes}
                  </pre>
                </details>
              )}
              {phase === 'available' && (
                <Button size="sm" variant="outline" onClick={() => void download()}>
                  {t('updates.download')}
                </Button>
              )}
              {phase === 'downloading' && (
                <p role="status" className="text-sm">
                  {t('updates.downloading')}
                </p>
              )}
              {['ready', 'installing'].includes(phase) && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">{t('updates.installHint')}</p>
                  <Button size="sm" disabled={busy} onClick={() => void install()}>
                    {t(phase === 'installing' ? 'updates.installing' : 'updates.install')}
                  </Button>
                </div>
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="break-words text-xs text-foreground">
              {error}
            </p>
          )}
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            disabled={busy}
            onClick={() => void openUrl('https://github.com/liangshaobo2001/codex-lemma/releases')}
          >
            {t('updates.releases')}
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
