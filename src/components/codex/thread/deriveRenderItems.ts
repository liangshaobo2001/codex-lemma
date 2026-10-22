import type { ServerNotification } from '@/bindings';
import { isStepItem, type StepItem } from '../items/stepItems';
import type { StepEntry } from '../items/ThreadStepChain';
import { isHiddenWarning } from '../stores/hiddenWarnings';

/**
 * Intermediate render item: a raw event, a chain of consecutive steps, or a finished
 * turn's intermediate work folded under one summary line.
 */
export type RenderItem =
  | { kind: 'event'; event: ServerNotification; index: number }
  | { kind: 'chain'; key: string; turnId: string; steps: StepEntry[] }
  | {
      kind: 'turn';
      key: string;
      durationMs: number | null;
      stepCount: number;
      items: RenderItem[];
    };

// Events that render something other than a step, so they end the current chain.
function endsChain(event: ServerNotification): boolean {
  switch (event.method) {
    case 'item/started':
    case 'item/completed':
      return !isStepItem(event.params.item);
    case 'error':
    case 'warning':
    case 'turn/started':
    case 'turn/completed':
    case 'turn/plan/updated':
    case 'item/agentMessage/delta':
    case 'item/commandExecution/terminalInteraction':
    case 'item/autoApprovalReview/completed':
      return true;
    default:
      return false;
  }
}

function turnIdOf(item: RenderItem): string | null {
  if (item.kind === 'chain') return item.turnId;
  if (item.kind !== 'event') return null;
  const { event } = item;
  if (event.method === 'turn/started' || event.method === 'turn/completed') {
    return event.params.turn.id;
  }
  const params = event.params as { turnId?: unknown };
  return typeof params.turnId === 'string' ? params.turnId : null;
}

function isUserMessage(item: RenderItem): boolean {
  if (item.kind !== 'event') return false;
  const { event } = item;
  return (
    (event.method === 'item/started' || event.method === 'item/completed') &&
    event.params.item.type === 'userMessage'
  );
}

/** Id of the agent message an item renders, or null when it renders none. */
function agentMessageIdOf(item: RenderItem): string | null {
  if (item.kind !== 'event') return null;
  const { event } = item;
  if (event.method === 'item/agentMessage/delta') {
    return event.params.delta.trim() ? event.params.itemId : null;
  }
  if (event.method === 'item/completed' && event.params.item.type === 'agentMessage') {
    return event.params.item.text.trim() ? event.params.item.id : null;
  }
  return null;
}

/**
 * Folds each completed turn's work (steps, interim messages, plans) into one `turn`
 * item, leaving the user's message and the final answer visible. Turns that are still
 * running, were interrupted or failed, or ended without an answer stay flat.
 */
function foldCompletedTurns(
  items: RenderItem[],
  completedTurns: Map<string, number | null>
): RenderItem[] {
  const ranges: Array<{ start: number; end: number; turnId: string }> = [];

  for (const [turnId] of completedTurns) {
    // The fold starts after the user's message (`turn/started` may precede it).
    let first = -1;
    let answerId: string | null = null;
    for (let i = 0; i < items.length; i++) {
      if (turnIdOf(items[i]) !== turnId) continue;
      if (isUserMessage(items[i])) {
        first = -1;
        continue;
      }
      if (first === -1) first = i;
      answerId = agentMessageIdOf(items[i]) ?? answerId;
    }
    if (first === -1 || answerId === null) continue;
    const answerStart = items.findIndex(
      (item) => turnIdOf(item) === turnId && agentMessageIdOf(item) === answerId
    );
    if (answerStart <= first) continue;
    const hasWork = items
      .slice(first, answerStart)
      .some(
        (item) =>
          item.kind === 'chain' ||
          agentMessageIdOf(item) !== null ||
          (item.kind === 'event' && item.event.method === 'turn/plan/updated')
      );
    if (hasWork) ranges.push({ start: first, end: answerStart, turnId });
  }

  if (ranges.length === 0) return items;
  ranges.sort((a, b) => a.start - b.start);

  const result: RenderItem[] = [];
  let i = 0;
  for (const range of ranges) {
    if (range.start < i) continue;
    result.push(...items.slice(i, range.start));
    const folded = items.slice(range.start, range.end);
    result.push({
      kind: 'turn',
      key: `turn-${range.turnId}`,
      durationMs: completedTurns.get(range.turnId) ?? null,
      stepCount: folded.reduce((n, item) => n + (item.kind === 'chain' ? item.steps.length : 0), 0),
      items: folded,
    });
    i = range.end;
  }
  result.push(...items.slice(i));
  return result;
}

/**
 * Pre-process events into render items. Consecutive step items (thinking, commands, tool
 * calls) between messages are grouped into one chain; an `item/started` that has a matching
 * `item/completed` is folded into it, so each step shows once. A completed turn's work is
 * then folded above its final answer.
 */
export function deriveRenderItems(events: ServerNotification[]): RenderItem[] {
  const completedSteps = new Map<string, StepItem>();
  const completedTurnIds = new Set<string>();
  // Turns that finished normally, with their duration when known.
  const finishedTurns = new Map<string, number | null>();
  for (const event of events) {
    if (event.method === 'item/completed' && isStepItem(event.params.item)) {
      const { item, turnId } = event.params;
      completedSteps.set(JSON.stringify([turnId, item.id]), item);
    }
    if (event.method === 'turn/completed') {
      const { turn } = event.params;
      completedTurnIds.add(turn.id);
      if (turn.status === 'completed') finishedTurns.set(turn.id, turn.durationMs);
    }
  }

  const items: RenderItem[] = [];
  const seenSteps = new Set<string>();
  let chain: Extract<RenderItem, { kind: 'chain' }> | null = null;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (isHiddenWarning(event)) continue;

    if (event.method === 'item/started' || event.method === 'item/completed') {
      const { item, turnId } = event.params;
      if (isStepItem(item)) {
        const key = JSON.stringify([turnId, item.id]);
        if (seenSteps.has(key)) continue;
        seenSteps.add(key);
        // Keep the first-seen position and React key. A late completion updates the
        // existing step instead of moving it below messages that arrived meanwhile.
        const completed = completedSteps.get(key);
        if (!chain || chain.turnId !== turnId) {
          chain = { kind: 'chain', key: `chain-${i}`, turnId, steps: [] };
          items.push(chain);
        }
        // A step that never completed is only live while its turn is still open.
        const running =
          event.method === 'item/started' && !completed && !completedTurnIds.has(turnId);
        chain.steps.push({ item: completed ?? item, running });
        continue;
      }
    }

    if (endsChain(event)) chain = null;
    items.push({ kind: 'event', event, index: i });
  }

  return foldCompletedTurns(items, finishedTurns);
}

/** The user messages among top-level items, for the thread's turn navigator. */
export function codexUserTurns(items: RenderItem[]): { id: string; text: string }[] {
  return items.flatMap((item) => {
    if (item.kind !== 'event' || item.event.method !== 'item/started') return [];
    const started = item.event.params.item;
    if (started.type !== 'userMessage') return [];
    const text = started.content
      .flatMap((input) => (input.type === 'text' ? [input.text] : []))
      .join('');
    return [{ id: `event-${item.index}`, text: text || '(image)' }];
  });
}
