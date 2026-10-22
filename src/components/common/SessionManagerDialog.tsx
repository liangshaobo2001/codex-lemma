import { useTranslation } from 'react-i18next';
import { CodexThreadManager } from '@/components/codex/thread/CodexThreadManager';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SessionManagerDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation('chat');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-0 p-0 sm:max-w-2xl h-[70vh]">
        <DialogHeader className="flex flex-row items-center justify-between px-4 pt-4 pb-0 shrink-0">
          <DialogTitle className="text-base">{t('sessionManager.title')}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col flex-1 min-h-0 px-4 pb-4 pt-3">
          <CodexThreadManager onClose={() => onOpenChange(false)} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
