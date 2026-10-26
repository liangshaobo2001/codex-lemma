import { act, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
const wire=vi.hoisted(()=>({status:vi.fn(),watch:vi.fn(),mount:vi.fn(),unmount:vi.fn()}));
vi.mock('@/services/apiAdapt/git',async(load)=>({...await load<typeof import('@/services/apiAdapt/git')>(),gitStatus:wire.status,isGitRepo:async()=>true}));
vi.mock('@/hooks/useGitWatch',()=>({useGitWatch:wire.watch}));
vi.mock('@/stores/useGitStatsStore',()=>({useGitStatsStore:()=>({refreshStats:async()=>{}})}));
vi.mock('@/features/web-preview/webFrameworkDetection',()=>({detectWebFramework:async()=>null}));
vi.mock('@/components/layout/RightPanelHeader',()=>({RightPanelHeader:()=>null}));
vi.mock('@/features/git/GitDiffTopBar',()=>({GitDiffTopBar:()=>null}));
vi.mock('@/features/git/GitDiffDialogs',()=>({GitDiffDialogs:()=>null}));
vi.mock('@/features/git/GitFileTreePanel',()=>({GitFileTreePanel:()=>null}));
vi.mock('@/features/terminal/TerminalPanel',()=>({TerminalPanel:()=>{
 useEffect(()=>{wire.mount();return ()=>wire.unmount()},[]);return <div>Terminal session</div>;
}}));
import GitDiffPanel from './GitDiffPanel';
import { RightPanel } from '@/components/layout/RightPanel';
import { useLayoutStore, useWorkspaceStore } from '@/stores';
import { useGitDiffStore } from '@/stores/useGitDiffStore';
beforeEach(()=>{
 vi.clearAllMocks();wire.status.mockResolvedValue({repo_root:'fixture',entries:[]});
 useGitDiffStore.getState().syncCwd(null);
 useWorkspaceStore.setState({cwd:'fixture'});
 useLayoutStore.setState({view:'agent',isRightPanelOpen:false,activeRightPanelTab:'diff',openRightPanelTabs:['diff','terminal']});
});
it('does not mount or request the hidden Review even when its tab stays selected',async()=>{
 render(<GitDiffPanel cwd="fixture" isActive/>);expect(wire.status).not.toHaveBeenCalled();expect(wire.watch).not.toHaveBeenCalled();
 act(()=>useLayoutStore.setState({isRightPanelOpen:true}));await waitFor(()=>expect(wire.status).toHaveBeenCalledTimes(1));
 act(()=>useLayoutStore.setState({isRightPanelOpen:false}));expect(screen.queryByRole('region',{name:'Changed file diffs'})).toBeNull();
 act(()=>useLayoutStore.setState({view:'settings',isRightPanelOpen:true}));expect(wire.status).toHaveBeenCalledTimes(1);
});
it('keeps the terminal mounted while toggling Review visibility and tabs',async()=>{
 render(<RightPanel/>);await screen.findByText('Terminal session');expect(wire.mount).toHaveBeenCalledTimes(1);
 act(()=>useLayoutStore.setState({isRightPanelOpen:true}));await waitFor(()=>expect(wire.status).toHaveBeenCalledTimes(1));
 act(()=>useLayoutStore.setState({activeRightPanelTab:'terminal'}));
 act(()=>useLayoutStore.setState({isRightPanelOpen:false}));
 act(()=>useLayoutStore.setState({isRightPanelOpen:true,activeRightPanelTab:'diff'}));
 await waitFor(()=>expect(wire.status).toHaveBeenCalledTimes(2));expect(wire.mount).toHaveBeenCalledTimes(1);expect(wire.unmount).not.toHaveBeenCalled();
});
