import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface RenameThreadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  renameValue: string;
  setRenameValue: (value: string) => void;
  handleRenameSubmit: () => Promise<void>;
}

export function RenameThreadDialog({
  open,
  onOpenChange,
  renameValue,
  setRenameValue,
  handleRenameSubmit,
}: RenameThreadDialogProps) {
  const { t } = useTranslation('chat');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('threadList.renameTitle')}</DialogTitle>
        </DialogHeader>
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          placeholder={t('threadList.renamePlaceholder')}
          autoFocus
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleRenameSubmit}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
