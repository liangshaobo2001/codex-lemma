import { lazy, Suspense } from 'react';
import { useCodexStore } from '@/components/codex/stores';
import { THREAD_COLUMN } from '@/components/common/threadColumn';
import { AgentComposer } from './AgentComposer';
import { AgentViewHeader } from './AgentViewHeader';

const CodexThread = lazy(() =>
  import('@/components/codex/thread/CodexThread').then((m) => ({ default: m.CodexThread }))
);

/** Empty state: nothing in the middle, composer pinned at the bottom. */
function EmptySessionLayout() {
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="flex-1 min-h-0" />
      <div className="shrink-0 flex justify-center">
        <div className={THREAD_COLUMN}>
          <AgentComposer />
        </div>
      </div>
    </div>
  );
}

export default function AgentView() {
  const { currentThreadId } = useCodexStore();

  return (
    <div className="flex flex-col min-h-0 h-full">
      <AgentViewHeader />
      {!currentThreadId ? (
        <EmptySessionLayout />
      ) : (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <Suspense fallback={null}>
              <CodexThread />
            </Suspense>
          </div>
          <div className="shrink-0 flex justify-center">
            <div className={THREAD_COLUMN}>
              <AgentComposer />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
