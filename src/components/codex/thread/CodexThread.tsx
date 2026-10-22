import { cn } from 'cn';
import { Fragment, type ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { WorkSummary } from '@/components/ai-elements/WorkSummary';
import { useCodexStore } from '@/components/codex/stores';
import { THREAD_COLUMN, ThreadScroller } from '@/components/common';
import { MessageScrollerItem } from '@/components/ui/message-scroller';
import { EventItem } from '../items';
import { ApprovalItem } from '../items/ApprovalItem';
import { ElicitationItem } from '../items/ElicitationItem';
import { PermissionsItem } from '../items/PermissionsItem';
import { RequestUserInputItem } from '../items/RequestUserInputItem';
import { formatStepDuration } from '../items/stepItems';
import { ThreadStepChain } from '../items/ThreadStepChain';
import { WorkingIndicator } from '../widget/WorkingIndicator';
import { codexUserTurns, deriveRenderItems, type RenderItem } from './deriveRenderItems';

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
  const currentThreadEvents = activeThreadId ? events[activeThreadId] || [] : [];
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

      if (event.method === 'item/agentMessage/delta') {
        seenAgentMessageDeltaItemIds.add(event.params.itemId);
      }

      if (event.method === 'item/completed') {
        const completedItem = event.params.item;
        if (
          completedItem.type === 'agentMessage' &&
          seenAgentMessageDeltaItemIds.has(completedItem.id)
        ) {
          continue;
        }
      }

      rendered.push({
        key: `event-${index}`,
        content: (
          <EventItem event={event} context={{ events: currentThreadEvents, eventIndex: index }} />
        ),
      });
    }
    return rendered;
  };

  const renderedEvents = renderAll(renderItems);

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full">
      <ThreadScroller turns={turns} className="flex-1" contentClassName="thread-surface">
        {renderedEvents.map((entry) => (
          <MessageScrollerItem
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
        <ApprovalItem threadId={activeThreadId} />
      </div>
    </div>
  );
}
