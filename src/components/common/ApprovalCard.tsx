import { cn } from 'cn';
import { ChevronDown, CornerDownLeft } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';

export interface ApprovalOption {
  key: string;
  label: string;
  /** Explains the scope of the decision; shown under the label in the menu. */
  hint?: string;
  onSelect: () => void | Promise<void>;
}

interface ApprovalCardProps {
  icon: ReactNode;
  /** Short category label, e.g. "Terminal". */
  kind: string;
  /** The question the user is answering. */
  title: string;
  pendingCount?: number;
  /** Primary content: the command, files, or tool input under review. */
  children?: ReactNode;
  /** Secondary information, collapsed by default. */
  details?: ReactNode;
  deny: ApprovalOption;
  allow: ApprovalOption;
  /** Extra decisions offered from the split button menu. */
  moreOptions?: ApprovalOption[];
  className?: string;
}

/** Monospace block for the command or input under review. */
export function ApprovalCode({ children }: { children: ReactNode }) {
  return (
    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/60 px-2.5 py-2 font-mono text-xs text-muted-foreground">
      {children}
    </pre>
  );
}

export function ApprovalCard({
  icon,
  kind,
  title,
  pendingCount = 0,
  children,
  details,
  deny,
  allow,
  moreOptions = [],
  className,
}: ApprovalCardProps) {
  const { t } = useTranslation('thread');
  const titleId = useId();
  const rootRef = useRef<HTMLFieldSetElement>(null);
  const allowRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);

  // Focus the primary action so Enter approves and Esc denies without
  // reaching for the mouse; a new request re-runs this via its title/kind.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refocus when the request changes
  useEffect(() => {
    allowRef.current?.focus({ preventScroll: true });
  }, [kind, title]);

  const run = async (option: ApprovalOption) => {
    if (busy) return;
    setBusy(true);
    try {
      await option.onSelect();
    } catch (error) {
      console.error(`Approval option "${option.key}" failed:`, error);
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLFieldSetElement>) => {
    // Menu content renders in a portal; its Esc only closes the menu.
    if (event.key !== 'Escape' || !rootRef.current?.contains(event.target as Node)) return;
    event.preventDefault();
    run(deny);
  };

  return (
    <fieldset
      ref={rootRef}
      aria-labelledby={titleId}
      onKeyDown={handleKeyDown}
      className={cn('min-w-0 rounded-xl border bg-card p-3 shadow-sm', className)}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5">
        {icon}
        <span>{kind}</span>
        {pendingCount > 1 && (
          <span className="ml-auto tabular-nums">
            {t('common.pending', { count: pendingCount })}
          </span>
        )}
      </div>

      <p id={titleId} className="mt-1.5 text-sm font-medium leading-snug break-words">
        {title}
      </p>

      {children && <div className="mt-2 space-y-2">{children}</div>}

      {details && (
        <Collapsible className="mt-1.5">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="xs"
              className="group -ml-2 text-muted-foreground data-[state=open]:text-foreground"
            >
              {t('approval.details')}
              <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1 space-y-1.5 text-xs text-muted-foreground">
            {details}
          </CollapsibleContent>
        </Collapsible>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(deny)}>
          {deny.label}
          <Kbd className="pointer-coarse:hidden">Esc</Kbd>
        </Button>
        <ButtonGroup>
          <Button ref={allowRef} size="sm" disabled={busy} onClick={() => run(allow)}>
            {allow.label}
            <Kbd className="bg-primary-foreground/15 text-primary-foreground pointer-coarse:hidden">
              <CornerDownLeft />
            </Kbd>
          </Button>
          {moreOptions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon-sm"
                  disabled={busy}
                  aria-label={t('approval.moreOptions')}
                  className="w-7 border-l border-primary-foreground/20"
                >
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-2rem)]">
                {[allow, ...moreOptions].map((option) => (
                  <DropdownMenuItem
                    key={option.key}
                    onSelect={() => run(option)}
                    className="flex-col items-start gap-0.5"
                  >
                    <span>{option.label}</span>
                    {option.hint && (
                      <span className="text-xs text-muted-foreground break-words">
                        {option.hint}
                      </span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </ButtonGroup>
      </div>
    </fieldset>
  );
}
