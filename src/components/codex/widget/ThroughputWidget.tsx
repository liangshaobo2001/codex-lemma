import { Database, Gauge } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCodexStore } from '@/components/codex/stores/useCodexStore';
import { useSettingsStore } from '@/stores/settings';
import { formatCacheHit } from './cacheHit';

/** Output throughput and the session's token-weighted prompt-cache hit rate. */
export function ThroughputWidget() {
  const { t } = useTranslation('chat');
  const { speed: showSpeed, cache: showCache } = useSettingsStore((s) => s.composerWidgets);
  const currentThreadId = useCodexStore((state) => state.currentThreadId);
  const metrics = useCodexStore((state) =>
    state.currentThreadId ? (state.throughputMap[state.currentThreadId] ?? null) : null
  );
  const usage = useCodexStore((state) =>
    state.currentThreadId ? (state.tokenUsageMap[state.currentThreadId]?.total ?? null) : null
  );

  const tps =
    currentThreadId && metrics?.tokensPerSec != null ? Math.round(metrics.tokensPerSec) : null;
  const ttft = metrics?.ttftMs != null ? (metrics.ttftMs / 1000).toFixed(1) : '—';
  const hit = formatCacheHit(usage?.cachedInputTokens, usage?.inputTokens);

  if (!showSpeed && !showCache) return null;

  return (
    <div className="flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
      {showSpeed && (
        <span
          className="flex items-center gap-1"
          title={t('widgets.speedTitle', { ttft, requests: metrics?.requests ?? 0 })}
        >
          <Gauge className="h-3.5 w-3.5" />
          {tps === null ? '—' : `≈${tps}`} tok/s
        </span>
      )}
      {showCache && (
        <span
          className="flex items-center gap-1"
          title={
            hit === null
              ? t('widgets.cacheUnavailable')
              : t('widgets.cacheTitle', {
                  cached: usage?.cachedInputTokens,
                  input: usage?.inputTokens,
                })
          }
        >
          <Database className="h-3.5 w-3.5" />
          {hit === null ? t('widgets.cacheUnknown') : t('widgets.cacheHit', { hit })}
        </span>
      )}
    </div>
  );
}
