export interface RequestMetrics {
  threadId: string;
  turnId: string;
  requests: number;
  outputTokens: number;
  decodeMs: number;
  ttftMs: number;
  tokensPerSec: number;
}

export function isRequestMetrics(value: unknown): value is RequestMetrics {
  if (!value || typeof value !== 'object') return false;
  const m = value as RequestMetrics;
  return (
    typeof m.threadId === 'string' &&
    typeof m.turnId === 'string' &&
    Number.isSafeInteger(m.requests) &&
    m.requests > 0 &&
    Number.isSafeInteger(m.outputTokens) &&
    m.outputTokens > 0 &&
    Number.isSafeInteger(m.decodeMs) &&
    m.decodeMs >= 300 &&
    Number.isFinite(m.ttftMs) &&
    m.ttftMs >= 0 &&
    Number.isFinite(m.tokensPerSec) &&
    m.tokensPerSec > 0
  );
}
