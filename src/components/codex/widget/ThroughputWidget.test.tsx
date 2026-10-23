import { useToolUsage } from '@/services/apiAdapt/toolUsage';
import '@/lib/i18n';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { state } = vi.hoisted(() => ({ state: { currentThreadId: 'thread', throughputMap: {}, lastThroughputMap: {}, tokenUsageMap: {} } as any }));
vi.mock('@/components/codex/stores/useCodexStore', () => ({useCodexStore: (selector: (s: unknown) => unknown) => selector(state)}));
vi.mock('@/stores/settings', () => ({useSettingsStore: (selector: (s: unknown) => unknown) => selector({composerWidgets:{speed:true,cache:true}})}));
import { ThroughputWidget } from './ThroughputWidget';
beforeEach(() => { useToolUsage.setState({usage:{}}); state.tokenUsageMap={}; state.throughputMap={}; state.lastThroughputMap={}; });
describe('composer metrics scope', () => {
  it('keeps the previous reading until the current turn has a valid replacement, without the approximate symbol', () => {
    state.lastThroughputMap.thread={turnId:'old',requests:2,ttftMs:900,tokensPerSec:80};
    state.throughputMap.thread={turnId:'new',requests:0,ttftMs:null,tokensPerSec:null};
    const {rerender}=render(<ThroughputWidget/>);
    expect(screen.getByText('80 tok/s').getAttribute('title')).toContain('earlier turn');
    expect(screen.queryByText(/≈/)).toBeNull();
    state.throughputMap.thread={turnId:'new',requests:1,ttftMs:700,tokensPerSec:75};
    rerender(<ThroughputWidget/>);
    expect(screen.getByText('75 tok/s').getAttribute('title')).not.toContain('earlier turn');
  });
  it('does not borrow a reading from a different session', () => {
    state.lastThroughputMap.other={turnId:'old',requests:2,ttftMs:900,tokensPerSec:80};
    render(<ThroughputWidget/>);
    expect(screen.queryByText('80 tok/s')).toBeNull();
  });
  it('uses cumulative session counts, with one decimal and an exact-count tooltip', () => {
    state.tokenUsageMap.thread={total:{inputTokens:1000,cachedInputTokens:800},last:{inputTokens:100,cachedInputTokens:100}};
    render(<ThroughputWidget/>);
    expect(screen.getByText('cache 80.0%').getAttribute('title')).toContain('800 of 1000 cumulative');
    expect(screen.queryByText('cache 100.0%')).toBeNull();
  });
  it('shows unavailable instead of zero for missing cache data', () => {
    render(<ThroughputWidget/>);
    expect(screen.getByText('cache —')).toBeTruthy();
  });
});

it('adds hidden discovery usage to the cache rate without changing native context counters',()=>{
  state.tokenUsageMap.thread={total:{inputTokens:100,cachedInputTokens:50},last:{inputTokens:100,totalTokens:105}};
  useToolUsage.getState().accept({threadId:'thread',usage:{inputTokens:100,cachedInputTokens:80,complete:true}});
  render(<ThroughputWidget/>);
  expect(screen.getByText('cache 65.0%').getAttribute('title')).toContain('130 of 200 cumulative');
  expect(state.tokenUsageMap.thread.last.totalTokens).toBe(105);
});
