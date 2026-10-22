import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ExternalAgentConfigImportHistory } from '@/bindings/v2';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { formatCompletedAt, itemTypeLabel } from './importDialogUtils';

interface ImportHistorySectionProps {
  histories: ExternalAgentConfigImportHistory[];
}

/** Collapsible list of previously completed imports. */
export function ImportHistorySection({ histories }: ImportHistorySectionProps) {
  const { t } = useTranslation('chat');
  const [open, setOpen] = useState(false);

  if (histories.length === 0) {
    return null;
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-between px-2">
          <span>{t('import.previous', { count: histories.length })}</span>
          <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 max-h-40 space-y-2 overflow-y-auto px-2 pb-1">
        {histories.map((history) => {
          const types = [
            ...new Set([
              ...history.successes.map((success) => success.itemType),
              ...history.failures.map((failure) => failure.itemType),
            ]),
          ];
          return (
            <div key={history.importId} className="text-muted-foreground text-xs">
              <div className="text-foreground">{formatCompletedAt(history.completedAtMs)}</div>
              <div>
                {history.providerId ?? t('import.unknownProvider')} &middot;{' '}
                {t('import.importedCount', { count: history.successes.length })}
                {history.failures.length > 0
                  ? t('import.failedCount', { count: history.failures.length })
                  : ''}
              </div>
              {types.length > 0 && <div>{types.map(itemTypeLabel).join(', ')}</div>}
            </div>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}
