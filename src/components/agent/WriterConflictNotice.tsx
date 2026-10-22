import { useTranslation } from 'react-i18next';
import { useCodexStore } from '@/components/codex/stores';
import {
  isWriterConflict,
  useWriterConflictStore,
} from '@/components/codex/stores/useWriterConflictStore';
import { Button } from '@/components/ui/button';
import { codexService } from '@/services/codexService';
import { useAgentCenterStore } from '@/stores';

// Re-attach to the thread. If it succeeds, send the draft that was refused.
async function retryLockedThread() {
  const store = useWriterConflictStore.getState();
  const threadId = useCodexStore.getState().currentThreadId;
  const draft = threadId ? store.locked[threadId]?.draft : null;
  if (!threadId) return;
  store.setRecovering(true);
  try {
    // A still-owned thread comes back locked without throwing.
    await codexService.threadResume(threadId);
    if (useWriterConflictStore.getState().locked[threadId]) return;
    if (!draft) return;
    await codexService.turnStart(threadId, draft.text, draft.images);
  } catch (error) {
    console.error(error);
    if (isWriterConflict(error)) {
      useWriterConflictStore.getState().lock(threadId, draft);
    } else if (draft) {
      // postJson already shows the request error; just give the draft back.
      useWriterConflictStore.getState().setHandoff(draft);
    }
  } finally {
    useWriterConflictStore.getState().setRecovering(false);
  }
}

// Forking copies the history into a new thread this client owns. A refused
// draft goes back into the composer there, so nothing is sent without the user.
async function forkLockedThread() {
  const store = useWriterConflictStore.getState();
  const threadId = useCodexStore.getState().currentThreadId;
  if (!threadId) return;
  const draft = store.locked[threadId]?.draft ?? null;
  store.setRecovering(true);
  try {
    const thread = await codexService.threadFork(threadId);
    const { addAgentCard, setCurrentAgentCardId } = useAgentCenterStore.getState();
    addAgentCard({ kind: 'codex', id: thread.id, preview: thread.preview, cwd: thread.cwd });
    setCurrentAgentCardId(thread.id);
    if (draft) useWriterConflictStore.getState().setHandoff(draft);
    await codexService.setCurrentThread(thread.id);
  } catch (error) {
    console.error(error);
  } finally {
    useWriterConflictStore.getState().setRecovering(false);
  }
}

/** Replaces the composer while another client owns the thread. */
export function WriterConflictNotice() {
  const { t } = useTranslation('chat');
  const recovering = useWriterConflictStore((s) => s.recovering);
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-xl border bg-muted/40 p-3"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium">{t('writerConflict.title')}</p>
        <p className="text-sm text-muted-foreground">{t('writerConflict.description')}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={recovering}
          onClick={() => void retryLockedThread()}
        >
          {t('writerConflict.retry')}
        </Button>
        <Button size="sm" disabled={recovering} onClick={() => void forkLockedThread()}>
          {t('writerConflict.fork')}
        </Button>
      </div>
    </div>
  );
}
