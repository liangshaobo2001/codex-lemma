// Pinned threads across all projects, shown as a collapsible sidebar section.
import { Pin, PinOff } from 'lucide-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { codexService } from '@/services/codexService';
import { useAgentCenterStore, useLayoutStore } from '@/stores';
import { type PinnedItem, usePinStore } from '@/stores/usePinStore';
import { useThreadVisibilityStore } from '@/stores/useThreadVisibilityStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { getFilename } from '@/utils/getFilename';
import { SideBarSection } from './SideBarSection';

export function SideBarPinnedList() {
  const { t } = useTranslation('app');
  // Pins of other agents (Claude Code) from older builds are left alone and not shown.
  const visibility = useThreadVisibilityStore((s) => s.entries);
  const pinned = usePinStore((s) => s.pinned).filter(
    (item) => item.kind === 'codex' && !visibility[item.id]?.hidden
  );
  const unpin = usePinStore((s) => s.unpin);
  const { setCwd } = useWorkspaceStore();
  const { setView } = useLayoutStore();
  const open = useLayoutStore((s) => s.isPinnedListOpen);
  const setOpen = useLayoutStore((s) => s.setPinnedListOpen);
  const { addAgentCard, setCurrentAgentCardId } = useAgentCenterStore();

  const handleOpen = useCallback(
    async (item: PinnedItem) => {
      setCwd(item.cwd);
      addAgentCard({ kind: item.kind, id: item.id, preview: item.title, cwd: item.cwd });
      setCurrentAgentCardId(item.id);
      setView('agent');
      await codexService.setCurrentThread(item.id);
    },
    [addAgentCard, setCurrentAgentCardId, setCwd, setView]
  );

  if (pinned.length === 0) return null;

  return (
    <SideBarSection icon={<Pin />} title={t('sidebar.pinned')} open={open} onOpenChange={setOpen}>
      {pinned.map((item) => (
        <div
          key={item.id}
          role="button"
          tabIndex={0}
          onClick={() => void handleOpen(item)}
          title={`${item.title}\n${item.cwd}`}
          className="group flex w-full items-center gap-2 rounded-md px-2.5 py-1 text-left hover:bg-accent/50"
        >
          <span className="min-w-0 flex-1 truncate text-xs">
            {item.title || t('common.untitled')}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground group-hover:hidden">
            {getFilename(item.cwd)}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            title={t('sidebar.unpin')}
            className="hidden shrink-0 group-hover:inline-flex"
            onClick={(e) => {
              e.stopPropagation();
              unpin(item.id);
            }}
          >
            <PinOff />
          </Button>
        </div>
      ))}
    </SideBarSection>
  );
}
