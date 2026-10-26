import { DiffModeEnum, DiffView } from '@git-diff-view/react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useThemeContext } from '@/contexts/ThemeContext';
import type {
  GitFileDiffMetaResponse,
  GitFileDiffResponse,
  GitStatusEntry,
} from '@/services/apiAdapt';
import { useLayoutStore } from '@/stores';
import { boundedDiff } from './boundedDiff';
import { formatBytes, LARGE_DIFF_THRESHOLD_BYTES } from './utils';

interface Props {
  entry: GitStatusEntry;
  diffMeta: GitFileDiffMetaResponse | null;
  diffData: GitFileDiffResponse | null;
  loading: boolean;
  largeDiffConfirmed: boolean;
  wordWrapEnabled: boolean;
  onConfirmLarge: () => void;
  onOpenFile: () => void;
}

export function GitDiffPreview({
  entry,
  diffMeta,
  diffData,
  loading,
  largeDiffConfirmed,
  wordWrapEnabled,
  onConfirmLarge,
  onOpenFile,
}: Props) {
  const { t } = useTranslation('tools');
  const { resolvedTheme } = useThemeContext();
  const diffSplitMode = useLayoutStore((state) => state.diffSplitMode);
  const isBinary = diffMeta?.is_binary ?? false;
  const isLarge = diffMeta ? !isBinary && diffMeta.total_bytes > LARGE_DIFF_THRESHOLD_BYTES : false;
  const diffHunks = useMemo(() => {
    if (!diffData || !diffData.has_changes) return [];
    const patch = boundedDiff(entry.path, diffData.old_content ?? '', diffData.new_content ?? '');
    return patch === null ? null : [patch];
  }, [entry.path, diffData]);
  return (
    <div className="overflow-auto">
      {loading && (
        <div className="px-3 py-2 text-xs text-muted-foreground">{t('git.loadingDiff')}</div>
      )}

      {!loading && isLarge && !largeDiffConfirmed && diffMeta && (
        <div className="m-3 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <div className="text-amber-200">
            {t('git.largeDiff', { size: formatBytes(diffMeta.total_bytes) })}
          </div>
          <div className="mt-1 text-xs text-amber-200/70">
            {t('git.beforeAfter', {
              before: formatBytes(diffMeta.old_bytes),
              after: formatBytes(diffMeta.new_bytes),
            })}
          </div>
          {diffMeta.total_bytes <= 1024 * 1024 ? (
            <Button size="sm" className="mt-2" onClick={onConfirmLarge}>
              {t('git.loadDiff')}
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="mt-2" onClick={onOpenFile}>
              {t('git.openFile')}
            </Button>
          )}
        </div>
      )}

      {!loading && isBinary && diffMeta && (
        <div className="px-3 py-2 text-xs text-muted-foreground">
          {t('git.binaryNotShown', { size: formatBytes(diffMeta.total_bytes) })}
        </div>
      )}

      {!loading && diffData && !diffData.has_changes && (
        <div className="px-3 py-2 text-xs text-muted-foreground">{t('git.noChanges')}</div>
      )}

      {!loading && diffData && diffHunks === null && (
        <div className="px-3 py-2 text-xs text-muted-foreground">
          <p>{t('git.diffPreviewLimited')}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={onOpenFile}>
            {t('git.openFile')}
          </Button>
        </div>
      )}
      {!loading && diffData && diffData.has_changes && diffHunks && diffHunks.length > 0 && (
        <div className="git-diff-compact-num">
          <DiffView
            className="git-diff-table"
            data={{
              oldFile: { fileName: `a/${entry.path}`, content: diffData.old_content ?? '' },
              newFile: { fileName: `b/${entry.path}`, content: diffData.new_content ?? '' },
              hunks: diffHunks,
            }}
            diffViewMode={diffSplitMode ? DiffModeEnum.Split : DiffModeEnum.Unified}
            diffViewTheme={resolvedTheme === 'dark' ? 'dark' : 'light'}
            diffViewHighlight={false}
            diffViewWrap={wordWrapEnabled}
          />
        </div>
      )}
    </div>
  );
}
