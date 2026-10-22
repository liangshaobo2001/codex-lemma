import { describe, expect, it } from 'vitest';
import { formatCacheHit } from './cacheHit';

describe('session prompt cache share', () => {
  it('shows the screenshot request with one decimal', () => {
    expect(formatCacheHit(119327, 119600)).toBe('99.8');
  });
  it('weights all requests by input tokens, rather than averaging percentages or taking the last', () => {
    expect(formatCacheHit(0 + 990, 100 + 1000)).toBe('90.0');
  });
  it('distinguishes complete hits from rounded partial hits', () => {
    expect(formatCacheHit(1000, 1000)).toBe('100.0');
    expect(formatCacheHit(999999, 1000000)).toBe('>99.9');
    expect(formatCacheHit(0, 1000)).toBe('0.0');
  });
  it('does not turn missing or invalid counts into a cache result', () => {
    for (const [cached, input] of [[undefined, undefined], [0, 0], [-1, 10], [11, 10], [NaN, 10], [1, Infinity]]) {
      expect(formatCacheHit(cached, input)).toBeNull();
    }
  });
});
