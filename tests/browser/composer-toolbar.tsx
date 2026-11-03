import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { ArrowUp, ListPlus, Mic, Plus, Square } from 'lucide-react';
import { ComposerToolbarProvider } from '@/components/codex/composer/ComposerToolbarContext';
import { AccessModePopover } from '@/components/codex/composer/AccessModePopover';
import { AgentModelTrigger } from '@/components/agent/AgentModelTrigger';
import { ThroughputWidget } from '@/components/codex/widget/ThroughputWidget';
import { ContextWindowWidget } from '@/components/codex/widget/ContextWindowWidget';
import { useCodexStore, useConfigStore } from '@/components/codex/stores';
import { useThreadModels } from '@/components/codex/stores/useThreadModels';
import { useSettingsStore } from '@/stores/settings';
import { Button } from '@/components/ui/button';
import { i18n } from '@/lib/i18n';
import '@/App.css';

const params = new URLSearchParams(location.search);
useConfigStore.setState({ accessMode: 'auto' });
useSettingsStore.setState({ composerWidgets: { speed: true, cache: true, context: true, cost: false } });
const tokens = { totalTokens: 1000, inputTokens: 1000, cachedInputTokens: 800, cacheWriteInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0 };
useCodexStore.setState({
  currentThreadId: 'synthetic-toolbar',
  throughputMap: { 'synthetic-toolbar': { turnId: 'synthetic-turn', tokensPerSec: 80, requests: 1, ttftMs: 700, outputTokens: 80, durationMs: 1000 } },
  tokenUsageMap: { 'synthetic-toolbar': { total: tokens, last: tokens, modelContextWindow: 262144 } },
});
useThreadModels.getState().confirm('synthetic-toolbar', {
  model: params.get('long') ? 'very-long-custom-model-name-qwen3.8-flash-next-iq3_s' : 'qwen3.8-flash-next',
  modelProvider: 'fixture', reasoningEffort: 'medium',
});
void i18n.changeLanguage(params.get('lang') || 'en');

function Fixture() {
  const [active, setActive] = useState(false);
  const [sidebars, setSidebars] = useState(false);
  const [clicks, setClicks] = useState(0);
  return <main style={{ padding: 16 }}>
    <nav className="flex gap-4 mb-4">
      <button onClick={() => setActive(!active)}>Toggle active</button>
      <button onClick={() => setSidebars(!sidebars)}>Toggle panels</button>
      <output data-clicks>{clicks}</output>
    </nav>
    <div data-fixture-shell style={{ width: '100%', paddingLeft: sidebars ? 180 : 0, paddingRight: sidebars ? 180 : 0 }}>
      <div data-fixture-composer className="border rounded-xl px-1">
        <div className="h-20 p-3 text-muted-foreground">Synthetic composer</div>
        <ComposerToolbarProvider className="flex w-full min-w-0 items-center justify-between gap-2">
          <div className="flex shrink-0 items-center">
            <Button variant="ghost" size="icon" aria-label="Add attachment"><Plus /></Button>
            <AccessModePopover />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThroughputWidget /><ContextWindowWidget /><AgentModelTrigger onClick={() => setClicks(n => n + 1)} />
            <Button variant="ghost" size="icon" aria-label="Dictation"><Mic /></Button>
            {active && <Button data-action variant="ghost" size="icon" className="h-10 w-10 md:h-8 md:w-8 rounded-full" aria-label="Queue" onClick={() => setClicks(n => n + 1)}><ListPlus /></Button>}
            <Button data-action size="icon" className="h-10 w-10 md:h-8 md:w-8 rounded-full" aria-label={active ? 'Stop' : 'Send'} onClick={() => setClicks(n => n + 1)}>{active ? <Square /> : <ArrowUp />}</Button>
          </div>
        </ComposerToolbarProvider>
      </div>
    </div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
