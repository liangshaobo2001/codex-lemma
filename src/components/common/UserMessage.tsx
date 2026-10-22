import { ChevronDown, ChevronUp, Pencil } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Markdown } from '@/components/Markdown';
import { Button } from '@/components/ui/button';
import { MessageToolbar } from './MessageToolbar';

const MAX_COLLAPSED_HEIGHT = 128;

export function UserMessage({ text, onEdit }: { text: string; onEdit?: () => void }) {
  const { t } = useTranslation('thread');
  const [collapsed, setCollapsed] = useState(true);
  const [overflows, setOverflows] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: text is the trigger — the effect measures the node after it re-renders
  useLayoutEffect(() => {
    if (contentRef.current) {
      setOverflows(contentRef.current.scrollHeight > MAX_COLLAPSED_HEIGHT);
    }
  }, [text]);

  return (
    <div className="group flex min-w-0 flex-col items-end gap-1">
      <div className="relative min-w-0 max-w-[80%] break-words rounded-md bg-blue-50 p-2 dark:bg-blue-950">
        {overflows && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? t('chat:message.expand') : t('chat:message.collapse')}
            className="absolute top-1 right-1 z-10 h-5 w-5 text-muted-foreground"
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        )}
        <div
          ref={contentRef}
          className={collapsed && overflows ? 'overflow-hidden max-h-32' : undefined}
        >
          <Markdown value={text} />
        </div>
        {overflows && collapsed && (
          <div className="absolute bottom-0 left-0 right-0 h-10 flex items-end justify-center rounded-b-md bg-gradient-to-t from-blue-50 dark:from-blue-950 to-transparent pb-1">
            <Button
              variant="link"
              size="sm"
              onClick={() => setCollapsed(false)}
              className="h-auto p-0 text-xs text-blue-500 dark:text-blue-400 leading-none"
            >
              {t('chat:message.showMore')}
            </Button>
          </div>
        )}
        {overflows && !collapsed && (
          <div className="flex justify-center mt-1">
            <Button
              variant="link"
              size="sm"
              onClick={() => setCollapsed(true)}
              className="h-auto p-0 text-xs text-blue-500 dark:text-blue-400"
            >
              {t('chat:message.showLess')}
            </Button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        {onEdit && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onEdit}
            aria-label={t('userMessage.edit')}
            title={t('userMessage.edit')}
            className="h-6 w-6 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        <MessageToolbar text={text} />
      </div>
    </div>
  );
}
