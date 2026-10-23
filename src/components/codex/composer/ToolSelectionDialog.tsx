import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  readSessionTools,
  recheckSessionTools,
  saveSessionTools,
  type ToolSnapshot,
} from '@/services/apiAdapt/toolDiscovery';
import { codexService } from '@/services/codexService';
import { useComposerModel } from '../hooks/useComposerModel';
import { useCodexStore } from '../stores';
import { useSessionTools } from '../stores/useSessionTools';

export function ToolSelectionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('chat');
  const model = useComposerModel();
  const threadId = model.threadId;
  const [revision, setRevision] = useState(0);
  const context = `${threadId ?? ''}\n${model.modelProvider}\n${model.model}\n${revision}`;
  const contextRef = useRef(context);
  useLayoutEffect(() => {
    contextRef.current = context;
  }, [context]);
  const busy = useCodexStore((s) =>
    Boolean(threadId && s.threadStatusMap[threadId]?.type === 'active')
  );
  const saving = useSessionTools((s) => Boolean(threadId && s.pending[threadId]));
  const savedError = useSessionTools((s) => (threadId ? s.errors[threadId] : undefined));
  const [view, setView] = useState<ToolSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const unavailable = model.modelProvider === 'openai' || !model.modelProvider;

  useEffect(() => {
    setView(null);
    setError('');
    setLoading(false);
    setQuery('');
    if (!open || !threadId || unavailable || model.pending) return;
    let cancelled = false;
    setLoading(true);
    readSessionTools(threadId)
      .then((snapshot) => {
        if (cancelled || contextRef.current !== context) return;
        setView(snapshot);
        if (!useSessionTools.getState().pending[threadId])
          useSessionTools.getState().confirm(threadId, snapshot);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, threadId, model.pending, unavailable, context]);

  const prepare = async () => {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      await codexService.threadStart();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setLoading(false);
    }
  };
  const select = async (id: string | null, checked: boolean) => {
    if (!threadId || !view || busy || saving) return;
    const captured = threadId;
    const capturedContext = context;
    const selected =
      id === null
        ? []
        : checked
          ? [...new Set([...view.selected, id])]
          : view.selected.filter((key) => key !== id);
    setView({ ...view, selected });
    useSessionTools.getState().begin(captured);
    try {
      const snapshot = await saveSessionTools(captured, selected);
      if (snapshot.phase === 'unavailable') throw new Error(t('tools.unavailable'));
      useSessionTools.getState().confirm(captured, snapshot);
      if (contextRef.current === capturedContext) setView(snapshot);
    } catch (reason) {
      useSessionTools.getState().fail(captured, String(reason));
    }
  };
  const recheck = async () => {
    if (!threadId || loading || busy || saving) return;
    setLoading(true);
    setError('');
    try {
      await recheckSessionTools(threadId);
      setRevision((r) => r + 1);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setLoading(false);
    }
  };
  const editable = Boolean(view && view.phase !== 'unavailable');
  const selectedIds = new Set(view?.selected);
  const availableIds = new Set(view?.tools.map((tool) => tool.id));
  const filtered =
    view?.tools.filter((tool) =>
      `${tool.name} ${tool.group ?? ''} ${tool.description}`
        .toLowerCase()
        .includes(query.toLowerCase())
    ) ?? [];
  const missing = view?.selected.filter((id) => !availableIds.has(id)) ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('tools.title')}</DialogTitle>
          <DialogDescription>
            {t(
              unavailable || view?.phase === 'unavailable' ? 'tools.managed' : 'tools.description'
            )}
          </DialogDescription>
        </DialogHeader>
        {!unavailable && !threadId && (
          <Button disabled={loading || model.pending} onClick={prepare}>
            {t(loading ? 'common.loading' : 'tools.prepare')}
          </Button>
        )}
        {!unavailable && threadId && (
          <>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>
                {loading
                  ? t('common.loading')
                  : t(
                      `tools.mode.${view?.phase === 'unavailable' ? 'unavailable' : view?.model === model.model ? (view?.mode ?? 'waiting') : 'waiting'}`
                    )}
              </span>
              {view?.phase !== 'unavailable' && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loading || saving || busy}
                  onClick={recheck}
                >
                  {t('tools.recheck')}
                </Button>
              )}
            </div>
            {(error || savedError || view?.error) && (
              <p role="alert" className="text-sm text-foreground">
                {error || savedError || view?.error}
              </p>
            )}
            {savedError && (
              <Button
                variant="outline"
                disabled={saving || loading}
                onClick={() => setRevision((r) => r + 1)}
              >
                {t('tools.reload')}
              </Button>
            )}
            {editable && view && (
              <>
                <p className="text-sm text-muted-foreground">{t('tools.fallback')}</p>
                {!view.catalogReady && (
                  <p className="text-xs text-muted-foreground">{t('tools.catalogPending')}</p>
                )}
                <Input
                  aria-label={t('tools.search')}
                  placeholder={t('tools.search')}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {busy && <p className="text-xs text-muted-foreground">{t('tools.busy')}</p>}
                <div className="max-h-[45vh] overflow-y-auto space-y-1">
                  {filtered.map((tool) => (
                    <label
                      key={tool.id}
                      title={tool.description}
                      className="flex items-start gap-3 rounded-md p-2 hover:bg-muted"
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={selectedIds.has(tool.id)}
                        disabled={busy || saving || loading}
                        onCheckedChange={(checked) => {
                          void select(tool.id, checked === true);
                        }}
                      />
                      <span className="min-w-0 text-sm">
                        <span className="block truncate">{tool.name}</span>
                        <span className="block text-xs text-muted-foreground truncate">
                          {tool.group?.replace(/^mcp__/, '')}
                        </span>
                      </span>
                    </label>
                  ))}
                  {filtered.length === 0 && (
                    <p className="py-4 text-sm text-muted-foreground">
                      {t(query ? 'tools.noMatches' : 'tools.empty')}
                    </p>
                  )}
                </div>
                {missing.length > 0 && (
                  <p role="status" className="text-xs text-muted-foreground">
                    {t('tools.missing', { count: missing.length })}
                  </p>
                )}
                {view.selected.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy || saving || loading}
                    onClick={() => {
                      void select(null, false);
                    }}
                  >
                    {t('tools.clear')}
                  </Button>
                )}
                {saving && (
                  <p role="status" className="text-xs text-muted-foreground">
                    {t('tools.saving')}
                  </p>
                )}
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">{t('tools.details')}</summary>
                  <p className="pt-2">{t('tools.help')}</p>
                </details>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
