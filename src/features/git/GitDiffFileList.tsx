import { useTranslation } from 'react-i18next';
import type { GitStatusEntry } from '@/services/apiAdapt';
import { GitDiffFileItem } from './GitDiffFileItem';
import type { DiffSection, DiffSource } from './types';
import { isDiffAutoExpanded } from './utils';
import { VirtualGitList } from './VirtualGitList';

interface GitDiffFileListProps {
  cwd: string | null;
  entries: GitStatusEntry[];
  section: DiffSection;
  diffSource: DiffSource;
  wordWrapEnabled: boolean;
  selectedDiffPath: string | null;
  refreshKey: number;
  expandedDiffs: Record<string, boolean>;
  onExpandedChange: (path: string, expanded: boolean) => void;
  onSelect: (path: string) => void;
  onRefreshStatus: () => void;
}

export function GitDiffFileList({
  cwd,
  entries,
  section,
  diffSource,
  wordWrapEnabled,
  selectedDiffPath,
  refreshKey,
  expandedDiffs,
  onExpandedChange,
  onSelect,
  onRefreshStatus,
}: GitDiffFileListProps) {
  const { t } = useTranslation('tools');
  if (!cwd) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        {t('git.noWorkspace')}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        {t('git.noChangedFiles')}
      </div>
    );
  }

  return (
    <VirtualGitList
      key={`${cwd}:${section}`}
      stateKey={`${cwd}:${section}:diff`}
      items={entries}
      itemKey={(entry) => entry.path}
      label="Changed file diffs"
      selectedKey={selectedDiffPath}
      renderItem={(entry, index) => (
        <GitDiffFileItem
          key={entry.path}
          cwd={cwd}
          entry={entry}
          section={section}
          diffSource={diffSource}
          wordWrapEnabled={wordWrapEnabled}
          expanded={expandedDiffs[entry.path] ?? isDiffAutoExpanded(index, entries.length)}
          isSelected={selectedDiffPath === entry.path}
          refreshKey={refreshKey}
          onExpandedChange={(value) => onExpandedChange(entry.path, value)}
          onSelect={() => onSelect(entry.path)}
          onRefreshStatus={onRefreshStatus}
        />
      )}
    />
  );
}
