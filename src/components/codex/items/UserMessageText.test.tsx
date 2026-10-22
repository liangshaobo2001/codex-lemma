import '@/lib/i18n';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/components/Markdown', () => ({ Markdown: ({ value }: { value: string }) => <div>{value}</div> }));
import { UserMessageText } from './UserMessageText';
let height = 100;
const observers = new Set<() => void>();
beforeEach(() => {
  height = 100;
  observers.clear();
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => height);
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: () => void) { observers.add(callback); }
    observe() {}
    disconnect() { observers.delete(this.callback); }
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('user message preview', () => {
  it('keeps short messages fully visible without an expand button', () => {
    render(<UserMessageText text="A short message"/>);
    expect(screen.getByText('A short message')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('collapses wrapped text by rendered height, and preserves all content when toggling', () => {
    height = 900;
    const text = 'One long paragraph without explicit newlines. '.repeat(90);
    render(<UserMessageText text={text}/>);
    const button = screen.getByRole('button', {name:'Expand message'});
    const viewport = document.getElementById(button.getAttribute('aria-controls')!)!;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(Number.parseFloat(viewport.style.maxHeight)).toBeGreaterThan(200);
    expect(Number.parseFloat(viewport.style.maxHeight)).toBeLessThan(500);
    expect(viewport.textContent).toBe(text);
    fireEvent.click(button);
    expect(screen.getByRole('button',{name:'Collapse message'}).getAttribute('aria-expanded')).toBe('true');
    expect(viewport.style.maxHeight).toBe('');
    fireEvent.click(screen.getByRole('button',{name:'Collapse message'}));
    expect(viewport.style.maxHeight).not.toBe('');
    expect(viewport.textContent).toBe(text);
  });
  it('remeasures when the viewport changes width', () => {
    render(<UserMessageText text="A paragraph that wraps when the window narrows"/>);
    expect(screen.queryByRole('button')).toBeNull();
    height = 900;
    act(() => { for (const callback of observers) callback(); });
    expect(screen.getByRole('button',{name:'Expand message'})).toBeTruthy();
    height = 100;
    act(() => { for (const callback of observers) callback(); });
    expect(screen.queryByRole('button')).toBeNull();
  });
});
