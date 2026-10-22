import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cn } from '@/lib/utils';
import { type Bucket, compact, dayKey, hitRate, type Share } from './aggregate';

// One ink in three strengths, so the page stays monochrome in both themes.
const INK = 'var(--foreground)';
export const SERIES = [
  { key: 'cached', opacity: 0.14 },
  { key: 'uncached', opacity: 0.38 },
  { key: 'output', opacity: 0.85 },
] as const;

function TokenTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { payload: Bucket }[];
  label?: string;
}) {
  const { t } = useTranslation('features');
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  const input = b.cached + b.uncached;
  return (
    <div className="min-w-40 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1.5 font-medium">{label}</div>
      {SERIES.map((s) => (
        <div key={s.key} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span
              className="h-2 w-2 rounded-sm"
              style={{ backgroundColor: INK, opacity: s.opacity }}
            />
            {t(`stats.series.${s.key}`)}
          </span>
          <span className="tabular-nums">{compact(b[s.key])}</span>
        </div>
      ))}
      <div className="mt-1.5 flex justify-between gap-4 border-t pt-1.5 text-muted-foreground">
        <span>{t('stats.hitRate')}</span>
        <span className="tabular-nums">{Math.round(hitRate(b.cached, input) * 100)}%</span>
      </div>
    </div>
  );
}

/** Stacked bars: cached input, uncached input, output. */
export function TokenChart({ buckets }: { buckets: Bucket[] }) {
  const interval = buckets.length > 16 ? Math.ceil(buckets.length / 8) - 1 : 0;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={buckets}
        margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
        barCategoryGap="22%"
      >
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          interval={interval}
          tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
        />
        <YAxis
          width={44}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => compact(v)}
          tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
        />
        <Tooltip
          cursor={{ fill: 'var(--foreground)', fillOpacity: 0.04 }}
          content={<TokenTooltip />}
        />
        {SERIES.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            stackId="tokens"
            fill={INK}
            fillOpacity={s.opacity}
            radius={i === SERIES.length - 1 ? [3, 3, 0, 0] : 0}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

const LEVELS = [
  'bg-foreground/[0.06]',
  'bg-foreground/20',
  'bg-foreground/40',
  'bg-foreground/65',
  'bg-foreground/90',
];

/** GitHub-style calendar of turns per day over the last 26 weeks. */
export function ActivityCalendar({
  calendar,
  now = Date.now(),
}: {
  calendar: Map<string, number>;
  now?: number;
}) {
  const { t, i18n } = useTranslation('features');
  const weeks = 26;
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  // Columns are weeks starting on Monday; the last column holds today.
  const lastMonday = new Date(end);
  lastMonday.setDate(end.getDate() - ((end.getDay() + 6) % 7));
  const max = Math.max(1, ...calendar.values());
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  const monthFmt = new Intl.DateTimeFormat(i18n.language, { month: 'short' });

  const columns = Array.from({ length: weeks }, (_, w) => {
    const monday = new Date(lastMonday);
    monday.setDate(lastMonday.getDate() - (weeks - 1 - w) * 7);
    return Array.from({ length: 7 }, (_, d) => {
      const day = new Date(monday);
      day.setDate(monday.getDate() + d);
      return day;
    });
  });

  // A month is labelled on the first week that starts in it; the first column only when the next
  // label is far enough away not to collide with it.
  const month = (w: number) => columns[w][0].getMonth();
  const showMonth = (w: number) =>
    w === 0 ? month(1) === month(0) && month(2) === month(0) : month(w) !== month(w - 1);
  const weekdayFmt = new Intl.DateTimeFormat(i18n.language, { weekday: 'narrow' });
  const grid = { gridTemplateColumns: `1.25rem repeat(${weeks}, minmax(0, 1fr))` };

  return (
    <div className="flex flex-col gap-1">
      <div className="grid gap-[3px] text-[10px] text-muted-foreground" style={grid}>
        <div />
        {columns.map((days, w) => (
          <div key={dayKey(days[0].getTime())} className="overflow-visible whitespace-nowrap">
            {showMonth(w) ? monthFmt.format(days[0]) : ''}
          </div>
        ))}
      </div>
      <div className="grid gap-[3px]" style={grid}>
        <div className="grid grid-rows-7 gap-[3px] text-[10px] text-muted-foreground">
          {columns[0].map((day, d) => (
            <div key={day.getDay()} className="flex items-center leading-none">
              {d % 2 === 0 ? weekdayFmt.format(day) : ''}
            </div>
          ))}
        </div>
        {columns.map((days) => (
          <div key={dayKey(days[0].getTime())} className="grid grid-rows-7 gap-[3px]">
            {days.map((day) => {
              const key = dayKey(day.getTime());
              const n = calendar.get(key) ?? 0;
              const future = day.getTime() > end.getTime();
              return (
                <div
                  key={key}
                  title={future ? undefined : t('stats.calendarTip', { date: key, count: n })}
                  className={cn(
                    'aspect-square w-full rounded-[3px]',
                    future ? 'opacity-0' : LEVELS[level(n)]
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
        {t('stats.less')}
        {LEVELS.map((c) => (
          <div key={c} className={cn('h-[9px] w-[9px] rounded-[2px]', c)} />
        ))}
        {t('stats.more')}
      </div>
    </div>
  );
}

/** Turns per hour of day as 24 thin columns. */
export function HourBars({ hours }: { hours: number[] }) {
  const { t } = useTranslation('features');
  const max = Math.max(1, ...hours);
  const peak = hours.indexOf(Math.max(...hours));
  return (
    <div>
      <div className="flex h-24 items-end gap-[3px]">
        {hours.map((n, h) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: the index is the hour
            key={h}
            title={t('stats.hourTip', { hour: h, count: n })}
            className={cn(
              'flex-1 rounded-t-[2px]',
              n === 0 ? 'bg-foreground/[0.06]' : 'bg-foreground/70'
            )}
            style={{
              height: `${Math.max(4, (n / max) * 100)}%`,
              opacity: n === 0 ? 1 : 0.35 + (n / max) * 0.65,
            }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>0</span>
        <span>6</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>
      {hours.some((n) => n > 0) && (
        <div className="mt-3 text-xs text-muted-foreground">
          {t('stats.peakHour', { from: peak, to: (peak + 1) % 24 })}
        </div>
      )}
    </div>
  );
}

/** Ranked horizontal bars with a share of the total. */
export function ShareBars({ rows, emptyLabel }: { rows: Share[]; emptyLabel: string }) {
  const { t } = useTranslation('features');
  const total = rows.reduce((sum, r) => sum + r.tokens, 0);
  const top = rows.slice(0, 6);
  if (top.length === 0) {
    return <div className="py-6 text-center text-xs text-muted-foreground">{t('stats.empty')}</div>;
  }
  return (
    <div className="space-y-3.5">
      {top.map((r) => {
        const share = total > 0 ? r.tokens / total : 0;
        return (
          <div key={r.key}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">
                {r.label || emptyLabel}
                {r.sublabel && (
                  <span className="ml-1.5 text-xs text-muted-foreground">{r.sublabel}</span>
                )}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground text-xs">
                {compact(r.tokens)} · {Math.round(share * 100)}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]">
              <div
                className="h-full rounded-full bg-foreground/75"
                style={{ width: `${Math.max(1.5, share * 100)}%` }}
              />
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {t('stats.shareMeta', {
                count: r.chats,
                hit: Math.round(hitRate(r.cached, r.input) * 100),
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
