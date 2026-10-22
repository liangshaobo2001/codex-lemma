import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getUsageStats, type UsageStats } from '@/services/apiAdapt/stats';
import { compact, hitRate, type StatsRange, summarize } from './aggregate';
import { ActivityCalendar, HourBars, SERIES, ShareBars, TokenChart } from './Charts';

const RANGES: StatsRange[] = ['today', '7d', '30d', 'all'];

function Panel({
  title,
  aside,
  className,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn('rounded-xl border bg-card p-5', className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function StatCard({
  label,
  value,
  sub,
  meter,
}: {
  label: string;
  value: string;
  sub?: string;
  meter?: number;
}) {
  return (
    <div className="rounded-xl border bg-card px-5 py-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {meter !== undefined && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-foreground/[0.08]">
          <div
            className="h-full rounded-full bg-foreground/80"
            style={{ width: `${Math.min(100, meter * 100)}%` }}
          />
        </div>
      )}
      {sub && <div className="mt-1.5 text-xs text-muted-foreground tabular-nums">{sub}</div>}
    </div>
  );
}

/** Usage of the chats in this app: tokens, cache hits, activity, by model and project. */
export default function StatsView() {
  const { t } = useTranslation('features');
  const [range, setRange] = useState<StatsRange>('7d');
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStats(await getUsageStats());
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => (stats ? summarize(stats, range) : null), [stats, range]);

  const duration = (ms: number | null) => {
    if (ms === null) return '—';
    const s = Math.round(ms / 1000);
    return s < 60
      ? t('stats.durSec', { s })
      : t('stats.durMinSec', { m: Math.floor(s / 60), s: s % 60 });
  };

  const totals = summary?.totals;
  const hit = totals ? hitRate(totals.cached, totals.input) : 0;

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="mx-auto max-w-5xl space-y-5 px-8 pt-8 pb-12">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{t('stats.title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('stats.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border bg-muted/40 p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={cn(
                    'rounded-md px-3 py-1 text-xs transition-colors',
                    range === r
                      ? 'bg-background font-medium text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t(`stats.range.${r}`)}
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title={t('stats.refresh')}
              aria-label={t('stats.refresh')}
              onClick={() => load()}
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
          </div>
        </header>

        {error && !stats && (
          <div className="rounded-xl border px-5 py-8 text-center text-sm text-muted-foreground">
            {t('stats.loadFailed', { error })}
          </div>
        )}

        {summary && totals && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label={t('stats.chats')}
                value={String(totals.chats)}
                sub={t('stats.turnsSub', { count: totals.turns })}
              />
              <StatCard
                label={t('stats.avgTurn')}
                value={duration(totals.avgTurnMs)}
                sub={t('stats.avgTurnSub')}
              />
              <StatCard
                label={t('stats.tokens')}
                value={compact(totals.input + totals.output)}
                sub={t('stats.tokensSub', {
                  input: compact(totals.input),
                  output: compact(totals.output),
                })}
              />
              <StatCard
                label={t('stats.cacheHit')}
                value={`${Math.round(hit * 100)}%`}
                meter={hit}
                sub={t('stats.cacheSub', { cached: compact(totals.cached) })}
              />
            </div>

            <Panel
              title={range === 'today' ? t('stats.tokensByHour') : t('stats.tokensByDay')}
              aside={
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {SERIES.map((s) => (
                    <span key={s.key} className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-sm"
                        style={{ backgroundColor: 'var(--foreground)', opacity: s.opacity }}
                      />
                      {t(`stats.series.${s.key}`)}
                    </span>
                  ))}
                </div>
              }
            >
              <TokenChart buckets={summary.buckets} />
            </Panel>

            <div className="grid gap-3 lg:grid-cols-3">
              <Panel title={t('stats.calendar')} className="lg:col-span-2">
                <ActivityCalendar calendar={summary.calendar} />
              </Panel>
              <Panel title={t('stats.hours')}>
                <HourBars hours={summary.hours} />
              </Panel>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <Panel title={t('stats.byModel')}>
                <ShareBars rows={summary.byModel} emptyLabel="?" />
              </Panel>
              <Panel title={t('stats.byProject')}>
                <ShareBars rows={summary.byProject} emptyLabel={t('stats.ungrouped')} />
              </Panel>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
