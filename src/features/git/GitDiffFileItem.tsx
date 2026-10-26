import { ChevronDown, ChevronRight, Minus, Plus, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  type GitFileDiffMetaResponse,
  type GitFileDiffResponse,
  type GitStatusEntry,
  gitFileDiff,
  gitFileDiffMeta,
  gitReverseFiles,
  gitStageFiles,
  gitUnstageFiles,
} from '@/services/apiAdapt';
import { useEditorStore } from '@/stores';
import { GitDiffPreview } from './GitDiffPreview';
import type { DiffSection, DiffSource } from './types';
import { LARGE_DIFF_THRESHOLD_BYTES, statusColorByText, statusTextForSection } from './utils';

interface GitDiffFileItemProps {
  cwd: string;
  entry: GitStatusEntry;
  section: DiffSection;
  diffSource: DiffSource;
  wordWrapEnabled: boolean;
  expanded: boolean;
  isSelected: boolean;
  refreshKey: number;
  onExpandedChange: (expanded: boolean) => void;
  onSelect: () => void;
  onRefreshStatus: () => void;
}

export function GitDiffFileItem({
  cwd,
  entry,
  section,
  diffSource,
  wordWrapEnabled,
  expanded,
  isSelected,
  refreshKey,
  onExpandedChange,
  onSelect,
  onRefreshStatus,
}: GitDiffFileItemProps) {
  const { t } = useTranslation('tools');
  const hasConfirmedGitRevert = useEditorStore((state) => state.hasConfirmedGitRevert);
  const setHasConfirmedGitRevert = useEditorStore((state) => state.setHasConfirmedGitRevert);
  const openFile = useEditorStore((state) => state.openFile);
  const [diffMeta, setDiffMeta] = useState<GitFileDiffMetaResponse | null>(null);
  const [diffData, setDiffData] = useState<GitFileDiffResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [largeDiffConfirmed, setLargeDiffConfirmed] = useState(false);
  const [stageLoading, setStageLoading] = useState(false);
  const [revertLoading, setRevertLoading] = useState(false);
  const [revertConfirm, setRevertConfirm] = useState(false);

  // Load diff meta + data whenever the item is expanded, including on mount,
  // and reload when the file, section or refresh key changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is a reload signal
  useEffect(() => {
    if (!expanded) return;

    let cancelled = false;
    setLoading(true);
    setDiffMeta(null);
    setDiffData(null);
    setLargeDiffConfirmed(false);

    const run = async () => {
      try {
        const meta = await gitFileDiffMeta(cwd, entry.path, section === 'staged');
        if (cancelled) return;
        setDiffMeta(meta);

        // Binary blobs (images, pptx, ...) have no meaningful text diff and
        // would otherwise be stringified and line-diffed, freezing the panel.
        if (!meta.is_binary && meta.total_bytes <= LARGE_DIFF_THRESHOLD_BYTES) {
          const data = await gitFileDiff(cwd, entry.path, section === 'staged');
          if (cancelled) return;
          setDiffData(data);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [expanded, cwd, entry.path, section, refreshKey]);

  // Load full data once user confirms large diff
  useEffect(() => {
    if (
      !largeDiffConfirmed ||
      !diffMeta ||
      diffMeta.is_binary ||
      diffMeta.total_bytes > 1024 * 1024
    )
      return;

    let cancelled = false;
    setLoading(true);

    gitFileDiff(cwd, entry.path, section === 'staged')
      .then((data) => {
        if (!cancelled) {
          setDiffData(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [largeDiffConfirmed, diffMeta, cwd, entry.path, section]);

  const handleStage = async () => {
    setStageLoading(true);
    try {
      if (section === 'staged') {
        await gitUnstageFiles(cwd, [entry.path]);
      } else {
        await gitStageFiles(cwd, [entry.path]);
      }
      onRefreshStatus();
    } finally {
      setStageLoading(false);
    }
  };

  const doRevert = async () => {
    setRevertLoading(true);
    try {
      await gitReverseFiles(cwd, [entry.path], section === 'staged');
      onRefreshStatus();
    } finally {
      setRevertLoading(false);
      setRevertConfirm(false);
    }
  };

  const handleRevert = () => {
    if (!hasConfirmedGitRevert) {
      setRevertConfirm(true);
      return;
    }
    void doRevert();
  };

  const status = statusTextForSection(entry, section);
  const name = entry.path.split('/').pop() ?? entry.path;
  const dir = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : null;

  return (
    <div
      className={`border-b border-white/10 ${isSelected ? 'ring-1 ring-inset ring-primary/40' : ''}`}
    >
      {/* File header */}
      <div
        className={`flex items-center gap-1.5 px-2 py-1.5 text-xs ${
          isSelected ? 'bg-accent/20' : 'bg-sidebar/10'
        }`}
      >
        <button
          type="button"
          className="shrink-0 text-muted-foreground"
          onClick={() => onExpandedChange(!expanded)}
          aria-label={expanded ? t('git.collapseDiff') : t('git.expandDiff')}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>

        <button
          type="button"
          className="flex-1 flex items-center gap-2 min-w-0 text-left"
          onClick={() => {
            onSelect();
            onExpandedChange(true);
          }}
        >
          <span className="font-mono truncate text-foreground">{name}</span>
          {dir && (
            <span className="font-mono truncate text-muted-foreground/50 text-[10px] hidden sm:block">
              {dir}
            </span>
          )}
        </button>

        <Badge
          variant="outline"
          className={`font-mono px-1.5 shrink-0 text-[10px] ${statusColorByText(status)}`}
        >
          {status}
        </Badge>

        {diffSource === 'latest-turn' && (
          <span className="text-[10px] text-muted-foreground/50 shrink-0">
            {t('git.latestTurnTag')}
          </span>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={() => void handleStage()}
          disabled={stageLoading}
          title={section === 'staged' ? t('git.unstageFile') : t('git.stageFile')}
        >
          {section === 'staged' ? (
            <Minus className="h-3.5 w-3.5" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={handleRevert}
          disabled={revertLoading}
          title={t('git.revertFileChanges')}
        >
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Inline revert confirmation */}
      {revertConfirm && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs bg-destructive/10 border-t border-white/10">
          <span className="flex-1 text-destructive">{t('git.revertAllConfirm', { name })}</span>
          <Button
            size="sm"
            variant="destructive"
            className="h-6 text-xs px-2"
            onClick={() => {
              setHasConfirmedGitRevert(true);
              void doRevert();
            }}
          >
            {t('git.revert')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-xs px-2"
            onClick={() => setRevertConfirm(false)}
          >
            {t('common.cancel')}
          </Button>
        </div>
      )}

      {/* Diff content */}
      {expanded && (
        <GitDiffPreview
          entry={entry}
          diffMeta={diffMeta}
          diffData={diffData}
          loading={loading}
          largeDiffConfirmed={largeDiffConfirmed}
          wordWrapEnabled={wordWrapEnabled}
          onConfirmLarge={() => setLargeDiffConfirmed(true)}
          onOpenFile={() => openFile(`${cwd.replace(/[\\/]$/, '')}/${entry.path}`)}
        />
      )}
    </div>
  );
}
