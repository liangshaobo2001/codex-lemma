import { useCodexStore } from '@/components/codex/stores';
import { listAutomationRuns } from '@/services/apiAdapt';

/**
 * True when work is still running: an active Codex turn, or an automation run
 * that the backend still records as running.
 */
export async function hasActiveWork(): Promise<boolean> {
  const codex = useCodexStore.getState();
  if (Object.values(codex.threadStatusMap).some((status) => status.type === 'active')) return true;

  try {
    const runs = await listAutomationRuns({ limit: 100 });
    return runs.some((run) => run.status?.trim().toLowerCase() === 'running');
  } catch {
    // Can't tell — don't block quitting on it.
    return false;
  }
}
