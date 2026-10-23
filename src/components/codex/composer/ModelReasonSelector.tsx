import { Check, ChevronDown, Search, Settings } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ReasoningEffort } from '@/bindings';
import { useCodexStore, useConfigStore } from '@/components/codex/stores';
import type { ModelListItem } from '@/components/codex/types';
import { ProviderIcons } from '@/components/icons';
import { useSettingsNavStore } from '@/components/settings/settingsNav';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { selectThreadModel } from '@/services/threadModelService';
import { useLayoutStore } from '@/stores';
import type { Provider } from '@/stores/settings';
import { useComposerModel } from '../hooks/useComposerModel';
import { useModels } from '../hooks/useModels';
import { nextReasoningEffort, ReasoningEffortSelector } from './ReasoningEffortSelector';

function ModelItem({
  provider,
  item,
  selected,
  disabled,
  onSelect,
}: {
  provider: string;
  item: ModelListItem;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <CommandItem
      value={`${provider} ${item.label} ${item.id}`}
      onSelect={onSelect}
      disabled={disabled}
      title={item.description ?? item.id}
      className="gap-1.5 pl-7 text-xs"
    >
      <span className="truncate">{item.label}</span>
      {selected && <Check className="ml-auto h-3.5 w-3.5 shrink-0" />}
    </CommandItem>
  );
}

type BaseModelSelectorProps = {
  provider: Provider;
  onProviderChange: (provider: Provider) => void;
  value: string | undefined;
  onValueChange: (id: string) => void;
  /** Picks provider and model in one step; without it, onProviderChange then onValueChange are called. */
  onSelectModel?: (provider: Provider, id: string) => void;
  reasoningEffort?: ReasoningEffort;
  onReasoningEffortChange?: (value: ReasoningEffort) => void;
  disabled?: boolean;
  onClose?: () => void;
  mode?: 'popover' | 'panel';
};

/**
 * Every configured provider's models in one list, grouped by provider (the providers and models
 * themselves are managed in Settings → Models).
 */
function BaseModelSelector({
  provider,
  onProviderChange,
  value,
  onValueChange,
  onSelectModel,
  reasoningEffort,
  onReasoningEffortChange,
  disabled = false,
  onClose,
  mode = 'popover',
}: BaseModelSelectorProps) {
  const { t } = useTranslation('settings');
  const [open, setOpen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { openAiModels, itemsByProvider } = useModels();
  const providers = Object.keys(itemsByProvider);

  const handleSelect = useCallback(
    (targetProvider: string, id: string) => {
      if (onSelectModel) {
        onSelectModel(targetProvider as Provider, id);
      } else {
        if (targetProvider !== provider) onProviderChange(targetProvider as Provider);
        onValueChange(id);
        const nextEffort = nextReasoningEffort(targetProvider, id, reasoningEffort, openAiModels);
        if (nextEffort && onReasoningEffortChange) onReasoningEffortChange(nextEffort);
      }
      setOpen(false);
      onClose?.();
    },
    [
      onSelectModel,
      onValueChange,
      onProviderChange,
      provider,
      openAiModels,
      onReasoningEffortChange,
      reasoningEffort,
      onClose,
    ]
  );

  const manageModels = () => {
    setOpen(false);
    useSettingsNavStore.getState().openSection('models');
    useLayoutStore.getState().setView('settings');
  };

  const activeLabel =
    (itemsByProvider[provider] ?? []).find((m) => m.id === value)?.label ||
    value ||
    t('modelsPage.pickerEmpty');
  const selectedOpenAiModel =
    provider === 'openai' ? openAiModels.find((m) => m.id === value) : undefined;

  const header = (
    <div className="flex items-center gap-1 border-b px-1 py-1">
      <span className="flex-1 px-1.5 py-1 text-xs text-muted-foreground">
        {t('modelsPage.models')}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        title={t('modelsPage.searchModels')}
        onClick={() => {
          setShowSearch((prev) => !prev);
          setSearchQuery('');
        }}
      >
        <Search className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        title={t('modelsPage.manage')}
        onClick={manageModels}
      >
        <Settings className="h-4 w-4" />
      </Button>
    </div>
  );

  const modelPicker = (
    <>
      <div className={cn(!showSearch && 'hidden')}>
        <CommandInput
          placeholder={t('modelsPage.searchModels')}
          value={searchQuery}
          onValueChange={setSearchQuery}
          className="text-xs"
        />
      </div>
      <CommandList className={mode === 'panel' ? 'max-h-[min(55vh,400px)]' : 'max-h-64'}>
        <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
          {t('modelsPage.pickerEmpty')}
        </CommandEmpty>
        {providers.map((p) => (
          <CommandGroup
            key={p}
            heading={
              <span className="flex items-center gap-1.5">
                <ProviderIcons providerId={p} size="sm" />
                {p}
              </span>
            }
          >
            {itemsByProvider[p].map((item) => (
              <ModelItem
                key={`${p}:${item.id}`}
                provider={p}
                item={item}
                selected={p === provider && item.id === value}
                disabled={disabled}
                onSelect={() => handleSelect(p, item.id)}
              />
            ))}
          </CommandGroup>
        ))}
        {providers.length === 0 && (
          <CommandItem
            value="manage models"
            onSelect={manageModels}
            className="justify-center gap-1.5 text-xs text-muted-foreground"
          >
            <Settings className="h-3.5 w-3.5" />
            {t('modelsPage.manage')}
          </CommandItem>
        )}
      </CommandList>
    </>
  );

  const command = (
    <Command
      loop
      onKeyDown={(e) => {
        // Escape closes the search first.
        if (e.key === 'Escape' && showSearch) {
          e.preventDefault();
          e.stopPropagation();
          setShowSearch(false);
          setSearchQuery('');
        }
      }}
    >
      {header}
      {modelPicker}
    </Command>
  );

  const effortSelector = reasoningEffort !== undefined && onReasoningEffortChange && (
    <ReasoningEffortSelector
      provider={provider}
      openAiModel={selectedOpenAiModel}
      value={reasoningEffort}
      onChange={(option) => {
        onReasoningEffortChange(option);
        if (mode !== 'panel') {
          setOpen(false);
          onClose?.();
        }
      }}
      disabled={disabled || !value}
    />
  );

  if (mode === 'panel') {
    return (
      <div className="flex w-full flex-col overflow-hidden rounded-md border bg-popover">
        {command}
        {effortSelector}
      </div>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setSearchQuery('');
          setShowSearch(false);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-2 px-2 font-normal border border-transparent transition-all hover:border-input hover:bg-accent/50"
          disabled={disabled}
        >
          <div className="flex items-center gap-1.5 text-xs text-foreground">
            <span className="font-normal max-w-[160px] truncate">{activeLabel}</span>
            {reasoningEffort !== undefined && reasoningEffort !== 'none' && (
              <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono capitalize text-muted-foreground border">
                {t(`chat:effort.${reasoningEffort}`, { defaultValue: reasoningEffort })}
              </span>
            )}
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0 flex flex-col" align="start">
        {command}
        {effortSelector}
      </PopoverContent>
    </Popover>
  );
}

export function ModelReasonSelector({ mode = 'popover' }: { mode?: 'popover' | 'panel' }) {
  const { triggerInputFocus } = useCodexStore();
  const { openAiModels } = useModels();
  const { modelProvider, model, reasoningEffort, pending, threadId } = useComposerModel();
  const selectModel = (provider: Provider, id: string, effort = reasoningEffort) => {
    const nextEffort = nextReasoningEffort(provider, id, effort, openAiModels) ?? effort;
    if (!threadId) {
      useConfigStore.getState().setModelSelection(provider, id, nextEffort);
      return;
    }
    selectThreadModel(threadId, {
      modelProvider: provider,
      model: id,
      reasoningEffort: nextEffort,
    }).catch((error: unknown) =>
      toast.error(error instanceof Error ? error.message : String(error))
    );
  };
  return (
    <BaseModelSelector
      provider={modelProvider}
      onProviderChange={() => {}}
      value={model}
      onValueChange={(id) => selectModel(modelProvider, id)}
      onSelectModel={selectModel}
      reasoningEffort={reasoningEffort}
      onReasoningEffortChange={(effort) => selectModel(modelProvider, model, effort)}
      onClose={triggerInputFocus}
      disabled={pending}
      mode={mode}
    />
  );
}

export { BaseModelSelector as CodexModelSelector };
