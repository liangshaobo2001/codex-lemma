import { createRoot } from 'react-dom/client';
import type { Thread } from '@/bindings/v2';
import { AppLayout } from '@/components/layout/AppLayout';
import { useCodexStore, useConfigStore } from '@/components/codex/stores';
import { historyEvents, useThreadHistory } from '@/components/codex/stores/threadHistory';
import { useThreadModels } from '@/components/codex/stores/useThreadModels';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { useAgentCenterStore, useLayoutStore, useWorkspaceStore } from '@/stores';
import { useSettingsStore } from '@/stores/settings';
import { i18n } from '@/lib/i18n';
import '@/App.css';
import './desktop-design.css';

// Preview-only composition. No app bootstrap, credentials, native bridge or real history.
const now = Math.floor(Date.now() / 1000);
const titles = ['优化移动端聊天界面', 'Review layout spacing', '清理项目中的旧样式', '整理发布说明'];
const threads = titles.map((name, i) => ({
  id: `design-${i}`, name, preview: name, cwd: 'D:/Demo/website',
  createdAt: now - 86400, updatedAt: now - i * 3600 - 120,
  status: { type: 'idle' }, model: 'qwen3.8-flash-next', modelProvider: 'fixture',
  reasoningEffort: 'medium', turns: [], source: 'cli', path: null,
  gitInfo: null, projectId: null, canAcceptDirectInput: true,
} as Thread));
(window as Window & { previewThreads?: Thread[] }).previewThreads = threads;
void i18n.changeLanguage('en');
useLayoutStore.setState({ view: 'agent', sidebarView: 'list', isSidebarOpen: true, isRightPanelOpen: false });
useWorkspaceStore.setState({ cwd: 'D:/Demo/website', projects: ['D:/Demo/website'] });
useConfigStore.setState({ accessMode: 'auto', model: 'qwen3.8-flash-next', reasoningEffort: 'medium', modelProvider: 'fixture' });
useSettingsStore.setState({ composerWidgets: { speed: true, cache: true, context: true, cost: false } });
useAgentCenterStore.setState({ cards: [{kind:'codex',id:'design-0',cwd:'D:/Demo/website'}], currentAgentCardId: 'design-0' });
const page = {
  entries: [
    {turnId:'demo-turn',item:{id:'user-demo',type:'userMessage' as const,clientId:null,content:[{type:'text' as const,text:'帮我把页面整理得清爽一点，重点是移动端阅读和操作。',text_elements:[]}]},truncated:false,detailCursor:null},
    {turnId:'demo-turn',item:{id:'reason-demo',type:'reasoning' as const,summary:['Inspect the existing layout and preserve the current behavior.'],content:[]},truncated:false,detailCursor:null},
    {turnId:'demo-turn',item:{id:'answer-demo',type:'agentMessage' as const,text:'已经整理好了。主要调整了阅读层次和操作位置，原来的功能保留。\n\n### 更安静的聊天界面\n\n助手回复直接展示，工具调用与思考放在可展开的活动记录里，需要时再查看。用户消息保持右侧对齐，方便快速分辨对话。\n\n### 更顺手的操作\n\n- 返回入口始终留在顶部，不会被长对话推走。\n- 发送与停止按钮放在输入框右下角。\n- 统一中性配色，减少不必要的边框和阴影。\n\n你可以先看这一版的整体感觉，再决定是否采用。',phase:null,memoryCitation:null,delivery:null,questions:null},truncated:false,detailCursor:null},
  ], nextCursor: null,
};
useThreadHistory.getState().reset('design-0', page);
const tokens = {totalTokens:82000,inputTokens:80000,cachedInputTokens:71600,cacheWriteInputTokens:0,outputTokens:2000,reasoningOutputTokens:1000};
useCodexStore.setState({ threads, currentThreadId:'design-0', activeThreadIds:['design-0'], events:{'design-0':historyEvents(page,'design-0')}, threadStatusMap:{'design-0':{type:'idle'}},
  throughputMap:{'design-0':{turnId:'demo-turn',tokensPerSec:80,requests:1,ttftMs:700,outputTokens:2000,durationMs:25000}},
  tokenUsageMap:{'design-0':{total:tokens,last:tokens,modelContextWindow:262144}} });
useThreadModels.getState().confirm('design-0',{model:'qwen3.8-flash-next',modelProvider:'fixture',reasoningEffort:'medium'});
createRoot(document.getElementById('root')!).render(<ThemeProvider><TooltipProvider><AppLayout /></TooltipProvider></ThemeProvider>);
