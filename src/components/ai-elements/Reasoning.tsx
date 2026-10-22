import { useEffect, useRef } from 'react';
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
 * The agent's thinking. While it streams (local fork, like zcode): the title over a five-line window of grey
 * text that follows the end. Once done: a collapsed line whose body holds the full reasoning text.
 */
export function Reasoning({ title, text, running, defaultOpen = false }: ReasoningProps) {
  const windowRef = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: text is the trigger; follow the stream to its end
  useEffect(() => {
    const el = windowRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);

  const line = (
    <TraceLine status={running ? 'running' : undefined}>
      <TraceTitle>{title}</TraceTitle>
    </TraceLine>
  );

  if (running) {
    return (
      <div className="flex min-w-0 flex-col">
        {line}
        {text.trim().length > 0 && (
          <div
            ref={windowRef}
            className="mt-1.5 mb-1 ml-[calc(--spacing(2)-1px)] max-h-[6.5rem] min-w-0 overflow-y-auto border-l pr-1 pl-4 text-sm leading-[1.3rem] whitespace-pre-wrap wrap-break-word text-muted-foreground [scrollbar-width:none]"
          >
            {text}
          </div>
        )}
      </div>
    );
  }

  if (text.trim().length === 0) return line;

  return (
    <TraceCollapsible defaultOpen={defaultOpen}>
      <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
      {/* Reasoning summaries are Markdown (e.g. a bold heading per step). */}
      <TraceCollapsibleContent>
        <Markdown value={text} className="text-sm text-muted-foreground" />
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}
