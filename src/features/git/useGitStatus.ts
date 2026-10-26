import { useEffect, useRef, useState } from 'react';
import { useGitWatch } from '@/hooks/useGitWatch';
import { gitStatus, isGitRepo } from '@/services/apiAdapt/git';
import { useGitDiffStore } from '@/stores/useGitDiffStore';

/** Coalesce refreshes and fence every result to the mounted workspace owner. */
export function useGitStatus(cwd: string | null) {
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const [refresh] = useState(() => () => refreshRef.current());
  useEffect(() => {
    let alive = true;
    let dirty = false;
    let running: Promise<void> | undefined;
    const store = useGitDiffStore.getState();
    store.syncCwd(cwd);
    const valid = () => alive && useGitDiffStore.getState().cwdKey === cwd;
    const run = async () => {
      setLoading(true);
      try {
        do {
          dirty = false;
          const repo = cwd && (await isGitRepo(cwd));
          if (!valid()) return;
          const status = repo ? await gitStatus(cwd!) : null;
          if (!valid()) return;
          store.setGitData(status);
          store.setGitError(null);
          setRevision((value) => value + 1);
        } while (dirty && valid());
      } catch (error) {
        if (valid()) store.setGitError(error instanceof Error ? error.message : String(error));
      } finally {
        running = undefined;
        if (valid()) setLoading(false);
      }
    };
    refreshRef.current = () => {
      if (!alive || !cwd) return Promise.resolve();
      dirty = true;
      running ??= run();
      return running;
    };
    void refresh();
    return () => {
      alive = false;
    };
  }, [cwd, refresh]);
  useGitWatch(cwd, refresh, Boolean(cwd));
  return { loading, revision, refresh };
}
