import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GitFileTree } from './GitFileTree';
import type { DiffSection, TreeNode } from './types';

interface GitFileTreePanelProps {
  cwd: string | null;
  selectedDiffSection: DiffSection;
  bulkStagePaths: string[];
  bulkStageLoading: boolean;
  filterText: string;
  gitError: string | null;
  filteredEntriesCount: number;
  fileTree: TreeNode[];
  selectedDiffPath: string | null;
  collapsedFolders: Set<string>;
  onOpenBulkStageDialog: () => void;
  onFilterTextChange: (value: string) => void;
  onToggleFolder: (path: string) => void;
  onSelectPath: (section: DiffSection, path: string) => void;
  onStage: (paths: string[]) => Promise<void>;
  onUnstage: (paths: string[]) => Promise<void>;
}

export function GitFileTreePanel({
  cwd,
  selectedDiffSection,
  bulkStagePaths,
  bulkStageLoading,
  filterText,
  gitError,
  filteredEntriesCount,
  fileTree,
  selectedDiffPath,
  collapsedFolders,
  onOpenBulkStageDialog,
  onFilterTextChange,
  onToggleFolder,
  onSelectPath,
  onStage,
  onUnstage,
}: GitFileTreePanelProps) {
  const { t } = useTranslation('tools');
  return (
    <div className="w-64 min-w-[220px] min-h-0 border-l border-white/10 flex flex-col">
      <div className="px-3 border-b border-white/10 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{t('git.fileTree')}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onOpenBulkStageDialog}
            disabled={bulkStagePaths.length === 0 || bulkStageLoading}
            title={
              selectedDiffSection === 'staged'
                ? t('git.switchToUnstagedHint')
                : t('git.stageAllHint')
            }
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            {t('git.stageAll')}
          </Button>
        </div>
        <Input
          value={filterText}
          onChange={(event) => onFilterTextChange(event.target.value)}
          placeholder={t('git.filterPlaceholder')}
          className="h-8 text-xs"
        />
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="p-2 space-y-1">
          {gitError && (
            <div className="text-xs text-destructive rounded border border-destructive/30 p-2">
              {gitError}
            </div>
          )}
          {filteredEntriesCount === 0 && (
            <div className="px-2 py-3 text-xs text-muted-foreground">{t('git.noFilterMatch')}</div>
          )}
          {cwd ? (
            <GitFileTree
              fileTree={fileTree}
              selectedDiffPath={selectedDiffPath}
              selectedDiffSection={selectedDiffSection}
              collapsedFolders={collapsedFolders}
              onToggleFolder={onToggleFolder}
              onSelectPath={onSelectPath}
              onStage={onStage}
              onUnstage={onUnstage}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
