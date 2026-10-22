import { getCurrentWindow } from '@tauri-apps/api/window';
import { Copy, Minus, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isWindows } from '@/hooks/runtime';

/** Width the header rows reserve on the right for these buttons (3 x 46px). */
export const WINDOW_CONTROLS_WIDTH = 138;

/**
 * Minimise / maximise / close for the frameless Windows window (tauri.windows.conf.json sets
 * decorations: false), so the app has no separately coloured system title bar. Rendered once,
 * pinned to the top-right corner over the header rows, which leave WINDOW_CONTROLS_WIDTH free.
 */
export function WindowControls() {
  const { t } = useTranslation('app');
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isWindows()) return;
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    win.isMaximized().then(setMaximized);
    win
      .onResized(() => {
        win.isMaximized().then(setMaximized);
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, []);

  if (!isWindows()) return null;
  const win = getCurrentWindow();
  const btn =
    'inline-flex h-11 w-[46px] items-center justify-center text-foreground/70 transition-colors hover:bg-foreground/10 hover:text-foreground';

  return (
    <div className="fixed top-0 right-0 z-[60] flex select-none">
      <button
        type="button"
        className={btn}
        title={t('window.minimise')}
        onClick={() => win.minimize()}
      >
        <Minus className="size-4" />
      </button>
      <button
        type="button"
        className={btn}
        title={maximized ? t('window.restore') : t('window.maximise')}
        onClick={() => win.toggleMaximize()}
      >
        {maximized ? <Copy className="size-3.5 -scale-x-100" /> : <Square className="size-3.5" />}
      </button>
      <button
        type="button"
        className={`${btn} hover:bg-red-600 hover:text-white`}
        title={t('window.close')}
        onClick={() => win.close()}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
