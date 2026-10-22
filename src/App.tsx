import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { lazy, Suspense, useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';

import './App.css';

import { useCodexEvents } from '@/components/codex/hooks';
import { QuitDialog } from '@/components/dialogs';
import { AppLayout } from '@/components/layout';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { TodoCaptureHint } from '@/features/todos/TodoCaptureHint';
import { isDesktopTauri } from '@/hooks/runtime';
import { useAppDeepLink } from '@/hooks/useAppDeepLink';
import { useDoubleShiftCapture } from '@/hooks/useDoubleShiftCapture';
import { useUrlParamThread } from '@/hooks/useUrlParamThread';
import { hasActiveWork } from '@/lib/hasActiveWork';
import { i18n } from '@/lib/i18n';
import { initSettingsSync, loadSettings } from '@/lib/settings';
import { initializeCodexAsync } from '@/services/apiAdapt';
import type { InitializeResponse } from './bindings';

const AboutView = lazy(() => import('@/views/AboutView'));
const UsagePanel = lazy(() => import('@/views/UsagePanel'));

function AppShell() {
  const [quitDialogOpen, setQuitDialogOpen] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  // True once codex backend signals it is ready; only desktop Tauri has a
  // local backend to initialize — mobile and web talk to a remote one.
  const [codexReady, setCodexReady] = useState(!isDesktopTauri());

  useEffect(() => {
    loadSettings().finally(() => setSettingsReady(true));
  }, []);
  useEffect(() => initSettingsSync(), []);

  useEffect(() => {
    if (!isDesktopTauri()) {
      return;
    }

    // Resolves once the backend is up. After a webview reload the backend is already initialized,
    // so `codex:initialized` never fires again; without this the app stayed "not ready" (no event
    // listeners, no project sync) until restart.
    initializeCodexAsync()
      .then(() => setCodexReady(true))
      .catch((error) => {
        console.warn('Failed to initialize codex asynchronously', error);
      });

    // Listen for codex initialized event
    const unlisten = listen<InitializeResponse>('codex:initialized', (event) => {
      console.log('[App] Codex initialized, userAgent:', event.payload.userAgent);
      setCodexReady(true);
    });

    // Cmd+Q quits immediately when nothing is running, otherwise confirms first
    const unlistenQuit = listen('quit-requested', () => {
      hasActiveWork().then((active) => {
        if (active) {
          setQuitDialogOpen(true);
        } else {
          invoke('quit_app');
        }
      });
    });

    return () => {
      unlisten.then((fn) => fn());
      unlistenQuit.then((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen to codex events only after backend is initialized
  useCodexEvents(codexReady);

  // Shift-Shift on a text selection captures it as a todo
  useDoubleShiftCapture();

  // Web-mode deep link: ?agent=codex&thread=<id>&cwd=<path> (or agent=cc&session=<id>)
  useUrlParamThread(codexReady);

  // Wait for settings load before rendering
  if (!settingsReady) return null;

  return (
    <>
      <AppLayout />
      <TodoCaptureHint />
      <QuitDialog open={quitDialogOpen} onOpenChange={setQuitDialogOpen} />
    </>
  );
}

function AppEntry() {
  useAppDeepLink();
  return <AppShell />;
}

export default function App() {
  const isAboutWindow = window.location.pathname === '/about';
  const isUsageWindow = window.location.pathname === '/usage';

  return (
    <ThemeProvider>
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          {isUsageWindow ? (
            <Suspense>
              <UsagePanel />
            </Suspense>
          ) : isAboutWindow ? (
            <Suspense>
              <AboutView />
            </Suspense>
          ) : (
            <>
              <AppEntry />
              <Toaster />
            </>
          )}
        </TooltipProvider>
      </I18nextProvider>
    </ThemeProvider>
  );
}
