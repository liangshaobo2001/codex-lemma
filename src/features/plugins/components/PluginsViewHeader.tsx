import { ArrowLeft, ChevronRight, MoreHorizontal, Plus, RotateCcw, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useTrafficLightConfig } from '@/hooks';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLayoutStore } from '@/stores';
import { usePluginsViewContext } from '../hooks';
import { TabSwitcher } from './TabSwitcher';

/** Top toolbar: back button, tab switcher, manage/add actions. */
export function PluginsViewHeader() {
  const { t } = useTranslation('tools');
  const isMobile = useIsMobile();
  const { isSidebarOpen } = useLayoutStore();
  const { needsTrafficLightOffset } = useTrafficLightConfig(isSidebarOpen);
  const {
    mainTab,
    setMainTab,
    overlay,
    setOverlay,
    addTab,
    setAddTab,
    setRefreshTrigger,
    selectedPluginDetail,
    handlePluginDetail,
  } = usePluginsViewContext();

  return (
    <div
      className={`flex items-center gap-1.5 p-1 ${needsTrafficLightOffset && 'pl-20'}`}
      data-tauri-drag-region
    >
      {!isSidebarOpen && <SidebarTrigger className="h-7 w-7" />}
      {overlay === 'add' && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={t('plugins.manage')}
          title={t('plugins.manage')}
          onClick={() => setOverlay('manage')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      )}

      {/* Tab switcher: shown in normal browsing */}
      {overlay === 'manage' ? (
        <Button variant="ghost" size="sm" onClick={() => setOverlay(null)}>
          <ArrowLeft className="h-4 w-4" />
          {isMobile ? '' : t('plugins.plugin')}
        </Button>
      ) : overlay === 'add' ? (
        <TabSwitcher
          tabs={['Connector', 'Skill'] as const}
          active={addTab}
          onChange={setAddTab}
          showLabel={!isMobile}
        />
      ) : overlay === 'detail' ? (
        <PluginDetailHeader
          displayName={
            selectedPluginDetail?.summary?.interface?.displayName ??
            selectedPluginDetail?.summary?.name ??
            ''
          }
          onBack={() => handlePluginDetail(null)}
        />
      ) : (
        !overlay && (
          <TabSwitcher
            tabs={['Plugins', 'Skills', 'Tools', 'Connectors'] as const}
            active={mainTab}
            onChange={setMainTab}
            showLabel={!isMobile}
          />
        )
      )}

      <div className="flex-1" />

      {!overlay && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={t('plugins.manage')}
          title={t('plugins.manage')}
          onClick={() => setOverlay('manage')}
        >
          <Settings className="h-3.5 w-3.5" />
        </Button>
      )}

      {!overlay && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={t('plugins.addConnectorOrSkill')}
            title={t('plugins.addConnectorOrSkill')}
            onClick={() => {
              setAddTab(mainTab === 'Skills' ? 'Skill' : 'Connector');
              setOverlay('add');
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
          {!isMobile && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setRefreshTrigger((k) => k + 1)}>
                  <RotateCcw className="h-3.5 w-3.5 mr-2" />
                  {mainTab === 'Skills'
                    ? t('plugins.refreshSkills')
                    : mainTab === 'Plugins'
                      ? t('plugins.refreshPlugins')
                      : t('plugins.refreshTools')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </>
      )}
    </div>
  );
}

export interface PluginDetailHeaderProps {
  displayName: string;
  onBack?: () => void;
}

export function PluginDetailHeader({ displayName, onBack }: PluginDetailHeaderProps) {
  const { t } = useTranslation('tools');
  return (
    <header className="flex items-center gap-1">
      <Button variant="ghost" onClick={onBack}>
        {t('plugins.plugin')}
      </Button>
      <ChevronRight className="h-3.5 w-3.5" />
      <span className="font-medium text-foreground">{displayName}</span>
    </header>
  );
}
