import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCodexStore, useConfigStore } from '@/components/codex/stores';
import { useThreadModels } from '@/components/codex/stores/useThreadModels';
import { turnStart } from './apiAdapt';
import { codexService } from './codexService';
vi.mock('./apiAdapt',async(load)=>({...await load<typeof import('./apiAdapt')>(),turnStart:vi.fn()}));
describe('sending with confirmed session reasoning settings',()=>{
 beforeEach(()=>{
  vi.resetAllMocks();useCodexStore.setState({currentThreadId:'a',threads:[],events:{}});
  useConfigStore.getState().setModelSelection('openai','gpt-6-astra','high');
  useThreadModels.setState({confirmed:{a:{modelProvider:'openai',model:'gpt-6.1-sol',reasoningEffort:null}},pending:{},errors:{}});
  vi.mocked(turnStart).mockResolvedValue({turn:{id:'turn'}} as never);
 });
 it('inherits the session default instead of sending explicit none or a global draft effort',async()=>{
  await codexService.turnStart('a','synthetic');
  expect(turnStart).toHaveBeenCalledWith(expect.objectContaining({model:'gpt-6.1-sol',effort:null}));
 });
 it('keeps an explicitly selected none distinct from inherited default',async()=>{
  useThreadModels.getState().confirm('a',{modelProvider:'openai',model:'gpt-6.1-sol',reasoningEffort:'none'});
  await codexService.turnStart('a','synthetic');expect(turnStart).toHaveBeenCalledWith(expect.objectContaining({effort:'none'}));
 });
});
