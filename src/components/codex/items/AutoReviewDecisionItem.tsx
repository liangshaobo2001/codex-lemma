import { Check, ChevronRight, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ItemGuardianApprovalReviewCompletedNotification } from '@/bindings/v2';
import { useCodexStore } from '@/components/codex/stores';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { threadApproveGuardianDeniedAction } from '@/services/apiAdapt';
import { deniedReviewEvent, reviewActionSummary } from './autoReview';

/**
 * A denied or timed-out auto-review: one line, with the reviewer's rationale on demand.
 * A denial can be approved once, like the Codex CLI's `/approve`.
 */
export function AutoReviewDecisionItem({
  params,
}: {
  params: ItemGuardianApprovalReviewCompletedNotification;
}) {
  const { t } = useTranslation('thread');
  const approved = useCodexStore((state) => !!state.approvedDenialIds[params.reviewId]);
  const markDenialApproved = useCodexStore((state) => state.markDenialApproved);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { review, action } = params;
  const label = review.status === 'timedOut' ? t('autoReview.timedOut') : t('autoReview.denied');
  const summary = reviewActionSummary(action, t);
  const rationale = review.rationale?.trim();
  const retryEvent = deniedReviewEvent(params);

  const approveOnce = async () => {
    if (!retryEvent) return;
    setSending(true);
    setError(null);
    try {
      await threadApproveGuardianDeniedAction({ threadId: params.threadId, event: retryEvent });
      markDenialApproved(params.reviewId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const line = (
    <span className="flex min-w-0 items-center gap-1.5">
      <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
      <span className="shrink-0 font-medium text-foreground">{label}</span>
      <code className="truncate">{summary}</code>
    </span>
  );

  const retry = approved ? (
    <span className="flex shrink-0 items-center gap-1">
      <Check className="h-3.5 w-3.5" />
      {t('autoReview.approvedOnce')}
    </span>
  ) : retryEvent ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 shrink-0 px-2 text-xs"
          disabled={sending}
          onClick={approveOnce}
        >
          {t('autoReview.approveOnce')}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t('autoReview.approveOnceHint')}</TooltipContent>
    </Tooltip>
  ) : null;

  return (
    <Collapsible className="text-xs text-muted-foreground">
      <div className="flex min-w-0 items-center justify-between gap-2">
        {rationale ? (
          <CollapsibleTrigger className="group flex min-w-0 items-center gap-1 text-left">
            {line}
            <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
          </CollapsibleTrigger>
        ) : (
          line
        )}
        {retry}
      </div>
      {error && <p className="mt-1 pl-5 text-red-600 dark:text-red-400">{error}</p>}
      {rationale && (
        <CollapsibleContent className="mt-1 pl-5 whitespace-pre-wrap">
          {rationale}
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}
