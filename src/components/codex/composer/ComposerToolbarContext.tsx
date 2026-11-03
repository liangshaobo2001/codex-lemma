import { type ReactNode, useLayoutEffect, useRef } from 'react';
import './ComposerToolbar.css';

const EXPANSION_MARGIN = 16;

/** Measure real control widths before paint without remounting live controls. */
export function ComposerToolbarProvider({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let currentLevel = 0;
    let frame: number | undefined;
    let disposed = false;

    const measure = () => {
      frame = undefined;
      if (disposed) return;
      const available = el.getBoundingClientRect().width;
      if (available <= 0) return;
      const style = getComputedStyle(el);
      // Bounding rectangles include CSS zoom, while computed gap/margin use CSS pixels.
      const cssWidth = Number.parseFloat(style.width);
      const scale = cssWidth > 0 ? available / cssWidth : 1;
      const gap = (Number.parseFloat(style.columnGap) || 0) * scale;
      let chosen = 3;
      // Each temporary level is measured synchronously before the next paint.
      // Labels remain mounted, so focus and open menus keep their identity.
      for (let level = 0; level <= 3; level++) {
        el.dataset.toolbarLevel = String(level);
        const groups = Array.from(el.children);
        const required = groups.reduce((sum, group) => sum + group.getBoundingClientRect().width, 0)
          + Math.max(0, groups.length - 1) * gap;
        const margin = level < currentLevel ? EXPANSION_MARGIN * scale : 0;
        if (required + margin <= available) {
          chosen = level;
          break;
        }
      }
      currentLevel = chosen;
      el.dataset.toolbarLevel = String(chosen);
    };
    const schedule = () => {
      if (!disposed && frame === undefined) frame = requestAnimationFrame(measure);
    };

    measure();
    const resize = new ResizeObserver(schedule);
    resize.observe(el);
    for (const group of el.children) resize.observe(group);
    // Model/effort text, widget settings and active-turn buttons also affect fit.
    // Do not observe attributes: our own measurement attributes must not loop.
    const changes = new MutationObserver(schedule);
    changes.observe(el, { childList: true, subtree: true, characterData: true });
    document.fonts?.addEventListener('loadingdone', schedule);
    return () => {
      disposed = true;
      resize.disconnect();
      changes.disconnect();
      document.fonts?.removeEventListener('loadingdone', schedule);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, []);

  return <div ref={ref} data-composer-toolbar="" className={className}>{children}</div>;
}
