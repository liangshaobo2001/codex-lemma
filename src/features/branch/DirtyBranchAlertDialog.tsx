import { Trans, useTranslation } from 'react-i18next';
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

interface DirtyBranchAlertDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  dirtyBranch: string | null;
  dirtyCount: number;
  onConfirm: (branch: string) => void;
  onCancel: () => void;
}

export function DirtyBranchAlertDialog({
  isOpen,
  onOpenChange,
  dirtyBranch,
  dirtyCount,
  onConfirm,
  onCancel,
}: DirtyBranchAlertDialogProps) {
  const { t } = useTranslation('features');
  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('branch.dirty.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            <Trans
              t={t}
              i18nKey="branch.dirty.description"
              count={dirtyCount}
              values={{ branch: dirtyBranch }}
              components={{ branch: <span className="font-mono font-semibold text-foreground" /> }}
            />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{t('branch.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              if (dirtyBranch) {
                onConfirm(dirtyBranch);
              }
            }}
          >
            {t('branch.dirty.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
