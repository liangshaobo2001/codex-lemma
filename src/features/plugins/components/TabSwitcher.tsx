import { Blocks, Package2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MCP } from '@/components/icons';
import { Button } from '@/components/ui/button';

export function TabSwitcher<T extends string>({
  tabs,
  active,
  onChange,
  showLabel = true,
}: {
  tabs: readonly T[];
  active: T;
  onChange: (tab: T) => void;
  showLabel?: boolean;
}) {
  const { t } = useTranslation('tools');
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-muted/50 p-0.5">
      {tabs.map((tab) => {
        const label = t(`plugins.tabs.${tab}`, { defaultValue: tab });
        return (
          <Button
            key={tab}
            aria-label={label}
            title={label}
            variant="ghost"
            size="sm"
            onClick={() => onChange(tab)}
            className={`h-7 ${active === tab ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
          >
            {tab.startsWith('Connector') ? (
              <MCP className="h-3.5 w-3.5" />
            ) : tab === 'Tools' ? (
              <Blocks className="h-4 w-4" />
            ) : (
              <Package2 className="h-4 w-4" />
            )}
            {showLabel && ` ${label}`}
          </Button>
        );
      })}
    </div>
  );
}
