import type { TFunction } from 'i18next';
import { ArrowDown, ArrowUp, Play, X } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { QueuedSubmission, UserInput } from '@/bindings/v2';
import { useThreadQueueStore } from '@/components/codex/stores';
import { Button } from '@/components/ui/button';
import { i18n } from '@/lib/i18n';
import { codexService } from '@/services/codexService';

const EMPTY_QUEUE: QueuedSubmission[] = [];

function inputLabel(input: UserInput[], t: TFunction): string {
  const text = input
    .map((item) => (item.type === 'text' ? item.text.trim() : ''))
    .filter(Boolean)
    .join(' ');
  const attachments = input.filter((item) => item.type !== 'text').length;
  if (!text) {
    return attachments > 0
      ? t('queue.attachments', { count: attachments })
      : t('queue.emptyMessage');
  }
  return attachments > 0 ? `${text} (+${attachments})` : text;
}

function reportFailure(messageKey: string, error: unknown) {
  const reason = error instanceof Error ? error.message : String(error);
  toast.error(i18n.t(messageKey, { reason }));
}

interface QueuedMessagesProps {
  threadId: string | null;
  /** True while a turn is running; queued items then start on their own. */
  running: boolean;
}

/** Messages waiting on the app-server for the open thread. */
export function QueuedMessages({ threadId, running }: QueuedMessagesProps) {
  const { t } = useTranslation('chat');
  const items =
    useThreadQueueStore((s) => (threadId ? s.queues[threadId] : undefined)) ?? EMPTY_QUEUE;
  const refresh = useThreadQueueStore((s) => s.refresh);

  useEffect(() => {
    if (threadId) void refresh(threadId);
  }, [threadId, refresh]);

  if (!threadId || items.length === 0) return null;

  const move = async (index: number, offset: -1 | 1) => {
    const ids = items.map((item) => item.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + offset, 0, moved);
    try {
      await codexService.threadQueueReorder(threadId, ids);
    } catch (error) {
      reportFailure('chat:queue.reorderFailed', error);
    }
  };

  const remove = async (id: string) => {
    try {
      await codexService.threadQueueDelete(threadId, id);
    } catch (error) {
      reportFailure('chat:queue.removeFailed', error);
    }
  };

  const sendNow = async (id: string) => {
    try {
      await codexService.threadQueueStart(threadId, id);
    } catch (error) {
      reportFailure('chat:queue.sendFailed', error);
    }
  };

  return (
    <ul aria-label={t('queue.label')} className="mb-1 space-y-0.5">
      {items.map((item, index) => {
        const label = inputLabel(item.input, t);
        return (
          <li
            key={item.id}
            className="flex items-center gap-1 rounded-md border bg-muted/30 px-2 py-0.5 text-xs"
          >
            <span className="min-w-0 flex-1 truncate" title={label}>
              {label}
            </span>
            {!running && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                aria-label={t('queue.sendNowLabel', { label })}
                title={t('queue.sendNow')}
                onClick={() => void sendNow(item.id)}
              >
                <Play className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              aria-label={t('queue.moveUpLabel', { label })}
              title={t('queue.moveUp')}
              disabled={index === 0}
              onClick={() => void move(index, -1)}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              aria-label={t('queue.moveDownLabel', { label })}
              title={t('queue.moveDown')}
              disabled={index === items.length - 1}
              onClick={() => void move(index, 1)}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              aria-label={t('queue.removeLabel', { label })}
              title={t('queue.remove')}
              onClick={() => void remove(item.id)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
