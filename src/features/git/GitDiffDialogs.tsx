import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface GitDiffDialogsProps {
  bulkStageDialogOpen: boolean;
  bulkStagePathsCount: number;
  bulkStageLoading: boolean;
  revertConfirmOpen: boolean;
  revertLoading: boolean;
  onBulkStageDialogOpenChange: (open: boolean) => void;
  onRevertConfirmOpenChange: (open: boolean) => void;
  onBulkStageConfirm: () => void;
  onRevertConfirm: () => void;
}

export function GitDiffDialogs({
  bulkStageDialogOpen,
  bulkStagePathsCount,
  bulkStageLoading,
  revertConfirmOpen,
  revertLoading,
  onBulkStageDialogOpenChange,
  onRevertConfirmOpenChange,
  onBulkStageConfirm,
  onRevertConfirm,
}: GitDiffDialogsProps) {
  const { t } = useTranslation('tools');
  return (
    <>
      <Dialog open={bulkStageDialogOpen} onOpenChange={onBulkStageDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('git.stageAllTitle')}</DialogTitle>
            <DialogDescription>
              {bulkStagePathsCount === 0
                ? t('git.noUnstagedFiles')
                : t('git.stageAllDescription', { count: bulkStagePathsCount })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onBulkStageDialogOpenChange(false)}
              disabled={bulkStageLoading}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={onBulkStageConfirm}
              disabled={bulkStagePathsCount === 0 || bulkStageLoading}
            >
              {bulkStageLoading ? t('git.staging') : t('git.stageAll')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={revertConfirmOpen} onOpenChange={onRevertConfirmOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('git.revertTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('git.revertDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revertLoading}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction disabled={revertLoading} onClick={onRevertConfirm}>
              {revertLoading ? t('git.reverting') : t('git.revert')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
