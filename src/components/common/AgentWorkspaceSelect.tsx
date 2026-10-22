import { Check, ChevronDown, Monitor, Split } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ThreadCwdMode } from '@/components/codex/stores';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface AgentWorkspaceSelectProps {
  value: ThreadCwdMode;
  onValueChange: (value: ThreadCwdMode) => void;
}

const MODE_ICONS: Record<ThreadCwdMode, React.ReactNode> = {
  local: <Monitor size={14} />,
  worktree: <Split size={14} />,
};

// i18n keys (chat namespace) of the mode labels.
const MODE_LABEL_KEYS: Record<ThreadCwdMode, string> = {
  local: 'workspace.local',
  worktree: 'workspace.worktree',
};

export function AgentWorkspaceSelect({ value, onValueChange }: AgentWorkspaceSelectProps) {
  const { t } = useTranslation('chat');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs px-2 gap-1">
          {MODE_ICONS[value]}
          <span>{t(MODE_LABEL_KEYS[value])}</span>
          <ChevronDown size={10} className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => onValueChange('local')} className="flex justify-between">
          <span className="flex gap-2">
            <Monitor className="h-4 w-4" />
            <span>{t('workspace.local')}</span>
          </span>
          {value === 'local' && <Check />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onValueChange('worktree')}
          className="flex justify-between item-center"
        >
          <span className="flex gap-2">
            <Split className="h-4 w-4" />
            <span>{t('workspace.worktree')}</span>
          </span>
          {value === 'worktree' && <Check />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
