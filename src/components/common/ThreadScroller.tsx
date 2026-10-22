import { cn } from 'cn';
import { type ReactNode, type RefObject, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
  useMessageScrollerVisibility,
} from '@/components/ui/message-scroller';
import { THREAD_COLUMN } from './threadColumn';

/** A user message the navigator can jump to; `id` is its scroller item id. */
export type ThreadTurn = { id: string; text: string };

const preview = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * A rail of user messages at the thread's left edge, shown when the pane is wide
 * enough. The current turn's mark is highlighted; hover lists the messages and a
 * click jumps to one.
 */
export function TurnNavigator({ turns }: { turns: ThreadTurn[] }) {
  const { t } = useTranslation('chat');
  const { scrollToMessage } = useMessageScroller();
  const { currentAnchorId } = useMessageScrollerVisibility();

  if (turns.length < 2) return null;

  const jump = (id: string) => scrollToMessage(id, { behavior: 'smooth' });

  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <nav
          aria-label={t('message.userMessages')}
          className="no-scrollbar absolute top-1/2 left-3 z-10 hidden max-h-[60%] -translate-y-1/2 flex-col overflow-y-auto py-1 @5xl/thread:flex"
        >
          {turns.map((turn) => {
            const active = turn.id === currentAnchorId;
            return (
              <button
                key={turn.id}
                type="button"
                aria-label={preview(turn.text)}
                aria-current={active ? 'true' : undefined}
                onClick={() => jump(turn.id)}
                className="group/turn flex h-3 w-6 shrink-0 cursor-pointer items-center outline-none"
              >
                <span
                  className={cn(
                    'h-0.5 rounded-full transition-all duration-300',
                    active
                      ? 'w-5 bg-foreground shadow-[0_0_6px] shadow-foreground/40'
                      : 'w-3 bg-muted-foreground/60 group-hover/turn:w-4 group-hover/turn:bg-muted-foreground group-focus-visible/turn:bg-muted-foreground'
                  )}
                />
              </button>
            );
          })}
        </nav>
      </HoverCardTrigger>
      <HoverCardContent side="right" align="center" className="w-72 p-1">
        <div className="no-scrollbar flex max-h-80 flex-col overflow-y-auto">
          {turns.map((turn) => (
            <button
              key={turn.id}
              type="button"
              onClick={() => jump(turn.id)}
              className={cn(
                'truncate rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                turn.id === currentAnchorId && 'font-medium text-foreground'
              )}
            >
              {preview(turn.text)}
            </button>
          ))}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

// How close to the end counts as "at the bottom", in px.
const BOTTOM_SLACK = 24;
// A scroll this soon after wheel/touch/keyboard input is the reader's own.
const INTENT_WINDOW_MS = 300;

/**
 * Stick-to-bottom (local fork). The scroller pins each new user turn to the top and stops following, so a long
 * reply ran off the screen. While the reader is at the bottom this follows every content change to the end;
 * only the reader's own scroll away from the end releases it, and reaching the end again re-engages it.
 */
function StickToBottom({
  viewportRef,
  contentRef,
}: {
  viewportRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
}) {
  const { scrollToEnd } = useMessageScroller();

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content || typeof ResizeObserver === 'undefined') return;

    let stick = true;
    let intentAt = 0;
    let dragging = false;
    let frame = 0;
    const markIntent = () => {
      intentAt = Date.now();
    };
    const onPointerDown = () => {
      dragging = true; // the scrollbar thumb
      markIntent();
    };
    const onPointerUp = () => {
      dragging = false;
    };
    const onScroll = () => {
      const gap = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      if (gap <= BOTTOM_SLACK) stick = true;
      else if (dragging || Date.now() - intentAt < INTENT_WINDOW_MS) stick = false;
    };
    const follow = new ResizeObserver(() => {
      if (!stick) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => scrollToEnd({ behavior: 'auto' }));
    });

    viewport.addEventListener('wheel', markIntent, { passive: true });
    viewport.addEventListener('touchmove', markIntent, { passive: true });
    viewport.addEventListener('keydown', markIntent);
    viewport.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    viewport.addEventListener('scroll', onScroll, { passive: true });
    follow.observe(content);
    return () => {
      cancelAnimationFrame(frame);
      follow.disconnect();
      viewport.removeEventListener('wheel', markIntent);
      viewport.removeEventListener('touchmove', markIntent);
      viewport.removeEventListener('keydown', markIntent);
      viewport.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      viewport.removeEventListener('scroll', onScroll);
    };
  }, [viewportRef, contentRef, scrollToEnd]);

  return null;
}

type ThreadScrollerProps = {
  /** User messages for the navigator rail, in order. */
  turns: ThreadTurn[];
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Show the jump-to-latest button. */
  jumpButton?: boolean;
};

/**
 * The scrolling message area of a thread: follows streaming output while the
 * reader is at the bottom (StickToBottom), and offers a turn rail
 * and a jump-to-latest button. Children must be `MessageScrollerItem` rows.
 */
export function ThreadScroller({
  turns,
  children,
  className,
  contentClassName,
  jumpButton = true,
}: ThreadScrollerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className={cn('@container/thread', className)}>
        <MessageScrollerViewport ref={viewportRef}>
          <MessageScrollerContent
            ref={contentRef}
            className={cn(THREAD_COLUMN, 'gap-2 py-4 *:empty:hidden', contentClassName)}
          >
            {children}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <StickToBottom viewportRef={viewportRef} contentRef={contentRef} />
        <TurnNavigator turns={turns} />
        {jumpButton && <MessageScrollerButton />}
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
