import { ChevronDown, ChevronUp } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Markdown } from '@/components/Markdown';
import { Button } from '@/components/ui/button';

const PREVIEW_LINES = 15;

/** Keep the original Markdown intact; only its viewport collapses. */
export function UserMessageText({ text }: { text: string }) {
  const { t } = useTranslation('chat');
  const contentId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [measurement, setMeasurement] = useState({ limit: 15 * 14 * 1.625, overflows: false });

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const measure = () => {
      const style = window.getComputedStyle(content);
      const fontSize = Number.parseFloat(style.fontSize) || 14;
      const lineHeight = style.lineHeight.endsWith('px')
        ? Number.parseFloat(style.lineHeight)
        : fontSize * (Number.parseFloat(style.lineHeight) || 1.625);
      const limit = PREVIEW_LINES * lineHeight;
      const overflows = content.scrollHeight > limit + 1;
      setMeasurement((previous) =>
        previous.limit === limit && previous.overflows === overflows
          ? previous
          : { limit, overflows }
      );
    };
    measure();
    // Measure the unclipped inner content, including Markdown blocks and wrapping.
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const clipped = measurement.overflows && !expanded;
  return (
    <div className="min-w-0 max-w-full">
      <div
        id={contentId}
        className={clipped ? 'overflow-hidden' : undefined}
        style={clipped ? { maxHeight: measurement.limit } : undefined}
      >
        <div ref={contentRef} className="flow-root min-w-0 max-w-full text-sm leading-relaxed">
          <Markdown className="min-w-0 max-w-full" value={text} />
        </div>
      </div>
      {measurement.overflows && (
        <Button
          variant="ghost"
          size="sm"
          aria-controls={contentId}
          aria-expanded={expanded}
          aria-label={t(expanded ? 'message.collapse' : 'message.expand')}
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 h-6 gap-1 px-1 text-xs font-normal text-muted-foreground"
        >
          {expanded ? t('message.showLess') : t('message.showMore')}
          {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        </Button>
      )}
    </div>
  );
}
