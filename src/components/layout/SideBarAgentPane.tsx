import { ListFilter, Package2, SquarePen, Timer } from 'lucide-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNewThread, useThreadList } from '@/components/codex/hooks';
import { NewAgentButton } from '@/components/common/NewAgentButton';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSidebar } from '@/components/ui/sidebar';
import { useLayoutStore } from '@/stores';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { SideBarAddProjectButton } from './SideBarAddProjectButton';
import { SideBarCodexTab } from './SideBarTab';

// Shared class for nav buttons (Automations / Marketplace)
const navBtnBase = 'justify-start gap-2 rounded-md border px-2.5';
const navBtnActive = 'border-border bg-accent/70 text-accent-foreground';
const navBtnInactive = 'border-transparent hover:border-border/60';
const navBtnCls = (active: boolean) => `${navBtnBase} ${active ? navBtnActive : navBtnInactive}`;

/** Always-visible navigation actions. */
export function SideBarAgentHeader() {
  const { t } = useTranslation('sidebar');
  const { setView, view } = useLayoutStore();

  return (
    <div className="flex flex-col">
      <NewAgentButton showLabel />
      <Button
        variant="ghost"
        size="sm"
        className={navBtnCls(view === 'plugins')}
        onClick={() => setView('plugins')}
      >
        <Package2 className="h-4 w-4" />
        {t('plugins')}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className={navBtnCls(view === 'automations')}
        onClick={() => setView('automations')}
      >
        <Timer className="h-4 w-4" />
        {t('automations')}
      </Button>
    </div>
  );
}

/** Project-specific sorting and creation actions. */
export function SideBarProjectActions() {
  const { t } = useTranslation('app');
  const { open: isSidebarOpen } = useSidebar();
  const { sortKey, setSortKey } = useThreadList({ enabled: isSidebarOpen });
  const { sidebarView, setSidebarView } = useLayoutStore();
  const { handleNewThread } = useNewThread();
  const startUngroupedChat = () => {
    const { cwd, setCwd } = useWorkspaceStore.getState();
    if (cwd !== null) setCwd(null);
    void handleNewThread();
  };
  const currentThreadSortLabel =
    sortKey === 'created_at' ? t('sidebar.sortCreated') : t('sidebar.sortUpdated');

  return (
    <div className="flex items-center justify-end gap-0.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title={t('sidebar.filterThreads', { current: currentThreadSortLabel })}
          >
            <ListFilter className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            {t('sidebar.organize')}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={sidebarView}
            onValueChange={(v) => setSidebarView(v as 'projects' | 'list')}
          >
            <DropdownMenuRadioItem value="projects">{t('sidebar.byProject')}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="list">{t('sidebar.oneList')}</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={sortKey}
            onValueChange={(v) => setSortKey(v as 'created_at' | 'updated_at')}
          >
            <DropdownMenuRadioItem value="created_at">
              {t('sidebar.sortByCreated')}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="updated_at">
              {t('sidebar.sortByUpdated')}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {sidebarView === 'list' ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title={t('sidebar.newChat')}
          aria-label={t('sidebar.newChat')}
          onClick={startUngroupedChat}
        >
          <SquarePen className="h-4 w-4" />
        </Button>
      ) : (
        <SideBarAddProjectButton />
      )}
    </div>
  );
}

/** The project list of Codex threads. */
export function SideBarAgentList() {
  const { cwd, setCwd } = useWorkspaceStore();
  const { handleNewThread } = useNewThread();

  const handleCreateNewThreadForProject = useCallback(
    (project: string | null) => {
      if (project !== cwd) setCwd(project);
      void handleNewThread();
    },
    [cwd, handleNewThread, setCwd]
  );

  return <SideBarCodexTab onCreateNewThread={handleCreateNewThreadForProject} />;
}
