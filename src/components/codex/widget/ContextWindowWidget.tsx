import { useTranslation } from 'react-i18next';
import { useCodexStore } from '@/components/codex/stores/useCodexStore';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const compact = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
      ? `${Math.round(n / 1000)}k`
      : `${n}`;

/**
 * Context ring next to the model name, as in the Codex app: a small grey ring that fills with the share of
 * the context window in use, and a hover tooltip with the numbers. "In use" is the last turn's total tokens
 * (what the next request carries), not the thread's cumulative total, which overstates it after a few turns.
 * Shown from the start of a thread (empty ring) so the layout does not jump when the first turn finishes.
 */
export function ContextWindowWidget() {
  const { t } = useTranslation('chat');
  const currentThreadId = useCodexStore((state) => state.currentThreadId);
  const tokenUsageMap = useCodexStore((state) => state.tokenUsageMap);
  const usage = currentThreadId ? tokenUsageMap[currentThreadId] : null;

  const used = usage?.last.totalTokens ?? 0;
  const windowSize = usage?.modelContextWindow ?? null;
  const percent =
    windowSize && windowSize > 0 ? Math.min(100, Math.round((used / windowSize) * 100)) : 0;

  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="-mr-2.5 flex h-6 w-6 items-center justify-center"
            role="img"
            aria-label={t('widgets.contextAria', { percent })}
          >
            <svg className="h-[18px] w-[18px] -rotate-90" viewBox="0 0 24 24" aria-hidden>
              <circle
                cx="12"
                cy="12"
                r={radius}
                className="stroke-muted-foreground/25"
                strokeWidth="3"
                fill="none"
              />
              {percent > 0 && (
                <circle
                  cx="12"
                  cy="12"
                  r={radius}
                  className="stroke-muted-foreground transition-all duration-300 ease-in-out"
                  strokeWidth="3"
                  fill="none"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                />
              )}
            </svg>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-center text-xs leading-relaxed">
          <div className="opacity-70">{t('widgets.contextTitle')}</div>
          {windowSize ? (
            <>
              <div>{t('widgets.contextPercent', { percent, left: 100 - percent })}</div>
              <div>
                {t('widgets.contextTokens', { used: compact(used), total: compact(windowSize) })}
              </div>
            </>
          ) : (
            <div>{t('widgets.contextEmpty')}</div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
