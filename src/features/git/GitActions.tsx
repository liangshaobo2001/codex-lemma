import { CloudUpload, GitCommit, ListTodo } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';
import { gitCommit, gitPush } from '@/services/apiAdapt/git';
import { useGitStatsStore } from '@/stores/useGitStatsStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { GitCommitDialog } from './GitCommitDialog';

export function GitActions() {
  const { t } = useTranslation('tools');
  const { cwd } = useWorkspaceStore();
  const { refreshStats } = useGitStatsStore();
  const { toast } = useToast();

  const [isCommitDialogOpen, setIsCommitDialogOpen] = useState(false);

  const refreshGitStats = useCallback(() => {
    if (!cwd) return;
    void refreshStats(cwd);
  }, [cwd, refreshStats]);

  const confirmGitCommit = async (message: string) => {
    if (!cwd) return;
    try {
      await gitCommit(cwd, message);
      refreshGitStats();
      toast.success(t('git.commitSuccess'), {
        description: t('git.commitSuccessDescription', { message }),
      });
    } catch (err) {
      toast.error(t('git.commitFailed'), { description: String(err) });
      throw err;
    }
  };

  const handleGitPush = async () => {
    if (!cwd) return;
    try {
      await gitPush(cwd);
      toast.success(t('git.pushSuccess'), { description: t('git.pushSuccessDescription') });
    } catch (err) {
      console.error('Push failed:', err);
      toast.error(t('git.pushFailed'), { description: String(err) });
    }
  };

  if (!cwd) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg hover:bg-accent"
            title={t('git.actions')}
          >
            <ListTodo className="size-4 text-muted-foreground hover:text-foreground transition-colors" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-44 p-1">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground px-2 py-1.5">
            {t('git.actions')}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="gap-2 text-xs cursor-pointer"
            onClick={() => setIsCommitDialogOpen(true)}
          >
            <GitCommit className="size-3.5 text-primary" />
            <span>{t('git.commit')}</span>
          </DropdownMenuItem>

          <DropdownMenuItem className="gap-2 text-xs cursor-pointer" onClick={handleGitPush}>
            <CloudUpload className="size-3.5 text-primary" />
            <span>{t('git.push')}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <GitCommitDialog
        isOpen={isCommitDialogOpen}
        onClose={() => setIsCommitDialogOpen(false)}
        onConfirm={confirmGitCommit}
      />
    </>
  );
}
