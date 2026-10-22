import { Database, Gauge } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCodexStore } from '@/components/codex/stores/useCodexStore';
import { useSettingsStore } from '@/stores/settings';

/** Turn-average output throughput and the latest request's prompt-cache hit rate. */
export function ThroughputWidget() {
  const { t } = useTranslation('chat');
  const { speed: showSpeed, cache: showCache } = useSettingsStore((s) => s.composerWidgets);
  const currentThreadId = useCodexStore((state) => state.currentThreadId);
  const tokensPerSec = useCodexStore((state) =>
    state.currentThreadId
      ? (state.throughputMap[state.currentThreadId]?.tokensPerSec ?? null)
      : null
  );
  const last = useCodexStore((state) =>
    state.currentThreadId ? (state.tokenUsageMap[state.currentThreadId]?.last ?? null) : null
  );

  const tps = currentThreadId && tokensPerSec !== null ? Math.round(tokensPerSec) : null;
  const hit =
    currentThreadId && last && last.inputTokens > 0
      ? Math.round((Math.min(last.cachedInputTokens, last.inputTokens) / last.inputTokens) * 100)
      : 0;

  if (!showSpeed && !showCache) return null;

  return (
    <div className="flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
      {showSpeed && (
        <span className="flex items-center gap-1" title={t('widgets.speedTitle')}>
          <Gauge className="h-3.5 w-3.5" />
          {tps === null ? '—' : `≈${tps}`} tok/s
        </span>
      )}
      {showCache && (
        <span
          className="flex items-center gap-1"
          title={t('widgets.cacheTitle', {
            cached: last?.cachedInputTokens ?? 0,
            input: last?.inputTokens ?? 0,
          })}
        >
          <Database className="h-3.5 w-3.5" />
          {t('widgets.cacheHit', { hit })}
        </span>
      )}
    </div>
  );
}
