import { cn } from 'cn';
import { Fragment, type ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { WorkSummary } from '@/components/ai-elements/WorkSummary';
import { useCodexStore } from '@/components/codex/stores';
import { THREAD_COLUMN, ThreadScroller } from '@/components/common';
import { Button } from '@/components/ui/button';
import { MessageScrollerItem } from '@/components/ui/message-scroller';
import type { HistoryEntry } from '@/services/apiAdapt/history';
import { EventItem } from '../items';
import { ApprovalItem } from '../items/ApprovalItem';
import { ElicitationItem } from '../items/ElicitationItem';
import { PermissionsItem } from '../items/PermissionsItem';
import { RequestUserInputItem } from '../items/RequestUserInputItem';
import { formatStepDuration } from '../items/stepItems';
import { ThreadStepChain } from '../items/ThreadStepChain';
import { historyEventKey, useThreadHistory } from '../stores/threadHistory';
import { WorkingIndicator } from '../widget/WorkingIndicator';
import { codexUserTurns, deriveRenderItems, type RenderItem } from './deriveRenderItems';
import { HistoryRecord } from './HistoryRecord';
import { useThreadHistoryView } from './useThreadHistoryView';

interface CodexThreadProps {
  /**
   * When provided, renders this specific thread instead of the globally
   * active thread from useCodexStore.
   */
  threadId?: string;
}

export function CodexThread({ threadId }: CodexThreadProps = {}) {
  const { t } = useTranslation('thread');
  const { currentThreadId, events, turnTimingMap, retryNoticeMap, pendingReviewMap } =
    useCodexStore();

  // Use the explicitly provided threadId when embedded, otherwise fall back
  // to the globally active thread.
  const activeThreadId = threadId ?? currentThreadId;

  // Get events for the active thread
  const { history, currentThreadEvents, loadOlder, loadNewer } = useThreadHistoryView(
    activeThreadId,
    activeThreadId ? events[activeThreadId] : undefined
  );
  const turnTiming = activeThreadId ? turnTimingMap[activeThreadId] : undefined;
  const retryNotice = activeThreadId ? retryNoticeMap[activeThreadId] : undefined;
  const pendingReviews = useMemo(
    () => Object.values((activeThreadId && pendingReviewMap[activeThreadId]) || {}),
    [activeThreadId, pendingReviewMap]
  );

  const renderItems = useMemo(() => deriveRenderItems(currentThreadEvents), [currentThreadEvents]);
  const turns = useMemo(() => codexUserTurns(renderItems), [renderItems]);
  const anchorIds = new Set(turns.map((turn) => turn.id));

  const seenAgentMessageDeltaItemIds = new Set<string>();

  const renderAll = (items: RenderItem[]) => {
    const rendered: Array<{ key: string; content: ReactNode }> = [];
    for (const item of items) {
      if (item.kind === 'chain') {
        rendered.push({ key: item.key, content: <ThreadStepChain steps={item.steps} /> });
        continue;
      }

      if (item.kind === 'turn') {
        const duration =
          item.durationMs !== null && item.durationMs > 0
            ? formatStepDuration(item.durationMs)
            : null;
        const steps = item.stepCount > 0 ? t('items.stepCount', { count: item.stepCount }) : '';
        rendered.push({
          key: item.key,
          content: (
            <WorkSummary
              title={
                duration
                  ? t('items.workedFor', { duration })
                  : item.stepCount > 0
                    ? t('items.stepsDone', { count: item.stepCount })
                    : t('worked')
              }
              description={duration ? steps : undefined}
            >
              {renderAll(item.items).map((entry) => (
                <Fragment key={entry.key}>{entry.content}</Fragment>
              ))}
            </WorkSummary>
          ),
        });
        continue;
      }

      const { event, index } = item;
      const preview = (event.params as { historyPreview?: HistoryEntry }).historyPreview;

      if (event.method === 'item/agentMessage/delta') {
        seenAgentMessageDeltaItemIds.add(
          JSON.stringify([event.params.turnId, event.params.itemId])
        );
      }

      if (event.method === 'item/completed') {
        const completedItem = event.params.item;
        if (
          completedItem.type === 'agentMessage' &&
          seenAgentMessageDeltaItemIds.has(JSON.stringify([event.params.turnId, completedItem.id]))
        ) {
          continue;
        }
      }

      rendered.push({
        key: historyEventKey(event, index),
        content:
          event.method === 'item/completed' && activeThreadId && preview ? (
            <HistoryRecord entry={preview} threadId={activeThreadId} />
          ) : (
            <EventItem event={event} context={{ events: currentThreadEvents, eventIndex: index }} />
          ),
      });
    }
    return rendered;
  };

  const renderedEvents = renderAll(renderItems);

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full">
      <ThreadScroller
        manualScroll
        key={activeThreadId}
        turns={turns}
        className="flex-1"
        contentClassName="thread-surface"
        onLoadOlder={loadOlder}
        onLoadNewer={loadNewer}
        historyLoading={history?.loading}
        historyError={history?.error}
        historyVersion={history?.pages}
      >
        {renderedEvents.map((entry) => (
          <MessageScrollerItem
            style={{ contentVisibility: 'visible', containIntrinsicSize: 'none' }}
            key={entry.key}
            messageId={entry.key}
            scrollAnchor={anchorIds.has(entry.key)}
          >
            {entry.content}
          </MessageScrollerItem>
        ))}

        <WorkingIndicator
          turnTiming={turnTiming}
          retryNotice={retryNotice}
          pendingReviews={pendingReviews}
        />
        <RequestUserInputItem currentThreadId={activeThreadId} />
        <ElicitationItem currentThreadId={activeThreadId} />
        <PermissionsItem currentThreadId={activeThreadId} />
      </ThreadScroller>
      <div className={cn(THREAD_COLUMN, 'pb-3 empty:hidden')}>
        {(history?.start ?? 0) > 0 && activeThreadId && (
          <div className="flex justify-center pb-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => useThreadHistory.getState().latest(activeThreadId)}
            >
              {t('history.latest')}
            </Button>
          </div>
        )}
        <ApprovalItem threadId={activeThreadId} />
      </div>
    </div>
  );
}
