import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@/lib/i18n';
import { MessageScrollerItem } from '@/components/ui/message-scroller';
import { ThreadScroller } from './ThreadScroller';

const turns = [
  { id: 'u1', text: 'Find the bug' },
  { id: 'u2', text: 'Now add a test' },
];

function renderThread() {
  return render(
    <ThreadScroller turns={turns}>
      {turns.map((turn) => (
        <MessageScrollerItem key={turn.id} messageId={turn.id} scrollAnchor>
          {turn.text}
        </MessageScrollerItem>
      ))}
    </ThreadScroller>
  );
}

describe('ThreadScroller', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists user messages on the rail and marks the current turn', async () => {
    renderThread();

    expect(screen.getByRole('navigation', { name: 'User messages' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Find the bug' })).toBeTruthy();
    // Without layout every anchor sits at the reading line, so the last one is current.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Now add a test' }).getAttribute('aria-current')
      ).toBe('true')
    );
  });

  it('jumps to a user message from the rail', () => {
    const scrollTo = vi.fn();
    HTMLElement.prototype.scrollTo = scrollTo;
    // Place the first turn below the fold so jumping to it has to scroll.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      const top = this.dataset.messageId === 'u1' ? 400 : 0;
      return { top, bottom: top + 20, left: 0, right: 0, width: 0, height: 20 } as DOMRect;
    });
    renderThread();

    fireEvent.click(screen.getByRole('button', { name: 'Find the bug' }));

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 400, behavior: 'smooth' }));
  });

  it('hides the rail for a single turn', () => {
    render(
      <ThreadScroller turns={turns.slice(0, 1)}>
        <MessageScrollerItem messageId="u1" scrollAnchor>
          Find the bug
        </MessageScrollerItem>
      </ThreadScroller>
    );

    expect(screen.queryByRole('navigation', { name: 'User messages' })).toBeNull();
  });
});
