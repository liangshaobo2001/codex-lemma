import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Cpu,
  Loader2,
  PlayCircle,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ServerNotification } from '@/bindings';
import type { Model } from '@/bindings/v2';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/components/ui/use-toast';
import { i18n } from '@/lib/i18n';
import type { AutomationTask } from '@/services/apiAdapt';
import { listModels, runAutomationNow, turnInterrupt } from '@/services/apiAdapt';
import { codexService } from '@/services/codexService';
import { useLayoutStore } from '@/stores';
import { useAgentSettingsStore } from '@/stores/useAgentSettingsStore';
import { getErrorMessage } from '@/utils/errorUtils';
import { getFilename } from '@/utils/getFilename';
import type { RunMeta } from './useAutomationRuns';
import { useRunEvents } from './useAutomationRuns';
import { describeSchedule, formatStartsIn, getNextRunAt } from './utils';

type TaskDetailPanelProps = {
  task: AutomationTask | null;
  now: Date;
  runs: RunMeta[];
  togglingPauseTaskId: string | null;
};

type OllamaModel = {
  id: string;
};

const OLLAMA_BASE_URL = 'http://localhost:11434/v1';

async function listOllamaModels(): Promise<OllamaModel[]> {
  const response = await fetch(`${OLLAMA_BASE_URL}/models`);
  if (!response.ok) {
    throw new Error(`Failed to load Ollama models: ${response.status}`);
  }
  const payload = (await response.json()) as { data?: Array<{ id?: string }> };
  return (payload.data ?? []).filter((item): item is OllamaModel => typeof item.id === 'string');
}

function agentLabel(agent: AutomationTask['agent']) {
  if (agent === 'bot') return i18n.t('features:automations.detail.bot');
  return agent === 'cc' ? 'Claude Agent' : 'Codex';
}

function providerLabel(provider: AutomationTask['model_provider']) {
  return provider === 'ollama' ? 'Ollama' : 'OpenAI';
}

function resolveModelProvider(task: AutomationTask): 'openai' | 'ollama' {
  const providerCandidate =
    (
      task as AutomationTask & {
        modelProvider?: string;
        model_provider?: string;
      }
    ).model_provider ?? (task as AutomationTask & { modelProvider?: string }).modelProvider;

  return providerCandidate === 'ollama' ? 'ollama' : 'openai';
}

function findActiveTurnId(events: ServerNotification[]): string | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event.method === 'turn/started') {
      return event.params.turn.id;
    }
    if (event.method === 'turn/completed' || event.method === 'error') {
      return null;
    }
  }
  return null;
}

type RunStatus = 'running' | 'completed' | 'failed' | 'idle';

function normalizeStoredStatus(status?: string): RunStatus {
  const normalized = status?.trim().toLowerCase();
  if (
    normalized === 'running' ||
    normalized === 'completed' ||
    normalized === 'failed' ||
    normalized === 'success' ||
    normalized === 'succeeded'
  ) {
    return normalized === 'success' || normalized === 'succeeded' ? 'completed' : normalized;
  }
  if (normalized === 'cancelled' || normalized === 'canceled' || normalized === 'interrupted') {
    return 'failed';
  }
  if (normalized === 'queued' || normalized === 'pending') {
    return 'idle';
  }
  if (normalized === 'error') return 'failed';
  return 'idle';
}

function deriveRunStatusFromEvents(events: ServerNotification[]): RunStatus {
  if (events.length === 0) return 'idle';
  for (let i = events.length - 1; i >= 0; i--) {
    const m = events[i].method;
    if (m === 'turn/completed') {
      const turn = (events[i] as Extract<ServerNotification, { method: 'turn/completed' }>).params
        .turn;
      if (turn.status === 'completed') return 'completed';
      return 'failed';
    }
    if (m === 'error') return 'failed';
    if (m === 'turn/started') return 'running';
  }
  return 'idle';
}

function StatusIcon({ status }: { status: RunStatus }) {
  if (status === 'running') return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />;
  if (status === 'completed') return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
  if (status === 'failed') return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  return null;
}

function RunRow({
  run,
  agent,
  onOpenRun,
}: {
  run: RunMeta;
  agent: AutomationTask['agent'];
  onOpenRun: (run: RunMeta) => Promise<void>;
}) {
  const { t } = useTranslation('features');
  const events = useRunEvents(run.threadId);
  const activeTurnId = agent === 'codex' ? findActiveTurnId(events) : null;
  const storedStatus = normalizeStoredStatus(run.status);
  const status =
    agent === 'codex'
      ? (() => {
          const fromEvents = deriveRunStatusFromEvents(events);
          return fromEvents === 'idle' ? storedStatus : fromEvents;
        })()
      : storedStatus;
  const [isCancelling, setIsCancelling] = useState(false);
  const statusLabel = status === 'idle' ? 'queued' : status;
  // A cc automation run is driven entirely in the backend, so it never shows up in the
  // UI's active session list; the runner aliases its client under the real session id,
  // which is enough for cc_interrupt to reach it.
  const canInterrupt =
    agent === 'codex' ? status === 'running' && Boolean(activeTurnId) : status === 'running';

  return (
    <div
      className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-muted/30 cursor-pointer"
      onClick={() => {
        void onOpenRun(run);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          void onOpenRun(run);
        }
      }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <div className="text-xs text-muted-foreground">
          {new Date(run.startedAt).toLocaleString()}
        </div>
        <div className="flex items-center gap-1.5">
          <StatusIcon status={status} />
          <span className="text-xs font-medium capitalize">
            {t(`automations.runStatus.${statusLabel}`)}
          </span>
        </div>
        {run.cwd && (
          <span className="truncate text-[10px] text-muted-foreground" title={run.cwd}>
            {run.cwd}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[10px]"
          onClick={(event) => {
            event.stopPropagation();
            void navigator.clipboard.writeText(run.threadId);
            toast({
              title:
                agent === 'cc'
                  ? t('automations.detail.sessionIdCopied')
                  : t('automations.detail.threadIdCopied'),
            });
          }}
        >
          <Copy className="mr-1 h-3 w-3" />
          {t('automations.detail.copyId')}
        </Button>
        {agent === 'codex' && canInterrupt && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[10px]"
            disabled={isCancelling}
            onClick={async (event) => {
              event.stopPropagation();
              setIsCancelling(true);
              try {
                if (!activeTurnId) {
                  return;
                }
                await turnInterrupt({ threadId: run.threadId, turnId: activeTurnId });
                toast({ title: t('automations.detail.interrupted') });
              } catch (error) {
                toast({
                  title: t('automations.detail.interruptFailed'),
                  description: getErrorMessage(error),
                  variant: 'destructive',
                });
              } finally {
                setIsCancelling(false);
              }
            }}
          >
            {isCancelling
              ? t('automations.detail.interrupting')
              : t('automations.detail.interrupt')}
          </Button>
        )}
      </div>
    </div>
  );
}

export function TaskDetailPanel({ task, now, runs, togglingPauseTaskId }: TaskDetailPanelProps) {
  const { t } = useTranslation('features');
  const [isRunningNow, setIsRunningNow] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [openAiModels, setOpenAiModels] = useState<Model[]>([]);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const { setView, setActiveSidebarTab } = useLayoutStore();
  const { setSelectedAgent } = useAgentSettingsStore();
  const resolvedModelProvider = task ? resolveModelProvider(task) : 'openai';

  const handleOpenRun = async (run: RunMeta) => {
    if (!task || task.agent !== 'codex') return;
    console.info('[TaskDetailPanel] Open codex run', { threadId: run.threadId, taskId: task.id });
    setSelectedAgent('codex');
    setActiveSidebarTab('codex');
    setView('agent');
    await codexService.setCurrentThread(run.threadId);
  };

  useEffect(() => {
    async function loadProviderModels() {
      if (!task || task.agent !== 'codex') {
        setOpenAiModels([]);
        setOllamaModels([]);
        return;
      }

      try {
        if (resolvedModelProvider === 'openai') {
          const response = await listModels();
          setOpenAiModels(response.data);
          setOllamaModels([]);
          return;
        }
        const models = await listOllamaModels();
        setOllamaModels(models);
        setOpenAiModels([]);
      } catch (error) {
        console.warn('[TaskDetailPanel] Failed to load provider models', error);
        setOpenAiModels([]);
        setOllamaModels([]);
      }
    }

    void loadProviderModels();
  }, [resolvedModelProvider, task]);

  const handleRunNow = async () => {
    if (!task) return;
    setIsRunningNow(true);
    try {
      await runAutomationNow(task.id);
      toast({
        title: t('automations.detail.triggered'),
        description: t('automations.detail.triggeredDescription', { name: task.name }),
      });
    } catch (error) {
      toast({
        title: t('automations.detail.runFailed'),
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setIsRunningNow(false);
    }
  };

  if (!task) {
    return (
      <Card>
        <CardContent className="flex min-h-60 items-center justify-center p-6 text-sm text-muted-foreground">
          {t('automations.detail.selectPrompt')}
        </CardContent>
      </Card>
    );
  }

  const nextRun = getNextRunAt(task.schedule, now);
  const countdown = formatStartsIn(nextRun, now);
  const isToggling = togglingPauseTaskId === task.id;
  const selectedOpenAiModel = openAiModels.find((candidate) => candidate.id === task.model);
  const selectedOllamaModel = ollamaModels.find((candidate) => candidate.id === task.model);
  const displayModel =
    task.agent === 'codex' && resolvedModelProvider === 'openai'
      ? selectedOpenAiModel?.displayName || task.model
      : task.agent === 'codex' && resolvedModelProvider === 'ollama'
        ? selectedOllamaModel?.id || task.model
        : task.model;

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CardTitle className="truncate text-base">{task.name}</CardTitle>
            {task.paused && (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {t('automations.paused')}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{describeSchedule(task.schedule)}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isRunningNow || isToggling}
            onClick={() => void handleRunNow()}
          >
            {isRunningNow ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                {t('automations.detail.running')}
              </>
            ) : (
              <>
                <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
                {t('automations.detail.runNow')}
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-5 pb-5">
        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-md px-1 py-1 text-left hover:bg-muted/40"
            >
              <p className="text-xs font-medium text-muted-foreground">
                {t('automations.detail.details')}
              </p>
              <ChevronRight
                className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${detailsOpen ? 'rotate-90' : ''}`}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-5 pt-1">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {t('automations.detail.nextRun')}
                </div>
                <p className="text-sm font-medium">
                  {task.paused
                    ? t('automations.paused')
                    : t('automations.startsIn', { time: countdown })}
                </p>
                {!task.paused && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {nextRun.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {' · '}
                    {nextRun.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </p>
                )}
              </div>

              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {t('automations.detail.runs')}
                </div>
                <p className="text-sm font-medium">{runs.length}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t('automations.detail.thisSession')}
                </p>
              </div>

              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  {t('automations.detail.created')}
                </div>
                <p className="text-sm font-medium">
                  {new Date(task.created_at).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              </div>
            </div>

            {/* Projects */}
            {task.projects.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  {t('automations.detail.projects')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {task.projects.map((p) => (
                    <Badge key={p} variant="secondary" className="max-w-[200px] truncate">
                      {getFilename(p) || p}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                {t('automations.detail.runtime')}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Cpu className="h-3 w-3" />
                  {agentLabel(task.agent)}
                </Badge>
                {task.agent === 'codex' && (
                  <Badge variant="secondary">{providerLabel(resolvedModelProvider)}</Badge>
                )}
                <Badge variant="secondary" className="max-w-[260px] truncate">
                  {displayModel}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {task.projects.length === 0
                  ? t('automations.detail.runsInDefaultCwd')
                  : t('automations.detail.runsPerProject', { count: task.projects.length })}
              </p>
            </div>

            {/* Prompt preview */}
            <div className="flex flex-wrap gap-1.5">
              <p className="mb-1.5 w-full text-xs font-medium text-muted-foreground">
                {t('automations.detail.prompt')}
              </p>
              <p className="line-clamp-3 text-sm text-foreground/80">{task.prompt}</p>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Run history using EventItem — same as CodexThread */}
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {t('automations.detail.recentRuns')}
          </p>
          {runs.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              {t('automations.detail.noRuns')}
            </div>
          ) : (
            <ScrollArea className="h-72 rounded-lg border">
              <div className="divide-y">
                {runs.map((run) => (
                  <RunRow
                    key={run.threadId}
                    run={run}
                    agent={task.agent}
                    onOpenRun={handleOpenRun}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
