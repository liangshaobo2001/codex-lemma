import type { ReactNode } from 'react';
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceLine,
  TraceTitle,
} from '@/components/ui/trace';

interface WorkSummaryProps {
  /** Past-tense summary such as "Worked for 1:05". */
  title: string;
  /** Short trailing text such as "12 steps". */
  description?: string;
  /** The turn's intermediate work: steps, interim messages, plans. */
  children: ReactNode;
}

/**
 * A finished turn's work folded into one line above its final answer. Closed by
 * default so the transcript reads as questions and answers; the work is one click away.
 */
export function WorkSummary({ title, description, children }: WorkSummaryProps) {
  return (
    <Trace>
      <TraceCollapsible>
        <TraceCollapsibleTrigger>
          <TraceLine>
            <TraceTitle>{title}</TraceTitle>
            {description && <TraceDescription>{description}</TraceDescription>}
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent className="flex flex-col gap-2 text-foreground">
          {children}
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  );
}
