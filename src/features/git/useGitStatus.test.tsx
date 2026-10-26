import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const wire=vi.hoisted(()=>({status:vi.fn(),repo:vi.fn(),watch:vi.fn()}));
vi.mock('@/services/apiAdapt/git',()=>({gitStatus:wire.status,isGitRepo:wire.repo}));
vi.mock('@/hooks/useGitWatch',()=>({useGitWatch:wire.watch}));
import { useGitStatus } from './useGitStatus';
import { useGitDiffStore } from '@/stores/useGitDiffStore';
const data=(cwd:string)=>({repo_root:cwd,entries:[{path:cwd+'.txt',index_status:'?',worktree_status:'?'}]});
function deferred<T>() {let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>{resolve=r});return {promise,resolve};}
beforeEach(()=>{vi.clearAllMocks();wire.repo.mockResolvedValue(true);useGitDiffStore.getState().syncCwd(null);});
it('discards late results from a previous workspace',async()=>{
 const a=deferred<ReturnType<typeof data>>();wire.status.mockImplementation((cwd:string)=>cwd==='A'?a.promise:Promise.resolve(data(cwd)));
 const hook=renderHook(({cwd})=>useGitStatus(cwd),{initialProps:{cwd:'A'}});
 await waitFor(()=>expect(wire.status).toHaveBeenCalledWith('A'));
 hook.rerender({cwd:'B'});await waitFor(()=>expect(useGitDiffStore.getState().gitData?.repo_root).toBe('B'));
 await act(async()=>{a.resolve(data('A'));await a.promise});
 expect(useGitDiffStore.getState().gitData?.repo_root).toBe('B');
});
it('coalesces bursts and refreshes again after a change during the request',async()=>{
 const first=deferred<ReturnType<typeof data>>();wire.status.mockReturnValueOnce(first.promise).mockResolvedValue(data('A'));
 const hook=renderHook(()=>useGitStatus('A'));
 await waitFor(()=>expect(wire.status).toHaveBeenCalledTimes(1));
 act(()=>{void hook.result.current.refresh();void hook.result.current.refresh();void hook.result.current.refresh();});
 await act(async()=>{first.resolve(data('A'));await first.promise});
 await waitFor(()=>expect(wire.status).toHaveBeenCalledTimes(2));
});
it('keeps the previous list after refresh errors and ignores unmounted results',async()=>{
 wire.status.mockResolvedValueOnce(data('A'));const hook=renderHook(()=>useGitStatus('A'));
 await waitFor(()=>expect(useGitDiffStore.getState().gitData?.repo_root).toBe('A'));
 wire.status.mockRejectedValueOnce(new Error('offline'));await act(()=>hook.result.current.refresh());
 expect(useGitDiffStore.getState().gitData?.repo_root).toBe('A');expect(useGitDiffStore.getState().gitError).toBe('offline');
 const last=deferred<ReturnType<typeof data>>();wire.status.mockReturnValue(last.promise);
 act(()=>{void hook.result.current.refresh()});await waitFor(()=>expect(wire.status).toHaveBeenCalledTimes(3));hook.unmount();
 await act(async()=>{last.resolve(data('wrong'));await last.promise});expect(useGitDiffStore.getState().gitData?.repo_root).toBe('A');
});
