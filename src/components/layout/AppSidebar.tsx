import { Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ThreadList } from '@/components/codex/thread/ThreadList';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { useTrafficLightConfig } from '@/hooks';
import { useLayoutStore } from '@/stores';
import { SessionManagerDialog } from '../common/SessionManagerDialog';
import { SideBarAgentHeader, SideBarAgentList, SideBarProjectActions } from './SideBarAgentPane';
import { SideBarPinnedList } from './SideBarPinnedList';
import { SideBarSection } from './SideBarSection';
import { UserInfo } from './UserInfo';

export function AppSideBar() {
  const { t } = useTranslation('app');
  const { open: isSidebarOpen } = useSidebar();
  const { isMacos } = useTrafficLightConfig(isSidebarOpen);
  const [sessionManagerOpen, setSessionManagerOpen] = useState(false);
  // Local-only build: the project list is the main thing here, so it starts open.
  const [projectsOpen, setProjectsOpen] = useState(true);
  const sidebarView = useLayoutStore((s) => s.sidebarView);

  return (
    <>
      <Sidebar className="border-r border-sidebar-border bg-zinc-100/95 dark:bg-zinc-900/95">
        <SidebarHeader className="gap-1 p-1">
          {/* Header row: toggle */}
          <div
            className={`flex items-center gap-2 ${isMacos ? 'pl-20' : 'pl-2'}`}
            data-tauri-drag-region
          >
            <SidebarTrigger className="h-7 w-7" />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title={t('layout.manageSessions')}
              onClick={() => setSessionManagerOpen(true)}
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </SidebarHeader>

        <SidebarContent className="min-w-0 max-w-full overflow-x-hidden gap-0 px-0">
          <SideBarAgentHeader />

          <SideBarPinnedList />

          <SideBarSection
            icon={null}
            title={sidebarView === 'list' ? t('layout.recents') : t('layout.projects')}
            open={projectsOpen}
            onOpenChange={setProjectsOpen}
            actions={<SideBarProjectActions />}
          >
            {sidebarView === 'list' ? (
              <div className="px-2 pb-2">
                <ThreadList all />
              </div>
            ) : (
              <SideBarAgentList />
            )}
          </SideBarSection>
        </SidebarContent>

        <SidebarFooter className="flex-row items-center p-0 min-w-0 max-w-full overflow-x-hidden">
          <div className="flex-1 min-w-0 overflow-hidden">
            <UserInfo />
          </div>
          {/* Manual updates are in Settings; never check for updates from the sidebar. */}
        </SidebarFooter>
      </Sidebar>

      <SessionManagerDialog open={sessionManagerOpen} onOpenChange={setSessionManagerOpen} />
    </>
  );
}
