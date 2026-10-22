import {
  ChevronsDownUp,
  ChevronsUpDown,
  Columns2,
  Folder,
  FolderOpen,
  Menu,
  RefreshCw,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLayoutStore } from '@/stores';
import { GitActions } from './GitActions';
import { GitStatsIndicator } from './GitStatsIndicator';
import type { DiffSection, DiffSource } from './types';

interface GitDiffTopBarProps {
  cwd: string | null;
  gitLoading: boolean;
  diffSource: DiffSource;
  onDiffSourceChange: (value: DiffSource) => void;
  selectedDiffSection: DiffSection;
  onDiffSectionChange: (value: DiffSection) => void;
  unstagedCount: number;
  stagedCount: number;
  showFileTree: boolean;
  onToggleFileTree: () => void;
  onRefresh: () => void;
  /** Omitted by views that don't render the diff list (e.g. latest-turn summary). */
  allDiffsCollapsed?: boolean;
  canToggleAllDiffs?: boolean;
  onToggleAllDiffs?: () => void;
}

export function GitDiffTopBar({
  cwd,
  gitLoading,
  diffSource,
  onDiffSourceChange,
  selectedDiffSection,
  onDiffSectionChange,
  unstagedCount,
  stagedCount,
  showFileTree,
  onToggleFileTree,
  onRefresh,
  allDiffsCollapsed = false,
  canToggleAllDiffs = false,
  onToggleAllDiffs,
}: GitDiffTopBarProps) {
  const { t } = useTranslation('tools');
  const { diffWordWrap, setDiffWordWrap, diffSplitMode, setDiffSplitMode } = useLayoutStore();

  return (
    <div className="border-b border-white/10 flex items-center gap-2">
      <div className="shrink-0">
        <Select
          value={diffSource}
          onValueChange={(value) => {
            const src = value as DiffSource;
            onDiffSourceChange(src);
            if (src === 'unstaged' || src === 'staged') {
              onDiffSectionChange(src);
            }
          }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unstaged">
              {t('git.source.unstaged', { count: unstagedCount })}
            </SelectItem>
            <SelectItem value="staged">{t('git.source.staged', { count: stagedCount })}</SelectItem>
            <SelectItem value="latest-turn">{t('git.source.latestTurn')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {diffSource !== 'latest-turn' && <GitStatsIndicator diffSection={selectedDiffSection} />}

      <div className="flex-1" />

      <div className="flex items-center">
        <GitActions />
        {onToggleAllDiffs && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggleAllDiffs}
            disabled={!canToggleAllDiffs}
            aria-label={allDiffsCollapsed ? t('git.expandAllDiffs') : t('git.collapseAllDiffs')}
            title={allDiffsCollapsed ? t('git.expandAllDiffs') : t('git.collapseAllDiffs')}
          >
            {allDiffsCollapsed ? (
              <ChevronsUpDown className="h-4 w-4" />
            ) : (
              <ChevronsDownUp className="h-4 w-4" />
            )}
          </Button>
        )}
        <Button
          variant={diffSplitMode ? 'secondary' : 'ghost'}
          size="icon-sm"
          className="hidden md:inline-flex"
          onClick={() => setDiffSplitMode(!diffSplitMode)}
          aria-label={diffSplitMode ? t('git.unifiedMode') : t('git.splitMode')}
          title={diffSplitMode ? t('git.unifiedMode') : t('git.splitMode')}
        >
          <Columns2 className="h-4 w-4" />
        </Button>
        <Button
          variant={showFileTree ? 'secondary' : 'ghost'}
          size="icon-sm"
          onClick={onToggleFileTree}
          aria-label={showFileTree ? t('git.hideFileTree') : t('git.showFileTree')}
          title={showFileTree ? t('git.hideFileTree') : t('git.showFileTree')}
        >
          {showFileTree ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('git.panelMenu')}
              title={t('git.panelMenu')}
            >
              <Menu className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onRefresh} disabled={!cwd || gitLoading}>
              <RefreshCw className="h-4 w-4" /> {t('common.refresh')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDiffWordWrap(!diffWordWrap)}>
              {diffWordWrap ? t('git.disableWordWrap') : t('git.enableWordWrap')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
