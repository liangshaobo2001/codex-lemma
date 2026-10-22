import { describe, expect, it } from 'vitest';
import type { ServerNotification } from '@/bindings';
import { codexUserTurns, deriveRenderItems } from './deriveRenderItems';

const itemEvent = (
  method: 'item/started' | 'item/completed',
  item: Record<string, unknown>,
  turnId = 'turn1'
): ServerNotification =>
  ({
    method,
    params: { item, threadId: 't1', turnId, startedAtMs: 0, completedAtMs: 0 },
  }) as unknown as ServerNotification;

const turnCompleted = (
  id: string,
  status: 'completed' | 'interrupted' = 'completed',
  durationMs: number | null = 65_000
): ServerNotification =>
  ({
    method: 'turn/completed',
    params: { threadId: 't1', turn: { id, status, durationMs, items: [] } },
  }) as unknown as ServerNotification;

const user = (turnId = 'turn1') =>
  itemEvent('item/started', { type: 'userMessage', id: `u-${turnId}`, content: [] }, turnId);
const reasoning = (id: string, turnId = 'turn1') =>
  itemEvent('item/completed', { type: 'reasoning', id, summary: [], content: [] }, turnId);
const message = (id: string, text: string, turnId = 'turn1') =>
  itemEvent('item/completed', { type: 'agentMessage', id, text }, turnId);

describe('deriveRenderItems turn folding', () => {
  it('folds a completed turn between the user message and the final answer', () => {
    const items = deriveRenderItems([
      user(),
      reasoning('r1'),
      message('m1', 'Looking around'),
      reasoning('r2'),
      message('m2', 'All done'),
      turnCompleted('turn1'),
    ]);

    expect(items.map((item) => item.kind)).toEqual(['event', 'turn', 'event', 'event']);
    const turn = items[1];
    if (turn.kind !== 'turn') throw new Error('expected a turn item');
    expect(turn.durationMs).toBe(65_000);
    expect(turn.stepCount).toBe(2);
    expect(turn.items.map((item) => item.kind)).toEqual(['chain', 'event', 'chain']);
  });

  it('keeps a running turn flat', () => {
    const items = deriveRenderItems([user(), reasoning('r1'), message('m1', 'Partial')]);
    expect(items.map((item) => item.kind)).toEqual(['event', 'chain', 'event']);
  });

  it('keeps an interrupted turn flat', () => {
    const items = deriveRenderItems([
      user(),
      reasoning('r1'),
      message('m1', 'Partial'),
      turnCompleted('turn1', 'interrupted'),
    ]);
    expect(items.some((item) => item.kind === 'turn')).toBe(false);
  });

  it('does not fold a turn that only answered', () => {
    const items = deriveRenderItems([user(), message('m1', 'Hi'), turnCompleted('turn1')]);
    expect(items.some((item) => item.kind === 'turn')).toBe(false);
  });

  it('folds each turn separately', () => {
    const items = deriveRenderItems([
      user('a'),
      reasoning('ra', 'a'),
      message('ma', 'A', 'a'),
      turnCompleted('a'),
      user('b'),
      reasoning('rb', 'b'),
      message('mb', 'B', 'b'),
      turnCompleted('b'),
    ]);
    expect(items.filter((item) => item.kind === 'turn').map((item) => item.key)).toEqual([
      'turn-a',
      'turn-b',
    ]);
  });
});

describe('codexUserTurns', () => {
  it('lists user messages by their row key for the turn navigator', () => {
    const ask = (text: string, turnId: string) =>
      itemEvent(
        'item/started',
        { type: 'userMessage', id: `u-${turnId}`, content: [{ type: 'text', text }] },
        turnId
      );
    const items = deriveRenderItems([
      ask('Find the bug', 'turn1'),
      message('m1', 'Found it', 'turn1'),
      turnCompleted('turn1'),
      ask('Fix it', 'turn2'),
    ]);

    expect(codexUserTurns(items)).toEqual([
      { id: 'event-0', text: 'Find the bug' },
      { id: 'event-3', text: 'Fix it' },
    ]);
  });
});

describe('deriveRenderItems step order', () => {
  const command = (id: string, status = 'completed', output = 'done') => ({
    type: 'commandExecution',
    id,
    command: 'echo fixture',
    cwd: '/test',
    status,
    commandActions: [],
    aggregatedOutput: output,
    exitCode: status === 'completed' ? 0 : null,
    durationMs: status === 'completed' ? 590_000 : null,
  });

  it('keeps a late command result above the final answer at its start position', () => {
    const items = deriveRenderItems([
      user(),
      itemEvent('item/started', command('cmd1', 'inProgress', '')),
      message('answer', 'Final answer'),
      turnCompleted('turn1'),
      itemEvent('item/completed', command('cmd1')),
    ]);

    expect(items.map((item) => item.kind)).toEqual(['event', 'turn', 'event', 'event']);
    const work = items[1];
    if (work.kind !== 'turn') throw new Error('expected work above the answer');
    const step = work.items[0];
    if (step.kind !== 'chain') throw new Error('expected a command chain');
    expect(step.steps).toEqual([{ item: command('cmd1'), running: false }]);
  });

  it('updates a running step in place without moving it below an interim message', () => {
    const start = itemEvent('item/started', command('cmd1', 'inProgress', ''));
    const before = deriveRenderItems([user(), start, message('progress', 'Still working')]);
    const after = deriveRenderItems([
      user(),
      start,
      message('progress', 'Still working'),
      itemEvent('item/completed', command('cmd1')),
    ]);

    expect(after.map((item) => item.kind)).toEqual(['event', 'chain', 'event']);
    const previous = before[1];
    const updated = after[1];
    if (previous.kind !== 'chain' || updated.kind !== 'chain') throw new Error('expected chains');
    expect(updated.key).toBe(previous.key);
    expect(previous.steps[0].running).toBe(true);
    expect(updated.steps).toEqual([{ item: command('cmd1'), running: false }]);
  });

  it('preserves launch order when parallel commands finish in reverse order', () => {
    const items = deriveRenderItems([
      user(),
      itemEvent('item/started', command('first', 'inProgress', '')),
      itemEvent('item/started', command('second', 'inProgress', '')),
      itemEvent('item/completed', command('second')),
      itemEvent('item/completed', command('first')),
      message('answer', 'Final answer'),
      turnCompleted('turn1'),
    ]);

    const work = items[1];
    if (work.kind !== 'turn') throw new Error('expected folded work');
    const chain = work.items[0];
    if (chain.kind !== 'chain') throw new Error('expected a command chain');
    expect(chain.steps.map((step) => step.item.id)).toEqual(['first', 'second']);
    expect(chain.steps.every((step) => !step.running)).toBe(true);
  });

  it('does not borrow completion data from another turn with the same item id', () => {
    const items = deriveRenderItems([
      user('a'),
      itemEvent('item/started', command('same', 'inProgress', ''), 'a'),
      turnCompleted('a', 'interrupted'),
      user('b'),
      itemEvent('item/started', command('same', 'inProgress', ''), 'b'),
      itemEvent('item/completed', command('same'), 'b'),
    ]);

    const chains = items.filter((item) => item.kind === 'chain');
    expect(chains).toHaveLength(2);
    expect(chains[0].steps[0].item).toEqual(command('same', 'inProgress', ''));
    expect(chains[1].steps[0].item).toEqual(command('same'));
  });
});
