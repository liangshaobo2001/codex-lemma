import { useMemo } from 'react';
import type { ServerNotification } from '@/bindings';
import { codexService } from '@/services/codexService';
import {
  historyEvents,
  LIVE_EVENT_LIMIT,
  mergeHistoryEvents,
  useThreadHistory,
} from '../stores/threadHistory';

export function useThreadHistoryView(
  activeThreadId: string | null,
  liveEvents: ServerNotification[] | undefined
) {
  const history = useThreadHistory((s) => (activeThreadId ? s.threads[activeThreadId] : undefined));
  const currentThreadEvents = useMemo(() => {
    const live = liveEvents ?? [];
    if (!history?.pages.length || !activeThreadId) return live.slice(-LIVE_EVENT_LIMIT);
    const older = [...history.pages]
      .reverse()
      .reduce(
        (result, p) => mergeHistoryEvents(result, historyEvents(p, activeThreadId)),
        [] as typeof live
      );
    return history.start === 0 ? mergeHistoryEvents(older, live) : older;
  }, [history?.pages, history?.start, liveEvents, activeThreadId]);
  const olderCursor = history?.pages[history.pages.length - 1]?.nextCursor ?? null;
  const loadOlder = activeThreadId
    ? olderCursor
      ? () => useThreadHistory.getState().older(activeThreadId)
      : history?.error && !history.pages.length
        ? () => codexService.threadResume(activeThreadId)
        : undefined
    : undefined;
  const loadNewer =
    activeThreadId && (history?.start ?? 0) > 0
      ? () => useThreadHistory.getState().newer(activeThreadId)
      : undefined;
  return { history, currentThreadEvents, loadOlder, loadNewer };
}
