import { useTranslation } from 'react-i18next';
import { getRunningTurnId } from '@/components/codex/stores';
import { usePendingSteers, type PendingSteer } from '@/components/codex/stores/usePendingSteers';
import { Button } from '@/components/ui/button';
import { MessageScrollerItem } from '@/components/ui/message-scroller';
import { codexService } from '@/services/codexService';
import { UserMessageItem } from './UserMessageItem';

export function PendingSteerMessages({ threadId }: { threadId: string | null }) {
  const { t } = useTranslation('chat');
  const items = usePendingSteers((state) => state.items);
  const retry = async (item: PendingSteer) => {
    const state = usePendingSteers.getState();
    if (!state.items.some((entry) => entry.id === item.id && entry.status === 'failed')) return;
    const text = item.content.filter((input) => input.type === 'text').map((input) => input.text).join('');
    const images = item.content.filter((input) => input.type === 'localImage').map((input) => input.path);
    const turnId = getRunningTurnId(item.threadId);
    state.update(item.id, 'sending');
    if (turnId) {
      state.remove(item.id);
      try { await codexService.turnSteer(item.threadId, turnId, text, images); } catch { /* The new pending entry owns the error. */ }
    } else {
      try {
        await codexService.turnStart(item.threadId, text, images);
        state.remove(item.id);
      } catch (error) {
        state.update(item.id, 'failed', error instanceof Error ? error.message : String(error));
      }
    }
  };
  return items.filter((item) => item.threadId === threadId).map((item) => (
    <MessageScrollerItem key={item.id} messageId={`pending-steer-${item.id}`}>
      <UserMessageItem content={item.content} />
      <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground" role={item.status === 'failed' ? 'alert' : 'status'}>
        <span>{t(item.status === 'sending' ? 'composer.steerSending' : item.status === 'accepted' ? 'composer.steerWaiting' : 'composer.steerFailed')}</span>
        {item.status === 'failed' && <>
          <span className="max-w-64 truncate" title={item.error}>{item.error}</span>
          <Button variant="ghost" size="sm" onClick={() => void retry(item)}>{t('composer.steerRetry')}</Button>
          <Button variant="ghost" size="sm" onClick={() => usePendingSteers.getState().remove(item.id)}>{t('composer.steerDismiss')}</Button>
        </>}
      </div>
    </MessageScrollerItem>
  ));
}
