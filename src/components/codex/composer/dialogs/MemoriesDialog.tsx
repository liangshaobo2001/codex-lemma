import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useCodexStore } from '@/components/codex/stores/useCodexStore';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { memoryReset, threadMemoryModeSet } from '@/services';

type MemoriesDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function MemoriesDialog({ open, onClose }: MemoriesDialogProps) {
  const { t } = useTranslation('chat');
  const currentThreadId = useCodexStore((state) => state.currentThreadId);
  // There is no read API for the current memory mode, so this switch only
  // reflects changes made from this dialog during the session.
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleToggle = async (next: boolean) => {
    if (!currentThreadId) return;
    const previous = enabled;
    setEnabled(next);
    setSaving(true);
    try {
      await threadMemoryModeSet({
        threadId: currentThreadId,
        mode: next ? 'enabled' : 'disabled',
      });
      toast.success(next ? t('memories.enabled') : t('memories.disabled'));
    } catch (error) {
      setEnabled(previous);
      toast.error(t('memories.updateFailed', { error: String(error) }));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await memoryReset();
      toast.success(t('memories.resetDone'));
    } catch (error) {
      toast.error(t('memories.resetFailed', { error: String(error) }));
    } finally {
      setResetting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('memories.title')}</DialogTitle>
          <DialogDescription>{t('memories.description')}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-4 rounded-md border p-3">
          <div className="space-y-1">
            <Label htmlFor="memory-mode">{t('memories.threadMode')}</Label>
            <p className="text-muted-foreground text-xs">
              {currentThreadId ? t('memories.threadModeHint') : t('memories.noThreadHint')}
            </p>
          </div>
          <Switch
            id="memory-mode"
            checked={enabled}
            disabled={!currentThreadId || saving}
            onCheckedChange={handleToggle}
          />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-md border p-3">
          <div className="space-y-1">
            <Label>{t('memories.resetAll')}</Label>
            <p className="text-muted-foreground text-xs">{t('memories.resetAllHint')}</p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={resetting}>
                <Trash2 className="size-4 text-delete-icon!" />
                {t('memories.reset')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('memories.resetConfirmTitle')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('memories.resetConfirmDescription')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={handleReset}>{t('memories.reset')}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </DialogContent>
    </Dialog>
  );
}
