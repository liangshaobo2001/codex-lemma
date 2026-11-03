import { useLayoutEffect, useRef, useState } from 'react';
import { Markdown } from '@/components/Markdown';
import {
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceLine,
  TraceTitle,
} from '@/components/ui/trace';

interface ReasoningProps {
  title: string;
  text: string;
  /** Shimmers the title while the model is still thinking. */
  running?: boolean;
  defaultOpen?: boolean;
}

/**
 * Thinking stays collapsed by default, with a single-line live tail beside the title.
 * Expanding is a user choice and is preserved when streaming finishes.
 */
export function Reasoning({ title, text, running, defaultOpen = false }: ReasoningProps) {
  const windowRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(defaultOpen);
  const preview = text.slice(-256).replace(/\s+/g, ' ').trim();
  useLayoutEffect(() => {
    if (!running || !text) return;
    if (open) {
      const el = windowRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    } else {
      const el = previewRef.current;
      if (el) el.scrollLeft = el.scrollWidth;
    }
  }, [text, running, open]);

  const line = (
    <TraceLine status={running ? 'running' : undefined} className="flex-1">
      <TraceTitle className="shrink-0">{title}</TraceTitle>
      {running && !open && preview && (
        <span
          ref={previewRef}
          data-reasoning-preview=""
          aria-hidden="true"
          className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-muted-foreground/70"
        >
          {preview}
        </span>
      )}
    </TraceLine>
  );

  if (!running && text.trim().length === 0) return line;

  return (
    <TraceCollapsible open={open} onOpenChange={setOpen}>
      <TraceCollapsibleTrigger aria-label={title} className={running ? 'w-full' : undefined}>{line}</TraceCollapsibleTrigger>
      {/* Reasoning summaries are Markdown (e.g. a bold heading per step). */}
      <TraceCollapsibleContent>
        {open && (running ? (
          <div ref={windowRef} className="max-h-[6.5rem] overflow-y-auto whitespace-pre-wrap wrap-break-word text-sm text-muted-foreground">
            {text}
          </div>
        ) : <Markdown value={text} className="text-sm text-muted-foreground" />)}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}
