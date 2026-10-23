import { ChevronDown } from 'lucide-react';
import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useComposerModel } from '@/components/codex/hooks/useComposerModel';
import { Button } from '@/components/ui/button';

/**
 * Plain button trigger for `AgentModelPanel`. Deliberately has no popover of
 * its own — the panel owns the popover, so a selector like `ModelSelector`
 * or `ModelReasonSelector` can't be used directly as `trigger` (it renders
 * its own nested `Popover`, which swallows the click before the panel's
 * `PopoverTrigger asChild` ever sees it).
 *
 * Shows the current model and reasoning effort.
 */
export const AgentModelTrigger = forwardRef<HTMLButtonElement, React.ComponentProps<typeof Button>>(
  function AgentModelTrigger(props, ref) {
    const { t } = useTranslation('chat');
    const {
      model: codexModel,
      reasoningEffort: codexReasoningEffort,
      effortInherited,
      pending,
    } = useComposerModel();
    const label = pending ? t('composer.switchingModel') : codexModel || t('agent.selectModel');
    const effort = effortInherited
      ? 'default'
      : codexReasoningEffort !== 'none'
        ? codexReasoningEffort
        : undefined;

    return (
      <Button
        ref={ref}
        variant="ghost"
        size="sm"
        // Button size sm sets has-[>svg]:px-2.5 (the chevron is a direct svg child), which outranks a plain pl/pr,
        // so the padding has to be set with the same variant. Left 4px, right 6px.
        className="h-8 gap-2 has-[>svg]:pl-1 has-[>svg]:pr-1.5 border border-transparent transition-all hover:border-input hover:bg-accent/50"
        {...props}
        disabled={pending || props.disabled}
        aria-busy={pending}
      >
        <div className="flex items-center gap-1.5 text-xs text-foreground">
          <span className="font-medium max-w-[120px] truncate leading-none py-0.5 -translate-y-px">
            {label}
          </span>
          {effort && (
            <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono capitalize text-muted-foreground border">
              {t(`effort.${effort}`, { defaultValue: effort })}
            </span>
          )}
        </div>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </Button>
    );
  }
);
