import { Trans, useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AGENTS_MAX_DEPTH_CAP, AGENTS_MAX_THREADS_CAP, useSettingsStore } from '@/stores/settings';

/**
 * Settings panel for multi-agent runtime limits.
 * Mirrors the `[agents]` TOML section that Codex reads from ~/.codex/config.toml.
 * Product caps: max_threads ≤ 12, max_depth ≤ 4.
 */
export function SettingsAgentsSection() {
  const { t } = useTranslation('app');
  const { agentsMaxThreads, agentsMaxDepth, setAgentsMaxThreads, setAgentsMaxDepth } =
    useSettingsStore();

  const handleThreadsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) setAgentsMaxThreads(val);
  };

  const handleDepthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) setAgentsMaxDepth(val);
  };

  return (
    <div className="w-full px-2 sm:px-4 space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm sm:text-base font-medium">{t('agents.title')}</h3>
        <div className="flex flex-col gap-3 sm:gap-4">
          {/* max_threads */}
          <div className="flex items-center justify-between gap-3 rounded-md border p-3 sm:p-4">
            <div className="space-y-0.5 flex-1 min-w-0">
              <Label className="text-xs sm:text-sm font-medium">{t('agents.threadLimit')}</Label>
              <p className="text-xs text-muted-foreground">
                <Trans
                  t={t}
                  i18nKey="agents.threadLimitDescription"
                  values={{ max: AGENTS_MAX_THREADS_CAP }}
                  components={{ code: <code className="text-xs" /> }}
                />
              </p>
            </div>
            <Input
              type="number"
              min={1}
              max={AGENTS_MAX_THREADS_CAP}
              value={agentsMaxThreads}
              onChange={handleThreadsChange}
              className="w-20 text-right"
            />
          </div>

          {/* max_depth */}
          <div className="flex items-center justify-between gap-3 rounded-md border p-3 sm:p-4">
            <div className="space-y-0.5 flex-1 min-w-0">
              <Label className="text-xs sm:text-sm font-medium">{t('agents.spawnDepth')}</Label>
              <p className="text-xs text-muted-foreground">
                <Trans
                  t={t}
                  i18nKey="agents.spawnDepthDescription"
                  values={{ max: AGENTS_MAX_DEPTH_CAP }}
                  components={{ code: <code className="text-xs" /> }}
                />
              </p>
            </div>
            <Input
              type="number"
              min={1}
              max={AGENTS_MAX_DEPTH_CAP}
              value={agentsMaxDepth}
              onChange={handleDepthChange}
              className="w-20 text-right"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
