import { Play, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLayoutStore } from '@/stores';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import type { RunKind } from './detectProjectCommands';
import { EditRunCommandsDialog } from './EditRunCommandsDialog';
import { useProjectCommands } from './useProjectCommands';
import { useProjectRunStore } from './useProjectRunStore';

const RUN_ITEMS: { kind: RunKind; label: string }[] = [
  { kind: 'dev', label: 'Dev' },
  { kind: 'test', label: 'Test' },
  { kind: 'build', label: 'Build' },
  { kind: 'preview', label: 'Preview' },
];

export function ProjectRunMenu() {
  const { t } = useTranslation('features');
  const { cwd } = useWorkspaceStore();
  const { addTerminal, setActiveRightPanelTab, setRightPanelOpen } = useLayoutStore();
  const { defaults, commands } = useProjectCommands();
  const overridesForCwd = useProjectRunStore((state) => (cwd ? state.overrides[cwd] : undefined));
  const [editOpen, setEditOpen] = useState(false);

  if (!cwd) return null;

  const runCommand = (label: string, command: string) => {
    addTerminal({ label, command });
    setActiveRightPanelTab('terminal');
    setRightPanelOpen(true);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 font-normal"
            title={t('projectRun.runProjectCommand')}
          >
            <Play className="size-3.5" />
            {t('projectRun.run')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {RUN_ITEMS.map(({ kind }) => {
            const command = commands[kind];
            const label = t(`projectRun.kinds.${kind}`);
            return (
              <DropdownMenuItem
                key={kind}
                disabled={!command}
                onSelect={() => command && runCommand(label, command)}
                className="flex flex-col items-start gap-0.5"
              >
                <span>{label}</span>
                <span className="font-mono text-xs text-muted-foreground truncate w-full">
                  {command ?? t('projectRun.notSet')}
                </span>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Settings2 className="size-3.5" />
            {t('projectRun.editCommands')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <EditRunCommandsDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        cwd={cwd}
        defaults={defaults}
        overrides={overridesForCwd ?? {}}
      />
    </>
  );
}
