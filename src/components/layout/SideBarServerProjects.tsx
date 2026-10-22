import {
  Archive,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  FolderClosed,
  FolderOpen,
  Inbox,
  Pencil,
  ScrollText,
  SquarePen,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Project } from '@/bindings/v2';
import { ThreadList } from '@/components/codex/thread/ThreadList';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/use-toast';
import { ConfirmProjectActionDialog, EditProjectDialog } from '@/features/projects/ProjectDialogs';
import { primaryRoot } from '@/features/projects/projectModel';
import { useServerProjectsStore } from '@/features/projects/useServerProjectsStore';
import { isPhone } from '@/hooks/runtime';
import { useLayoutStore } from '@/stores';
import { useAgentSettingsStore } from '@/stores/useAgentSettingsStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { RECENT_PROJECT_LIMIT, sortByRecency } from './projectRecency';
import { SideBarShowMore } from './SideBarShowMore';

interface SideBarServerProjectsProps {
  /** Starts a chat in `cwd`, or in no project for `null`. */
  onNewChat: (cwd: string | null) => void;
}

/** Collapse-state key of the Ungrouped entry (the id the old Recent section used). */
const UNGROUPED_ID = 'recent';

type ProjectDialog = { kind: 'edit' | 'archive' | 'delete'; project: Project };

/** Codex tab: app-server projects with their chats, then the chats outside any project. */
export function SideBarServerProjects({ onNewChat }: SideBarServerProjectsProps) {
  const { t } = useTranslation('app');
  const { t: ts } = useTranslation('sidebar');
  const projects = useServerProjectsStore((s) => s.projects);
  const { setView, expandedProjects, setProjectExpanded } = useLayoutStore();
  const { setInstructionType } = useAgentSettingsStore();
  const setCwd = useWorkspaceStore((s) => s.setCwd);
  const [dialog, setDialog] = useState<ProjectDialog | null>(null);
  const [showAll, setShowAll] = useState(false);
  const sorted = useMemo(() => sortByRecency(projects), [projects]);
  const visible = showAll ? sorted : sorted.slice(0, RECENT_PROJECT_LIMIT);
  const phone = isPhone();

  const isOpen = (id: string) => expandedProjects[id] ?? true;

  const openInstructions = (root: string) => {
    setCwd(root);
    setView('agents-md');
    setInstructionType('project');
  };

  const archiveChats = async (project: Project) => {
    const count = await useServerProjectsStore.getState().archiveChats(project.id);
    toast.success(t('projects.archivedChats', { count }));
  };

  return (
    <div className="flex min-h-0 w-full flex-col gap-2 px-2 pb-2">
      {visible.map((project) => {
        const root = primaryRoot(project);
        return (
          <Collapsible
            key={project.id}
            open={isOpen(project.id)}
            onOpenChange={(open) => setProjectExpanded(project.id, open)}
            className="bg-sidebar/30"
          >
            <div
              className="group flex items-center gap-1 px-1 py-0.5 text-xs transition-colors hover:bg-foreground/10"
              title={root ?? project.name}
            >
              <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 text-left">
                {isOpen(project.id) ? (
                  <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <FolderClosed className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="truncate font-normal">{project.name}</span>
                {isOpen(project.id) ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover:opacity-100" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover:opacity-100" />
                )}
              </CollapsibleTrigger>

              {/* Editing shapes the desktop's project list; a phone only mirrors it. */}
              {!phone && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title={t('projects.actionsFor', { name: project.name })}
                      aria-label={t('projects.actionsFor', { name: project.name })}
                      className="shrink-0"
                    >
                      <Ellipsis />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setDialog({ kind: 'edit', project })}>
                      <Pencil /> {t('projects.edit')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setDialog({ kind: 'archive', project })}>
                      <Archive /> {t('projects.archiveChats')}
                    </DropdownMenuItem>
                    {root && (
                      <DropdownMenuItem onSelect={() => openInstructions(root)}>
                        <ScrollText /> {t('projects.instructions')}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => setDialog({ kind: 'delete', project })}
                    >
                      <Trash2 /> {t('projects.delete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <Button
                variant="ghost"
                size="icon-xs"
                title={
                  root
                    ? t('projects.newThreadIn', { name: project.name })
                    : t('projects.addFolderFirst')
                }
                aria-label={t('projects.newThreadIn', { name: project.name })}
                disabled={!root}
                onClick={() => root && onNewChat(root)}
                className="shrink-0"
              >
                <SquarePen />
              </Button>
            </div>

            <CollapsibleContent>
              <ThreadList projectId={project.id} cwd={root ?? undefined} />
            </CollapsibleContent>
          </Collapsible>
        );
      })}

      <SideBarShowMore
        hiddenCount={sorted.length - RECENT_PROJECT_LIMIT}
        expanded={showAll}
        onToggle={() => setShowAll((v) => !v)}
      />

      {/* Chats outside any project, listed like one more project. */}
      <Collapsible
        open={isOpen(UNGROUPED_ID)}
        onOpenChange={(open) => setProjectExpanded(UNGROUPED_ID, open)}
        className="bg-sidebar/30"
      >
        <div className="group flex items-center gap-1 px-1 py-0.5 text-xs transition-colors hover:bg-foreground/10">
          <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <Inbox className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate font-normal">{ts('ungrouped')}</span>
            {isOpen(UNGROUPED_ID) ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover:opacity-100" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover:opacity-100" />
            )}
          </CollapsibleTrigger>
          <Button
            variant="ghost"
            size="icon-xs"
            title={t('sidebar.newChat')}
            aria-label={t('sidebar.newChat')}
            onClick={() => onNewChat(null)}
            className="shrink-0"
          >
            <SquarePen />
          </Button>
        </div>
        <CollapsibleContent>
          <ThreadList projectId={null} />
        </CollapsibleContent>
      </Collapsible>

      <EditProjectDialog
        projectId={dialog?.kind === 'edit' ? dialog.project.id : null}
        onOpenChange={(open) => !open && setDialog(null)}
      />
      <ConfirmProjectActionDialog
        open={dialog?.kind === 'archive'}
        title={t('projects.archiveChats')}
        description={t('projects.archiveChatsDescription', {
          name: dialog?.project.name ?? t('projects.thisProject'),
        })}
        confirmLabel={t('projects.archiveChats')}
        onConfirm={() => (dialog ? archiveChats(dialog.project) : Promise.resolve())}
        onOpenChange={(open) => !open && setDialog(null)}
      />
      <ConfirmProjectActionDialog
        open={dialog?.kind === 'delete'}
        title={t('projects.delete')}
        description={t('projects.deleteServerDescription', {
          name: dialog?.project.name ?? t('projects.thisProject'),
        })}
        confirmLabel={t('projects.delete')}
        destructive
        onConfirm={() =>
          dialog ? useServerProjectsStore.getState().remove(dialog.project.id) : Promise.resolve()
        }
        onOpenChange={(open) => !open && setDialog(null)}
      />
    </div>
  );
}
