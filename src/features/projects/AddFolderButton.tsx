import { open } from '@tauri-apps/plugin-dialog';
import { FolderPlus } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { BrowserProjects } from '@/features/ProjectSelector';
import { isDesktopTauri } from '@/hooks/runtime';

interface AddFolderButtonProps {
  label?: string;
  disabled?: boolean;
  onPick: (path: string) => void;
}

/** Picks a folder with the native dialog, or the in-app browser outside desktop Tauri. */
export function AddFolderButton({ label, disabled, onPick }: AddFolderButtonProps) {
  const { t } = useTranslation('features');
  const text = label ?? t('projects.addFolder');
  const [browserOpen, setBrowserOpen] = useState(false);

  const handlePick = useCallback(
    (path: string) => {
      setBrowserOpen(false);
      onPick(path);
    },
    [onPick]
  );

  const handleClick = useCallback(async () => {
    if (!isDesktopTauri()) {
      setBrowserOpen(true);
      return;
    }
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === 'string') handlePick(selected);
  }, [handlePick]);

  return (
    <>
      <Button variant="outline" size="sm" disabled={disabled} onClick={handleClick}>
        <FolderPlus />
        {text}
      </Button>
      <Dialog open={browserOpen} onOpenChange={setBrowserOpen}>
        <DialogContent size="xl" className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{text}</DialogTitle>
            <DialogDescription>{t('projects.browseFolder')}</DialogDescription>
          </DialogHeader>
          <BrowserProjects cwd={null} onAddProject={handlePick} />
        </DialogContent>
      </Dialog>
    </>
  );
}
