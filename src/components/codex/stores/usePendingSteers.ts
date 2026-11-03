import { create } from 'zustand';
import type { ServerNotification } from '@/bindings';
import type { ThreadItem, UserInput } from '@/bindings/v2';

export interface PendingSteer {
  id: string;
  threadId: string;
  turnId: string;
  content: UserInput[];
  status: 'sending' | 'accepted' | 'failed';
  error?: string;
}

// Text annotations are supplied by the server; compare only the submitted content.
const fingerprint = (content: UserInput[]) => JSON.stringify(content.map((item) => {
  if (item.type === 'text') return ['text', item.text];
  if (item.type === 'localImage') return ['localImage', item.path];
  if (item.type === 'image') return ['image', 'url' in item ? item.url : item.fileId];
  return item;
}));

interface PendingSteers {
  items: PendingSteer[];
  observed: string[];
  begin: (threadId: string, turnId: string, content: UserInput[]) => string;
  update: (id: string, status: PendingSteer['status'], error?: string) => void;
  remove: (id: string) => void;
  observe: (threadId: string, event: ServerNotification) => void;
  reconcile: (threadId: string, entries: Array<{ turnId: string; item: ThreadItem }>) => void;
}

// Keep transport state separate from the authoritative transcript. An RPC acknowledgement
// means accepted for steering, not that the model has already consumed the message.
export const usePendingSteers = create<PendingSteers>((set, get) => ({
  items: [],
  observed: [],
  begin: (threadId, turnId, content) => {
    const id = crypto.randomUUID();
    set((state) => ({ items: [...state.items, { id, threadId, turnId, content, status: 'sending' }] }));
    return id;
  },
  update: (id, status, error) => set((state) => ({
    items: state.items.map((item) => item.id === id ? { ...item, status, error } : item),
  })),
  remove: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
  observe: (threadId, event) => {
    if ((event.method !== 'item/started' && event.method !== 'item/completed') || event.params.item.type !== 'userMessage') return;
    const { item, turnId } = event.params;
    const key = JSON.stringify([threadId, turnId, item.id]);
    set((state) => {
      if (state.observed.includes(key)) return state;
      const index = state.items.findIndex((pending) => pending.threadId === threadId &&
        (item.clientId
          ? pending.id === item.clientId
          : pending.turnId === turnId && fingerprint(pending.content) === fingerprint(item.content)));
      return {
        observed: [...state.observed, key].slice(-256),
        items: index < 0 ? state.items : state.items.filter((_, at) => at !== index),
      };
    });
  },
  reconcile: (threadId, entries) => {
    // History may arrive after a lost live notification or transport acknowledgement.
    // Only exact client IDs may confirm historical messages; old identical text must not.
    if (!get().items.some((pending) => pending.threadId === threadId)) return;
    const ids = new Set(entries.flatMap(({ item }) => item.type === 'userMessage' && item.clientId ? [item.clientId] : []));
    set((state) => ({ items: state.items.filter((pending) => pending.threadId !== threadId || !ids.has(pending.id)) }));
  },
}));
