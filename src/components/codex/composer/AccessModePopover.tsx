import { AlertTriangle, Bot, Check, Hand, ListChecks } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type AccessMode, useCodexStore, useConfigStore } from '@/components/codex/stores';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useComposerToolbarNarrow } from './ComposerToolbarContext';

const ACCESS_MODE_OPTIONS: Array<{
  label: string;
  mode: AccessMode;
  icon: typeof Hand;
  textColor: string;
}> = [
  // Local-only build: plain text colour for every mode (user, 2026-10-21); upstream used orange shades.
  { label: 'askApproval', mode: 'ask', icon: Hand, textColor: 'text-foreground' },
  { label: 'approvalForMe', mode: 'auto', icon: Bot, textColor: 'text-foreground' },
  {
    label: 'fullAccess',
    mode: 'full',
    icon: AlertTriangle,
    textColor: 'text-foreground',
  },
];

export function AccessModePopover() {
  const { t } = useTranslation('composer');
  const { accessMode, setAccessMode, collaborationMode, setCollaborationMode } = useConfigStore();
  const { triggerInputFocus } = useCodexStore();
  const isNarrow = useComposerToolbarNarrow();

  const closeAndFocus = () => {
    triggerInputFocus();
  };
  const selected =
    ACCESS_MODE_OPTIONS.find((item) => item.mode === accessMode) ?? ACCESS_MODE_OPTIONS[0];
  const displayLabel = collaborationMode === 'plan' ? 'plan' : selected.label;
  const DisplayIcon = collaborationMode === 'plan' ? ListChecks : selected.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`h-8 gap-2 px-2 ${selected.textColor} hover:bg-accent`}
        >
          <DisplayIcon className="h-4 w-4" />
          {!isNarrow && <span className="text-xs">{t(displayLabel)}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="start">
        <div className="space-y-1">
          <DropdownMenuItem
            className="w-full justify-start font-normal h-8 text-xs gap-2 px-2"
            onClick={() => {
              setCollaborationMode(collaborationMode === 'plan' ? 'default' : 'plan');
              closeAndFocus();
            }}
          >
            <ListChecks className="h-3.5 w-3.5" />
            <span>{t('planMode')}</span>
          </DropdownMenuItem>
          <div className="h-px bg-border my-1" />

          {ACCESS_MODE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isActive = collaborationMode !== 'plan' && option.mode === accessMode;

            return (
              <DropdownMenuItem
                key={option.mode}
                onClick={() => {
                  setAccessMode(option.mode);
                  setCollaborationMode('default');
                  closeAndFocus();
                }}
                className="font-normal px-2 py-1.5 text-xs"
              >
                <div className="flex w-full items-start justify-between gap-2">
                  <span className="flex gap-2 items-start">
                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="flex flex-col">
                      <span>{t(option.label)}</span>
                      <span className="text-muted-foreground">
                        {t(`${option.label}Description`)}
                      </span>
                    </span>
                  </span>
                  {isActive && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                </div>
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
