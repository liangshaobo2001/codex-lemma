import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComposerToolbarProvider } from './ComposerToolbarContext';

let available = 700;
let extra = 0;
let scale = 1;
let nextFrame = 0;
const frames = new Map<number, FrameRequestCallback>();
const observers = new Set<() => void>();
const click = vi.fn();

function Fixture({ label = 'Model' }: { label?: string }) {
  return (
    <ComposerToolbarProvider>
      <div><span data-toolbar-approval-label="">Approve for me</span></div>
      <div>
        <span data-toolbar-metric-label="">80 tok/s</span>
        <span data-toolbar-model-details="">{label} · Medium</span>
        <button type="button" onClick={click}>Send</button>
      </div>
    </ComposerToolbarProvider>
  );
}

function flushFrames() {
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(0);
  });
}

function resize(width: number) {
  available = width;
  act(() => { for (const callback of observers) callback(); });
  flushFrames();
}

beforeEach(() => {
  available = 700;
  extra = 0;
  scale = 1;
  frames.clear();
  observers.clear();
  click.mockReset();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = ++nextFrame;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal('ResizeObserver', class {
    callback: () => void;
    constructor(callback: () => void) { this.callback = callback; }
    observe() { observers.add(this.callback); }
    disconnect() { observers.delete(this.callback); }
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.hasAttribute('data-composer-toolbar')) return new DOMRect(0, 0, available * scale, 32);
    const toolbar = this.closest<HTMLElement>('[data-composer-toolbar]');
    const level = Number(toolbar?.dataset.toolbarLevel ?? 0);
    const widths = [600, 440, 300, 180];
    return new DOMRect(0, 0, toolbar === this.parentElement ? (widths[level] + extra) * scale / 2 : 0, 32);
  });
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('progressive composer toolbar fit', () => {
  it('measures gaps in the same coordinate space as zoomed controls', () => {
    available = 607;
    scale = 1.25;
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ width: '607px', columnGap: '8px' } as CSSStyleDeclaration);
    const { container } = render(<Fixture />);
    expect(container.querySelector<HTMLElement>('[data-composer-toolbar]')!.dataset.toolbarLevel).toBe('1');
  });

  it('collapses in order without replacing the send button, including at extreme widths', () => {
    const { container } = render(<Fixture />);
    const toolbar = container.querySelector<HTMLElement>('[data-composer-toolbar]')!;
    const send = screen.getByRole('button', { name: 'Send' });
    expect(toolbar.dataset.toolbarLevel).toBe('0');
    for (const [width, level] of [[500, '1'], [350, '2'], [230, '3'], [80, '3']] as const) {
      resize(width);
      expect(toolbar.dataset.toolbarLevel).toBe(level);
      expect(screen.getByRole('button', { name: 'Send' })).toBe(send);
    }
    fireEvent.click(send);
    expect(click).toHaveBeenCalledOnce();
  });

  it('uses real content widths and leaves expansion room near a boundary', () => {
    available = 500;
    const { container } = render(<Fixture />);
    const toolbar = container.querySelector<HTMLElement>('[data-composer-toolbar]')!;
    expect(toolbar.dataset.toolbarLevel).toBe('1');
    resize(605);
    expect(toolbar.dataset.toolbarLevel).toBe('1');
    resize(620);
    expect(toolbar.dataset.toolbarLevel).toBe('0');
  });

  it('remeasures changed content without a window resize and cancels work on unmount', async () => {
    const { container, rerender, unmount } = render(<Fixture />);
    const toolbar = container.querySelector<HTMLElement>('[data-composer-toolbar]')!;
    extra = 250;
    await act(async () => { rerender(<Fixture label="A longer translated model" />); });
    flushFrames();
    expect(toolbar.dataset.toolbarLevel).toBe('1');
    expect(frames.size).toBe(0);
    act(() => { for (const callback of observers) callback(); });
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
    expect(observers.size).toBe(0);
  });
});
