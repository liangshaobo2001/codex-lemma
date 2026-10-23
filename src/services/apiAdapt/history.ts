import type { ThreadItem, Turn } from '@/bindings/v2';
import { postJsonWithOptions } from './shared';

export interface HistoryEntry {
  turnId: string;
  item: ThreadItem;
  truncated: boolean;
  detailCursor: string | null;
}
export interface HistoryPage {
  entries: HistoryEntry[];
  turns?: Turn[];
  reloadCursor?: string | null;
  nextCursor: string | null;
}
export const historyPage = (threadId: string, cursor: string | null = null) =>
  postJsonWithOptions<HistoryPage>(
    '/api/codex/thread/history/page',
    { threadId, cursor },
    { suppressToast: true }
  );
export const historyDetail = (threadId: string, cursor: string, offset = 0) =>
  postJsonWithOptions<{ text: string; nextOffset: number | null }>(
    '/api/codex/thread/history/detail',
    { threadId, cursor, offset },
    { suppressToast: true }
  );
