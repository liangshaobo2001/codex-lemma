import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GuardianApprovalReviewAction } from '@/bindings/v2';
import { fmtElapsed } from '@/components/agent/utils';
import type { TurnTiming } from '@/components/codex/stores/useCodexStore';
import { reviewActionSummary } from '../items/autoReview';

/**
 * "Working… 0:12" while the turn runs; a finished turn reports its time on its work summary.
 * While auto-reviews are deciding, it names what is being reviewed instead.
 */
export function WorkingIndicator({
  turnTiming,
  retryNotice,
  pendingReviews = [],
}: {
  turnTiming: TurnTiming | undefined;
  retryNotice?: string;
  pendingReviews?: GuardianApprovalReviewAction[];
}) {
  const { t } = useTranslation('thread');
  // Re-render only; elapsed is derived from startedAtMs, never stored.
  const [, setTick] = useState(0);
  const inProgress = turnTiming?.status === 'inProgress';

  useEffect(() => {
    if (!inProgress) return;

    const intervalId = setInterval(() => {
      setTick((t) => t + 1);
    }, 200);

    return () => clearInterval(intervalId);
  }, [inProgress]);

  const elapsed = inProgress && turnTiming ? Date.now() - turnTiming.startedAtMs : 0;

  if (!inProgress) return null;

  const reviewing =
    pendingReviews.length === 1
      ? t('autoReview.reviewing', { action: reviewActionSummary(pendingReviews[0], t) })
      : pendingReviews.length > 1
        ? t('autoReview.reviewingMany', { count: pendingReviews.length })
        : null;

  return (
    <div className="truncate text-sm text-muted-foreground animate-pulse">
      {reviewing ?? t('working')} {fmtElapsed(elapsed)}
      {retryNotice && (
        <span className="text-yellow-600 dark:text-yellow-400"> · {retryNotice}</span>
      )}
    </div>
  );
}
