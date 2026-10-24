import { useEffect } from 'react';
import { useCodexStore, useThreadReadStateStore } from '@/components/codex/stores';
import { toast } from '@/components/ui/use-toast';
import { isMacPlatform, resolveShortcut, type ShortcutId } from '@/hooks/keymap';
import { i18n } from '@/lib/i18n';
import { archiveThread } from '@/services/apiAdapt';
import { setThreadReadState } from '@/services/threadReadState';
import { useLayoutStore } from '@/stores';

/** The Codex thread the user is looking at. */
function currentCodexThreadId(): string | null {
  if (useLayoutStore.getState().view !== 'agent') return null;
  return useCodexStore.getState().currentThreadId;
}

async function archiveCurrentThread() {
  const threadId = currentCodexThreadId();
  if (!threadId) return;
  try {
    await archiveThread(threadId);
  } catch (err) {
    toast.error(i18n.t('app:errors.archiveFailed'), { description: String(err) });
    return;
  }
}

function toggleTerminal() {
  const layout = useLayoutStore.getState();
  // The right panel only exists next to the agent thread.
  if (layout.view !== 'agent') return;
  if (layout.isRightPanelOpen && layout.activeRightPanelTab === 'terminal') {
    layout.setRightPanelOpen(false);
    return;
  }
  layout.setActiveRightPanelTab('terminal');
  layout.setRightPanelOpen(true);
}

const ACTIONS: Partial<Record<ShortcutId, () => void>> = {
  settings: () => useLayoutStore.getState().setView('settings'),
  toggleTerminal,
  archiveChat: () => void archiveCurrentThread(),
  markUnread: () => {
    const threadId = currentCodexThreadId();
    if (!threadId) return;
    const state = useThreadReadStateStore.getState().states[threadId];
    // Toggle, like the sidebar menu item.
    void setThreadReadState(threadId, state?.firstUnread ? 'read' : 'unread');
  },
};

/** Single window-level key listener for every shortcut in the central keymap. */
export function useGlobalShortcuts() {
  useEffect(() => {
    const isMac = isMacPlatform();
    const onKeyDown = (event: KeyboardEvent) => {
      const id = resolveShortcut(event, isMac);
      const action = id ? ACTIONS[id] : undefined;
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
