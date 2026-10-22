import { Check, ChevronDown, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CodexModelSelector } from '@/components/codex/composer/index';
import { useConfigStore } from '@/components/codex/stores';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import type { AutomationCwdMode, AutomationTask } from '@/services/apiAdapt';
import {
  createAutomation,
  deleteAutomation,
  setAutomationPaused,
  updateAutomation,
} from '@/services/apiAdapt';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { getErrorMessage } from '@/utils/errorUtils';
import { getFilename } from '@/utils/getFilename';
import { DEFAULT_FORM } from './constants';
import { ScheduleEditor } from './ScheduleEditor';
import type { DialogMode, FormState } from './types';
import { formFromTask, scheduleFromForm } from './utils';

type ManageDialogProps = {
  mode: DialogMode;
  onClose: () => void;
  onCreated?: (task: AutomationTask) => void;
  onUpdated: (task: AutomationTask) => void;
  onDeleted: (id: string) => void;
};

export function ManageDialog({
  mode,
  onClose,
  onCreated,
  onUpdated,
  onDeleted,
}: ManageDialogProps) {
  const { t } = useTranslation('features');
  const { projects } = useWorkspaceStore();
  const open = mode !== null;
  const isCreate = mode?.type === 'create';
  const isEdit = mode?.type === 'edit';
  const existingTask = isEdit ? mode.task : null;

  const [isMutating, setIsMutating] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [projectSelectOpen, setProjectSelectOpen] = useState(false);
  const [form, setForm] = useState<FormState>({ ...DEFAULT_FORM });

  const getDefaultModel = useCallback(
    (_agent: FormState['agent'], provider: string): string =>
      useConfigStore.getState().providerModels[provider] ?? '',
    []
  );

  // A single string, so the comparison below cannot drift the way separate
  // `open` / `mode.type` / `task.id` refs did: `existingTask?.id` is `undefined`
  // while the ref held `null`, which never matched and re-reset the form on every
  // render.
  const target =
    mode === null ? 'closed' : mode.type === 'edit' ? `edit:${mode.task.id}` : 'create';
  const prevTargetRef = useRef('closed');

  if (target !== prevTargetRef.current) {
    prevTargetRef.current = target;

    // Reset during render so the dialog never paints the previous task's form. The
    // ref above is already updated, so this branch cannot run twice for the same
    // target and the render-phase update settles immediately.
    if (open) {
      setLastError(null);
      setConfirmDelete(false);
      setProjectSelectOpen(false);

      if (isCreate) {
        const initial = { ...DEFAULT_FORM, ...(mode.initialForm ?? {}) };
        const modelProvider = initial.modelProvider ?? 'openai';
        setForm({
          ...initial,
          modelProvider,
          model: initial.model || getDefaultModel(initial.agent, modelProvider),
        });
      } else if (existingTask) {
        setForm(formFromTask(existingTask));
      }
    }
  }

  const setField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleProject = (project: string) => {
    setForm((prev) => ({
      ...prev,
      selectedProjects: prev.selectedProjects.includes(project)
        ? prev.selectedProjects.filter((p) => p !== project)
        : [...prev.selectedProjects, project],
    }));
  };

  const canSubmit = useMemo(
    () =>
      form.name.trim().length > 0 &&
      form.prompt.trim().length > 0 &&
      form.weekdays.length > 0 &&
      form.model.trim().length > 0,
    [form.name, form.prompt, form.weekdays.length, form.model]
  );

  const buildSchedule = () => scheduleFromForm(form);

  const handleCreate = async () => {
    if (!canSubmit) return;
    setIsMutating(true);
    setLastError(null);
    try {
      const created = await createAutomation({
        name: form.name.trim(),
        projects: form.selectedProjects,
        prompt: form.prompt.trim(),
        schedule: buildSchedule(),
        agent: form.agent,
        model_provider: form.modelProvider,
        model: form.model,
        cwd_mode: form.cwdMode,
      });
      onCreated?.(created);
      onClose();
    } catch (error) {
      const message = getErrorMessage(error);
      setLastError(message);
      toast({
        title: t('automations.toast.createFailed'),
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsMutating(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!existingTask || !canSubmit) return;
    setIsMutating(true);
    setLastError(null);
    try {
      const updated = await updateAutomation({
        id: existingTask.id,
        name: form.name.trim(),
        projects: form.selectedProjects,
        prompt: form.prompt.trim(),
        schedule: buildSchedule(),
        agent: form.agent,
        model_provider: form.modelProvider,
        model: form.model,
        cwd_mode: form.cwdMode,
      });
      onUpdated(updated);
      toast({ title: t('automations.toast.updated') });
    } catch (error) {
      const message = getErrorMessage(error);
      setLastError(message);
      toast({
        title: t('automations.toast.updateFailed'),
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsMutating(false);
    }
  };

  const handleSaveAndResume = async () => {
    if (!existingTask || !canSubmit) return;
    setIsMutating(true);
    setLastError(null);
    try {
      const updated = await updateAutomation({
        id: existingTask.id,
        name: form.name.trim(),
        projects: form.selectedProjects,
        prompt: form.prompt.trim(),
        schedule: buildSchedule(),
        agent: form.agent,
        model_provider: form.modelProvider,
        model: form.model,
        cwd_mode: form.cwdMode,
      });
      const resumed = updated.paused ? await setAutomationPaused(updated.id, false) : updated;
      onUpdated(resumed);
      toast({ title: t('automations.toast.updatedAndResumed') });
    } catch (error) {
      const message = getErrorMessage(error);
      setLastError(message);
      toast({
        title: t('automations.toast.updateFailed'),
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsMutating(false);
    }
  };

  const handleTogglePause = async () => {
    if (!existingTask) return;
    setIsMutating(true);
    try {
      const updated = await setAutomationPaused(existingTask.id, !existingTask.paused);
      onUpdated(updated);
    } catch (error) {
      const message = getErrorMessage(error);
      toast({
        title: t('automations.toast.updateFailed'),
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsMutating(false);
    }
  };

  const handleDelete = async () => {
    if (!existingTask) return;
    setIsMutating(true);
    setLastError(null);
    try {
      await deleteAutomation(existingTask.id);
      onDeleted(existingTask.id);
      onClose();
    } catch (error) {
      const message = getErrorMessage(error);
      setLastError(message);
      toast({
        title: t('automations.toast.deleteFailed'),
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsMutating(false);
      setConfirmDelete(false);
    }
  };

  if (!open) return null;

  const allProjectOptions = [...new Set([...projects, ...form.selectedProjects])];
  const selectedProjectLine = form.selectedProjects
    .map((project) => getFilename(project) || project)
    .join(', ');

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isCreate ? (
              t('automations.manage.newTitle')
            ) : (
              <>
                <span className="truncate">{existingTask?.name}</span>
                {existingTask?.paused && (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                    {t('automations.manage.paused')}
                  </span>
                )}
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isCreate
              ? t('automations.manage.createDescription')
              : t('automations.manage.editDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {lastError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {lastError}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="manage-name">{t('automations.manage.name')}</Label>
            <Input
              id="manage-name"
              placeholder={t('automations.manage.namePlaceholder')}
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
            />
          </div>

          <Label>{t('automations.manage.model')}</Label>
          <div className="flex">
            <CodexModelSelector
              provider={form.modelProvider}
              onProviderChange={(value) => {
                setForm((prev) => ({
                  ...prev,
                  modelProvider: value,
                  model: getDefaultModel(prev.agent, value),
                }));
              }}
              value={form.model}
              onValueChange={(value: string) => setField('model', value)}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('automations.manage.projects')}</Label>
            <Popover
              open={projectSelectOpen}
              onOpenChange={(nextOpen) => {
                setProjectSelectOpen(nextOpen);
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-haspopup="listbox"
                  aria-expanded={projectSelectOpen}
                  aria-controls="project-select-list"
                  className="w-full justify-between gap-2 font-normal"
                >
                  <span className="min-w-0 flex-1 truncate text-left">
                    {selectedProjectLine || t('automations.manage.selectProjects')}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
                <Command>
                  <CommandInput placeholder={t('automations.manage.searchProjects')} />
                  <CommandList id="project-select-list" className="max-h-56">
                    <CommandEmpty>
                      {isCreate
                        ? t('automations.manage.noWorkspaceProjects')
                        : t('automations.manage.noProjects')}
                    </CommandEmpty>
                    {allProjectOptions.length > 0 && (
                      <CommandGroup heading={t('automations.manage.selectProjects')}>
                        {allProjectOptions.map((project) => {
                          const isSelected = form.selectedProjects.includes(project);
                          return (
                            <CommandItem
                              key={project}
                              onSelect={() => toggleProject(project)}
                              className="flex items-center justify-between gap-2"
                            >
                              <span className="truncate">{getFilename(project) || project}</span>
                              {isSelected && <Check className="h-4 w-4 text-primary" />}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>{t('automations.manage.runIn')}</Label>
            <Tabs
              value={form.cwdMode}
              onValueChange={(value) => setField('cwdMode', value as AutomationCwdMode)}
            >
              <TabsList className="h-8 w-full">
                <TabsTrigger value="worktree" className="flex-1 text-xs">
                  {t('automations.manage.gitWorktree')}
                </TabsTrigger>
                <TabsTrigger value="cwd" className="flex-1 text-xs">
                  {t('automations.manage.projectDirectory')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <p className="text-muted-foreground text-xs">
              {form.cwdMode === 'worktree'
                ? t('automations.manage.worktreeHint')
                : t('automations.manage.cwdHint')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="manage-prompt">{t('automations.manage.prompt')}</Label>
            <Textarea
              id="manage-prompt"
              value={form.prompt}
              onChange={(e) => setField('prompt', e.target.value)}
              className="min-h-24"
            />
          </div>

          <ScheduleEditor form={form} onChange={setField} />
        </div>

        {/* Footer varies by mode + sub-state */}
        {isCreate ? (
          <DialogFooter>
            <Button variant="ghost" disabled={isMutating} onClick={onClose}>
              {t('automations.manage.cancel')}
            </Button>
            <Button onClick={() => void handleCreate()} disabled={!canSubmit || isMutating}>
              {isMutating ? t('automations.manage.adding') : t('automations.manage.add')}
            </Button>
          </DialogFooter>
        ) : confirmDelete ? (
          <DialogFooter className="gap-2">
            <span className="mr-auto self-center text-sm text-muted-foreground">
              {t('automations.manage.confirmDelete')}
            </span>
            <Button variant="ghost" disabled={isMutating} onClick={() => setConfirmDelete(false)}>
              {t('automations.manage.cancel')}
            </Button>
            <Button variant="destructive" disabled={isMutating} onClick={() => void handleDelete()}>
              {isMutating ? t('automations.manage.deleting') : t('automations.manage.yesDelete')}
            </Button>
          </DialogFooter>
        ) : (
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              disabled={isMutating}
              onClick={() => setConfirmDelete(true)}
              className="mr-auto text-destructive hover:text-destructive"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {t('automations.manage.delete')}
            </Button>
            <Button
              variant="outline"
              disabled={isMutating}
              onClick={() => void handleTogglePause()}
            >
              {existingTask?.paused
                ? t('automations.manage.resume')
                : t('automations.manage.pause')}
            </Button>
            {existingTask?.paused && (
              <Button
                variant="secondary"
                onClick={() => void handleSaveAndResume()}
                disabled={!canSubmit || isMutating}
              >
                {isMutating
                  ? t('automations.manage.saving')
                  : t('automations.manage.saveAndResume')}
              </Button>
            )}
            <Button onClick={() => void handleSaveEdit()} disabled={!canSubmit || isMutating}>
              {isMutating ? t('automations.manage.saving') : t('automations.manage.save')}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
