import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { type HistoryEntry, historyDetail } from '@/services/apiAdapt/history';

export function HistoryRecord({ entry, threadId }: { entry: HistoryEntry; threadId: string }) {
  const { t } = useTranslation('thread');
  const [open, setOpen] = useState(false);
  const [offsets, setOffsets] = useState([0]);
  const [data, setData] = useState<{ text: string; nextOffset: number | null }>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const offset = offsets[offsets.length - 1] ?? 0;
  const item = entry.item;
  const preview =
    item.type === 'agentMessage'
      ? item.text
      : item.type === 'userMessage'
        ? (item.content ?? []).flatMap((v) => (v.type === 'text' ? [v.text] : [])).join('\n')
        : item.type === 'commandExecution'
          ? [item.command, item.aggregatedOutput].filter(Boolean).join('\n')
          : item.type === 'reasoning'
            ? [...(item.summary ?? []), ...(item.content ?? [])].join('\n')
            : JSON.stringify(item, null, 2);
  useEffect(() => {
    if (!open || !entry.detailCursor) return;
    let canceled = false;
    setLoading(true);
    setError(undefined);
    setData(undefined);
    historyDetail(threadId, entry.detailCursor, offset)
      .then((value) => {
        if (!canceled) setData(value);
      })
      .catch((e: unknown) => {
        if (!canceled) setError(String(e));
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [open, entry.detailCursor, threadId, offset]);
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-muted-foreground">
        {preview}
      </pre>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setOffsets([0]);
          setOpen(true);
        }}
      >
        {t('history.fullRecord')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t('history.fullRecord')}</DialogTitle>
          </DialogHeader>
          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words text-xs">
            {error ?? (loading ? t('history.loading') : data?.text)}
          </pre>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={loading || offsets.length === 1}
              onClick={() => setOffsets((v) => v.slice(0, -1))}
            >
              {t('history.previous')}
            </Button>
            <Button
              variant="outline"
              disabled={loading || data?.nextOffset == null}
              onClick={() => {
                const nextOffset = data?.nextOffset;
                if (nextOffset != null) setOffsets((v) => [...v, nextOffset]);
              }}
            >
              {t('history.next')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
