/** Session-wide, token-weighted prompt-cache share. Missing or invalid counts stay unknown. */
export function formatCacheHit(
  cached: number | undefined,
  input: number | undefined
): string | null {
  if (
    cached === undefined ||
    input === undefined ||
    !Number.isSafeInteger(cached) ||
    !Number.isSafeInteger(input) ||
    input <= 0 ||
    cached < 0 ||
    cached > input
  )
    return null;
  if (cached === input) return '100.0';
  const percent = (cached / input) * 100;
  return percent.toFixed(1) === '100.0' ? '>99.9' : percent.toFixed(1);
}
