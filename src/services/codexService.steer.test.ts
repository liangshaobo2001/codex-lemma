import { beforeEach, expect, it, vi } from 'vitest';
import { useCodexStore } from '@/components/codex/stores';
import { usePendingSteers } from '@/components/codex/stores/usePendingSteers';
import { useThreadModels } from '@/components/codex/stores/useThreadModels';
import { useSessionTools } from '@/components/codex/stores/useSessionTools';
import { turnSteer } from './apiAdapt';
import { codexService } from './codexService';
vi.mock('./apiAdapt',async(load)=>({...await load<typeof import('./apiAdapt')>(),turnSteer:vi.fn()}));
beforeEach(()=>{
  vi.resetAllMocks();usePendingSteers.setState({items:[],observed:[]});
  useCodexStore.setState({currentThreadId:'a',threads:[],events:{}});
  useThreadModels.setState({confirmed:{a:{modelProvider:'fixture',model:'model',reasoningEffort:'none'}},pending:{},errors:{}});
  useSessionTools.setState({pending:{},errors:{},snapshots:{}});
});

it('shows the followup before the steering RPC resolves, including image-only submissions',async()=>{
  let resolve!: (value:{turnId:string})=>void;
  vi.mocked(turnSteer).mockImplementation(()=>new Promise(done=>{resolve=done}));
  const sending=codexService.turnSteer('a','turn','','D:/fixture/image.png'.split('|'));
  expect(usePendingSteers.getState().items[0]).toMatchObject({threadId:'a',status:'sending',content:[{type:'localImage',path:'D:/fixture/image.png'}]});
  await vi.waitFor(()=>expect(turnSteer).toHaveBeenCalled());
  expect(vi.mocked(turnSteer).mock.calls[0][0].clientUserMessageId).toBe(usePendingSteers.getState().items[0].id);
  resolve({turnId:'turn'});await sending;
  expect(usePendingSteers.getState().items[0].status).toBe('accepted');
  expect(useCodexStore.getState().events.a).toBeUndefined();
});

it('keeps a rejected message visible as failed instead of dropping the input',async()=>{
  vi.spyOn(console,'error').mockImplementation(()=>{});
  vi.mocked(turnSteer).mockRejectedValue(new Error('Turn no longer active'));
  await expect(codexService.turnSteer('a','turn','Keep this message')).rejects.toThrow('Turn no longer active');
  expect(usePendingSteers.getState().items[0]).toMatchObject({status:'failed',error:'Turn no longer active'});
});
