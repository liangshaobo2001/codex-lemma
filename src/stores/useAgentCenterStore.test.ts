import { beforeEach, describe, expect, it } from 'vitest';
import { useAgentCenterStore } from './useAgentCenterStore';

describe('renameCard', () => {
  beforeEach(() =>
    useAgentCenterStore.setState({
      cards: [
        { kind: 'cc', id: 'old', preview: 'p' },
        { kind: 'codex', id: 'old' },
      ],
      currentAgentCardId: 'old',
    })
  );

  it('moves only the card of the given kind and follows the current card', () => {
    useAgentCenterStore.getState().renameCard('cc', 'old', 'new');
    const state = useAgentCenterStore.getState();
    expect(state.cards).toEqual([
      { kind: 'cc', id: 'new', preview: 'p' },
      { kind: 'codex', id: 'old' },
    ]);
    expect(state.currentAgentCardId).toBe('new');
  });
});
