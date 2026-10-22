import type { ServerNotification } from '@/bindings';
import type {
  Account,
  CommandExecutionStatus,
  GuardianApprovalReviewAction,
  Thread,
  ThreadGoal,
  ThreadStatus,
  ThreadTokenUsage,
} from '@/bindings/v2';

/**
 * Per-thread turn timing, fed by turn/started + turn/completed + error.
 * Deliberately independent of thread/status/changed, which carries no
 * timestamps and races with the turn events on error/interrupt.
 */
export interface TurnTiming {
  turnId: string;
  /** ms since epoch, from turn/started's turn.startedAt (server clock). */
  startedAtMs: number;
  /** Set once the turn completes/fails/is interrupted (turn/completed). */
  durationMs: number | null;
  /** Last known turn status; 'inProgress' while active. */
  status: 'inProgress' | 'completed' | 'interrupted' | 'failed';
}

export interface ThreadsSlice {
  threads: Thread[];
  currentThreadId: string | null;
  currentTurnId: string | null;
  hasAccount: boolean | null;
  /** Logged-in account details, null when signed out or not yet resolved. */
  account: Account | null;
  activeThreadIds: string[]; // Track resumed/active threads
  inputFocusTrigger: number; // Increment to trigger focus in InputArea
  threadListNextCursor: string | null;

  setCurrentThreadId: (id: string | null) => void;
  setThreads: (threads: Thread[]) => void;
  appendThreads: (threads: Thread[]) => void;
  setThreadListNextCursor: (cursor: string | null) => void;
  setAccount: (account: Account | null) => void;
  triggerInputFocus: () => void;

  // Selectors
  getCurrentThread: () => Thread | null;
}

export interface EventsSlice {
  events: Record<string, ServerNotification[]>; // Events per thread
  /** Per-thread status derived from thread/status/changed (authoritative) and turn events (fallback) */
  threadStatusMap: Record<string, ThreadStatus>;
  /** Per-thread timing of the most recent turn, see TurnTiming for why this is separate from threadStatusMap. */
  turnTimingMap: Record<string, TurnTiming>;
  /** Command status map: itemId -> CommandExecutionStatus */
  commandStatusMap: Record<string, CommandExecutionStatus>;
  /** Command duration map: itemId -> durationMs, populated on item/completed for commandExecution. */
  commandDurationMap: Record<string, number | null>;
  /** Latest retryable error message per thread; shown on the working indicator, cleared by the next event. */
  retryNoticeMap: Record<string, string>;
  /** Auto-reviews still deciding, per thread: reviewId -> its action, from item/autoApprovalReview/*. */
  pendingReviewMap: Record<string, Record<string, GuardianApprovalReviewAction>>;
  /** Denied auto-reviews the user approved for one retry (reviewId -> true). */
  approvedDenialIds: Record<string, true>;
  /**
   * Live reasoning per item id: the text streamed by item/reasoning/*Delta (not kept in the transcript), when
   * it started, and how long it took once item/completed arrives. Drives the streaming thinking window.
   */
  reasoningLiveMap: Record<string, ReasoningLive>;
  /** Average output throughput of the last observed turn; includes waiting and tool time. */
  throughputMap: Record<
    string,
    {
      turnId: string;
      requests: number;
      ttftMs: number | null;
      outputTokens: number;
      durationMs: number | null;
      tokensPerSec: number | null;
    }
  >;
  /** Per-thread token usage from thread/tokenUsage/updated */
  tokenUsageMap: Record<string, ThreadTokenUsage>;
  /** Per-thread goal from thread/goal/updated */
  goalMap: Record<string, ThreadGoal>;
  /** Whether the goal-tracking button is shown in the composer toolbar. */
  goalEnabled: boolean;

  addEvent: (threadId: string, event: ServerNotification) => void;
  markDenialApproved: (reviewId: string) => void;
  setTokenUsage: (threadId: string, data: ThreadTokenUsage) => void;
  setRequestMetrics: (metrics: unknown) => void;
  setGoal: (threadId: string, goal: ThreadGoal) => void;
  clearGoal: (threadId: string) => void;
  setGoalEnabled: (goalEnabled: boolean) => void;
}

export interface ReasoningLive {
  text: string;
  startedAtMs: number;
  durationMs: number | null;
}

export type CodexStore = ThreadsSlice & EventsSlice;
