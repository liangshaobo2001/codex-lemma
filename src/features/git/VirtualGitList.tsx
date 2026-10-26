import { useVirtualizer } from '@tanstack/react-virtual';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { readGitScroll, saveGitScroll } from './virtualState';

interface Props<T> {
  items: readonly T[];
  itemKey: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  stateKey: string;
  selectedKey?: string | null;
  rowHeight?: number;
  label: string;
}

/** Keep DOM and component subscriptions proportional to the viewport. */
export function VirtualGitList<T>({
  items,
  itemKey,
  renderItem,
  stateKey,
  selectedKey,
  rowHeight,
  label,
}: Props<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(readGitScroll(stateKey) ?? 0);
  const previousSelection = useRef(readGitScroll(stateKey) === undefined ? null : selectedKey);
  const getItemKey = useCallback((index: number) => itemKey(items[index]), [items, itemKey]);
  const virtual = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    getItemKey,
    estimateSize: () => rowHeight ?? 42,
    overscan: 5,
    initialOffset: offsetRef.current,
  });
  useLayoutEffect(() => {
    if (!selectedKey || previousSelection.current === selectedKey) return;
    const index = items.findIndex((item) => itemKey(item) === selectedKey);
    if (index < 0) return;
    previousSelection.current = selectedKey;
    virtual.scrollToIndex(index, { align: 'auto' });
  }, [selectedKey, items, itemKey, virtual]);
  useEffect(() => () => saveGitScroll(stateKey, offsetRef.current), [stateKey]);
  return (
    <div
      ref={scrollRef}
      role="region"
      aria-label={label}
      className="flex-1 min-h-0 min-w-0 overflow-auto"
      style={{ overflowAnchor: 'none' }}
      onScroll={(event) => {
        offsetRef.current = event.currentTarget.scrollTop;
      }}
    >
      <div style={{ height: virtual.getTotalSize(), position: 'relative', width: '100%' }}>
        {virtual.getVirtualItems().map((row) => (
          <div
            key={row.key}
            data-index={row.index}
            data-git-row={itemKey(items[row.index])}
            ref={rowHeight ? undefined : virtual.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: rowHeight,
              transform: `translateY(${row.start}px)`,
            }}
          >
            {renderItem(items[row.index], row.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
