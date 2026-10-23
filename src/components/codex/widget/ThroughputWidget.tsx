import { Database, Gauge } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCodexStore } from '@/components/codex/stores/useCodexStore';
import { useToolUsage } from '@/services/apiAdapt/toolUsage';
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
  const previous = useCodexStore((state) =>
    state.currentThreadId ? (state.lastThroughputMap[state.currentThreadId] ?? null) : null
  );
  const showingPrevious = metrics?.tokensPerSec == null && previous !== null;
  const reading = showingPrevious ? previous : metrics;
  const usage = useCodexStore((state) =>
    state.currentThreadId ? (state.tokenUsageMap[state.currentThreadId]?.total ?? null) : null
  );

  const tps =
    currentThreadId && reading?.tokensPerSec != null ? Math.round(reading.tokensPerSec) : null;
  const ttft = reading?.ttftMs != null ? (reading.ttftMs / 1000).toFixed(1) : '—';
  const extra = useToolUsage((state) =>
    currentThreadId ? state.usage[currentThreadId] : undefined
  );
  const cached = usage ? usage.cachedInputTokens + (extra?.cachedInputTokens ?? 0) : undefined;
  const input = usage ? usage.inputTokens + (extra?.inputTokens ?? 0) : undefined;
  const hit = extra?.complete === false ? null : formatCacheHit(cached, input);

  if (!showSpeed && !showCache) return null;

  return (
    <div className="flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
      {showSpeed && (
        <span
          className="flex items-center gap-1"
          title={t(showingPrevious ? 'widgets.speedPreviousTitle' : 'widgets.speedTitle', {
            ttft,
            requests: reading?.requests ?? 0,
          })}
        >
          <Gauge className="h-3.5 w-3.5" />
          {tps === null ? '—' : tps} tok/s
        </span>
      )}
      {showCache && (
        <span
          className="flex items-center gap-1"
          title={
            hit === null
              ? t('widgets.cacheUnavailable')
              : t('widgets.cacheTitle', {
                  cached,
                  input,
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
