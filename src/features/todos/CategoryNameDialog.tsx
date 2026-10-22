import { useEffect, useState } from 'react';
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

type CategoryNameDialogProps = {
  open: boolean;
  title: string;
  confirmLabel: string;
  initialName?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (name: string) => void;
};

export function CategoryNameDialog({
  open,
  title,
  confirmLabel,
  initialName = '',
  onOpenChange,
  onConfirm,
}: CategoryNameDialogProps) {
  const { t } = useTranslation('features');
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  const confirm = () => {
    if (!name.trim()) return;
    onConfirm(name.trim());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={name}
          placeholder={t('todos.category.namePlaceholder')}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              confirm();
            }
          }}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('todos.category.cancel')}
          </Button>
          <Button onClick={confirm} disabled={!name.trim()}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
