import { PanelRight, SquareTerminal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCodexStore } from '@/components/codex/stores';
import { NewAgentButton } from '@/components/common/NewAgentButton';
import { WINDOW_CONTROLS_WIDTH } from '@/components/layout/WindowControls';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { GitActions } from '@/features/git';
import { ProjectRunMenu } from '@/features/project-run/ProjectRunMenu';
import { useTrafficLightConfig } from '@/hooks';
import { isPhone, isWindows } from '@/hooks/runtime';
import { useLayoutStore, useWorkspaceStore } from '@/stores';
import { getFilename } from '@/utils/getFilename';
import { OpenAppMenu } from './openApp/OpenAppMenu';

export function AgentViewHeader() {
  const { t } = useTranslation('chat');
  const {
    isRightPanelOpen,
    toggleRightPanel,
    activeRightPanelTab,
    setActiveRightPanelTab,
    setRightPanelOpen,
  } = useLayoutStore();
  const isTerminalOpen = isRightPanelOpen && activeRightPanelTab === 'terminal';
  const { open: isSidebarOpen, openMobile, isMobile } = useSidebar();
  const { needsTrafficLightOffset } = useTrafficLightConfig(isSidebarOpen);
  const { currentThreadId } = useCodexStore();
  const { cwd } = useWorkspaceStore();
  // Show trigger when sidebar is closed; on mobile the Sheet is transient so always show
  const showTrigger = isMobile ? !openMobile : !isSidebarOpen;
  const hasActiveSession = Boolean(currentThreadId);

  // A phone gets its own header from MobileShell: no right panel, and Back instead of a sidebar trigger.
  if (isPhone()) return null;

  return (
    <div
      className="flex items-center justify-between h-11 border-b border-white/10 bg-sidebar/20"
      data-tauri-drag-region
    >
      {/* pl-3: with the sidebar open nothing else pads this row, and the project badge touched the divider */}
      <div className="flex min-w-0 items-center gap-2 pl-3">
        {showTrigger && (
          <div className={`flex gap-2 items-center ${needsTrafficLightOffset ? 'pl-[68px]' : ''}`}>
            <SidebarTrigger />
            <NewAgentButton />
          </div>
        )}
        {!hasActiveSession && <Badge variant="secondary">{getFilename(cwd)}</Badge>}
      </div>
      <span
        className="flex items-center gap-1 pr-2"
        style={
          isWindows() && !isRightPanelOpen ? { paddingRight: WINDOW_CONTROLS_WIDTH + 8 } : undefined
        }
      >
        {cwd && <ProjectRunMenu />}
        {cwd && <OpenAppMenu path={cwd} />}
        {!isRightPanelOpen && (
          <>
            {hasActiveSession && <GitActions />}
            <Button
              variant={isTerminalOpen ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => {
                setActiveRightPanelTab('terminal');
                setRightPanelOpen(true);
              }}
              title={t('agent.showTerminal')}
            >
              <SquareTerminal className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleRightPanel}
              title={t('agent.hideRightPanel')}
            >
              <PanelRight className="size-4" />
            </Button>
          </>
        )}
      </span>
    </div>
  );
}
