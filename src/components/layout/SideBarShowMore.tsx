import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface SideBarShowMoreProps {
  hiddenCount: number;
  expanded: boolean;
  onToggle: () => void;
}

/** Toggle under a truncated sidebar list; renders nothing when nothing is hidden. */
export function SideBarShowMore({ hiddenCount, expanded, onToggle }: SideBarShowMoreProps) {
  const { t } = useTranslation('app');
  if (hiddenCount <= 0) return null;
  return (
    <Button
      variant="ghost"
      size="xs"
      className="justify-start px-1 text-muted-foreground"
      onClick={onToggle}
    >
      {expanded ? t('sidebar.showLess') : t('sidebar.showMore')}
    </Button>
  );
}
