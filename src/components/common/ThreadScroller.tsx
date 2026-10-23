import { cn } from 'cn';
import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
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
  pagingRef,
  followingRef,
}: {
  viewportRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  pagingRef: RefObject<boolean>;
  followingRef: RefObject<boolean>;
}) {
  const { scrollToEnd } = useMessageScroller();

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content || typeof ResizeObserver === 'undefined') return;

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
      if (pagingRef.current) return;
      if (gap <= BOTTOM_SLACK) followingRef.current = true;
      else if (dragging || Date.now() - intentAt < INTENT_WINDOW_MS) followingRef.current = false;
    };
    const follow = new ResizeObserver(() => {
      if (!followingRef.current || pagingRef.current) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (followingRef.current && !pagingRef.current) scrollToEnd({ behavior: 'auto' });
      });
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
  }, [viewportRef, contentRef, pagingRef, followingRef, scrollToEnd]);

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
  onLoadOlder?: () => Promise<void>;
  onLoadNewer?: () => Promise<void>;
  historyLoading?: boolean;
  historyError?: string | null;
  historyVersion?: unknown;
  manualScroll?: boolean;
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
  onLoadOlder,
  onLoadNewer,
  historyLoading = false,
  historyError,
  historyVersion,
  manualScroll = false,
}: ThreadScrollerProps) {
  const { t } = useTranslation('thread');
  const intentRef = useRef(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pagingRef = useRef(false);
  const followingRef = useRef(true);
  const anchorRef = useRef<{ id: string; top: number } | null>(null);
  const inFlightRef = useRef(false);
  const rememberAnchor = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const top = viewport.getBoundingClientRect().top;
    const nodes = Array.from(viewport.querySelectorAll<HTMLElement>('[data-message-id]'));
    const anchor = nodes.find(
      (node) => node.getBoundingClientRect().height > 0 && node.getBoundingClientRect().bottom > top
    );
    anchorRef.current = anchor?.dataset.messageId
      ? { id: anchor.dataset.messageId, top: anchor.getBoundingClientRect().top - top }
      : null;
  };
  const load = async (callback: (() => Promise<void>) | undefined) => {
    if (!callback || historyLoading || inFlightRef.current) return;
    inFlightRef.current = true;
    pagingRef.current = true;
    followingRef.current = false;
    rememberAnchor();
    try {
      await callback();
    } catch {
      /* The history controller exposes actionable errors. */
    } finally {
      inFlightRef.current = false;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const viewport = viewportRef.current;
          const anchor = anchorRef.current;
          if (viewport && anchor) {
            const element = Array.from(
              viewport.querySelectorAll<HTMLElement>('[data-message-id]')
            ).find((node) => node.dataset.messageId === anchor.id);
            if (element)
              viewport.scrollTop +=
                element.getBoundingClientRect().top -
                viewport.getBoundingClientRect().top -
                anchor.top;
          }
          anchorRef.current = null;
          pagingRef.current = false;
        })
      );
    }
  };
  useLayoutEffect(() => {
    if (historyVersion === undefined) return;
    const viewport = viewportRef.current;
    const anchor = anchorRef.current;
    if (!viewport || !anchor) return;
    const element = Array.from(viewport.querySelectorAll<HTMLElement>('[data-message-id]')).find(
      (node) => node.dataset.messageId === anchor.id
    );
    if (element)
      viewport.scrollTop +=
        element.getBoundingClientRect().top - viewport.getBoundingClientRect().top - anchor.top;
    if (!inFlightRef.current) anchorRef.current = null;
  }, [historyVersion]);
  return (
    <MessageScrollerProvider
      autoScroll={!manualScroll}
      defaultScrollPosition={manualScroll ? 'start' : 'end'}
    >
      <MessageScroller className={cn('@container/thread', className)}>
        <MessageScrollerViewport
          ref={viewportRef}
          style={onLoadOlder || onLoadNewer ? { overflowAnchor: 'none' } : undefined}
          onWheel={(event) => {
            intentRef.current = Date.now();
            const viewport = event.currentTarget;
            if (event.deltaY < 0 && viewport.scrollTop <= 160) load(onLoadOlder);
            if (
              event.deltaY > 0 &&
              viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 160
            )
              load(onLoadNewer);
          }}
          onPointerDown={(event) => {
            intentRef.current = (event.target as HTMLElement).closest('button') ? 0 : Date.now();
          }}
          onPointerMove={(event) => {
            if (event.buttons === 1) intentRef.current = Date.now();
          }}
          onTouchMove={() => {
            intentRef.current = Date.now();
          }}
          onKeyDown={(event) => {
            intentRef.current = Date.now();
            if (
              event.key === 'Home' ||
              (event.key === 'PageUp' && event.currentTarget.scrollTop <= 160)
            )
              load(onLoadOlder);
            if (event.key === 'End' && onLoadNewer) load(onLoadNewer);
          }}
          onScroll={(event) => {
            // Pointer/touch scrollbar navigation also reaches these edges. Avoid
            // auto-loading pages during the initial programmatic bottom scroll.
            if (pagingRef.current || Date.now() - intentRef.current > 300) return;
            const viewport = event.currentTarget;
            if (viewport.scrollTop <= 1) load(onLoadOlder);
            else if (viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 1)
              load(onLoadNewer);
          }}
        >
          {(onLoadOlder || historyError || historyLoading) && (
            <div className="flex flex-col items-center gap-1 py-2 text-sm text-muted-foreground">
              {historyError && <span role="alert">{historyError}</span>}
              {historyLoading && !onLoadOlder && <output>{t('history.loading')}</output>}
              {onLoadOlder && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={historyLoading}
                  onClick={() => load(onLoadOlder)}
                >
                  {historyLoading ? t('history.loading') : t('history.older')}
                </Button>
              )}
            </div>
          )}
          <MessageScrollerContent
            ref={contentRef}
            className={cn(THREAD_COLUMN, 'gap-2 py-4 *:empty:hidden', contentClassName)}
          >
            {children}
            {onLoadNewer && (
              <div className="flex justify-center py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={historyLoading}
                  onClick={() => load(onLoadNewer)}
                >
                  {historyLoading ? t('history.loading') : t('history.newer')}
                </Button>
              </div>
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <StickToBottom
          viewportRef={viewportRef}
          contentRef={contentRef}
          pagingRef={pagingRef}
          followingRef={followingRef}
        />
        <TurnNavigator turns={turns} />
        {jumpButton && <MessageScrollerButton />}
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
