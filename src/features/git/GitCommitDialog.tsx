import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

interface GitCommitDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (message: string) => Promise<void>;
}

export function GitCommitDialog({ isOpen, onClose, onConfirm }: GitCommitDialogProps) {
  const { t } = useTranslation('tools');
  const [commitMessage, setCommitMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!commitMessage.trim()) return;
    setLoading(true);
    try {
      await onConfirm(commitMessage);
      setCommitMessage('');
      onClose();
    } catch {
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('git.commitDialogTitle')}</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <Textarea
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder={t('git.commitMessagePlaceholder')}
            autoFocus
            className="min-h-[100px] bg-muted/20 border-border"
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void handleConfirm();
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={loading || !commitMessage.trim()}>
            {loading ? t('git.committing') : t('git.commit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
