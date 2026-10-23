import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThreadResumeResponse } from '@/bindings/v2';
import { useCodexStore, useConfigStore } from '@/components/codex/stores';
import { useThreadModels } from '@/components/codex/stores/useThreadModels';
import { switchThreadModel, threadResume, turnSettingsUpdate } from './apiAdapt';
import { confirmThreadModel, effectiveThreadModel, reconcileThreadModel, refreshThreadModel, requireThreadModel, selectThreadModel } from './threadModelService';

vi.mock('./apiAdapt', () => ({ switchThreadModel: vi.fn(), threadResume: vi.fn(), turnSettingsUpdate: vi.fn() }));
const selection={modelProvider:'openai',model:'gpt-6.1-sol',reasoningEffort:'medium' as const};
const response=(provider:string,model:string)=>({modelProvider:provider,model,reasoningEffort:'medium',thread:{id:'a',modelProvider:provider,model,turns:[]}}) as unknown as ThreadResumeResponse;
const deferred=<T,>()=>{let resolve!:(v:T)=>void;let reject!:(e:Error)=>void;return {promise:new Promise<T>((a,b)=>{resolve=a;reject=b}),resolve,reject};};
describe('confirmed per-thread model settings',()=>{
 beforeEach(()=>{
  vi.resetAllMocks();
  useCodexStore.setState({currentThreadId:'a',currentTurnId:null,threads:[],threadStatusMap:{},turnTimingMap:{}});
  useThreadModels.setState({confirmed:{a:selection},pending:{},errors:{}});
  useConfigStore.getState().setModelSelection('openai','gpt-6-astra','high');
 });
 it('prefers effective top-level configuration to stale nested metadata',()=>{
  expect(effectiveThreadModel({model:'gpt-6.1-sol',modelProvider:'openai',reasoningEffort:'low',thread:{model:'gpt-6-astra',modelProvider:'old'}})).toEqual({...selection,reasoningEffort:'low'});
 });
 it('supports old CLIs with model only at the top level and explicit null effort',()=>{
  expect(effectiveThreadModel({model:'sol',modelProvider:'openai',reasoningEffort:null,thread:{reasoningEffort:'high'}})).toEqual({model:'sol',modelProvider:'openai',reasoningEffort:null});
  expect(effectiveThreadModel({thread:{model:'qwen',modelProvider:'local'}})?.model).toBe('qwen');
 });
 it('never turns missing metadata into the draft default',()=>{
  confirmThreadModel('a',{thread:{modelProvider:'openai'}});
  expect(useConfigStore.getState().model).toBe('gpt-6-astra');
  expect(useThreadModels.getState().errors.a).toBeTruthy();
 });
 it('does not optimistically change the label or provider before confirmation',async()=>{
  const d=deferred<ThreadResumeResponse>();vi.mocked(switchThreadModel).mockReturnValue(d.promise);
  const work=selectThreadModel('a',{...selection,modelProvider:'local',model:'qwen'});
  expect(useThreadModels.getState().pending.a).toBe(true);
  expect(useThreadModels.getState().confirmed.a.model).toBe('gpt-6.1-sol');
  const waiting=requireThreadModel('a');
  d.resolve(response('local','qwen'));await work;
  expect((await waiting).modelProvider).toBe('local');expect(useConfigStore.getState().model).toBe('qwen');
 });
 it('blocks sending after a failed switch while retaining the old display',async()=>{
  vi.mocked(switchThreadModel).mockRejectedValue(new Error('endpoint refused'));
  await expect(selectThreadModel('a',{...selection,modelProvider:'local',model:'qwen'})).rejects.toThrow('endpoint refused');
  expect(useThreadModels.getState().confirmed.a).toEqual(selection);
  await expect(requireThreadModel('a')).rejects.toThrow('endpoint refused');
 });
 it('rejects silent CLI fallback to an old provider',async()=>{
  vi.mocked(switchThreadModel).mockResolvedValue(response('openai','gpt-6.1-sol'));
  await expect(selectThreadModel('a',{...selection,modelProvider:'local',model:'qwen'})).rejects.toThrow();
  await expect(requireThreadModel('a')).rejects.toThrow();
 });
 it('does not change another chat or its draft when a slow request finishes',async()=>{
  const d=deferred<ThreadResumeResponse>();vi.mocked(switchThreadModel).mockReturnValue(d.promise);
  const work=selectThreadModel('a',{...selection,modelProvider:'local',model:'qwen'});
  useCodexStore.setState({currentThreadId:'b'});useConfigStore.getState().setModelSelection('other','b-model','low');
  d.resolve(response('local','qwen'));await work;
  expect(useConfigStore.getState().model).toBe('b-model');expect(useThreadModels.getState().confirmed.a.model).toBe('qwen');
 });
 it('serializes rapid picks and retains the last confirmed request',async()=>{
  const d=deferred<ThreadResumeResponse>();vi.mocked(switchThreadModel).mockReturnValueOnce(d.promise).mockResolvedValueOnce(response('local','last'));
  const one=selectThreadModel('a',{...selection,modelProvider:'local',model:'first'});
  const two=selectThreadModel('a',{...selection,modelProvider:'local',model:'last'});
  await vi.waitFor(() => expect(switchThreadModel).toHaveBeenCalledTimes(1));
  d.resolve(response('local','first'));await Promise.all([one,two]);
  expect(useThreadModels.getState().confirmed.a.model).toBe('last');
 });
 it('blocks cross-provider reconnect during an active task',async()=>{
  useCodexStore.setState({threadStatusMap:{a:{type:'active',activeFlags:[]}}});
  await expect(selectThreadModel('a',{...selection,modelProvider:'local',model:'qwen'})).rejects.toThrow();
  expect(switchThreadModel).not.toHaveBeenCalled();expect(turnSettingsUpdate).not.toHaveBeenCalled();
 });
 it('applies same-provider picks to the running turn and verifies the response',async()=>{
  useCodexStore.setState({threadStatusMap:{a:{type:'active',activeFlags:[]}},currentTurnId:'turn-a'});
  vi.mocked(switchThreadModel).mockResolvedValue(response('openai','new-model'));
  await selectThreadModel('a',{...selection,model:'new-model'});
  expect(switchThreadModel).toHaveBeenCalledWith(expect.objectContaining({threadId:'a',turnId:'turn-a',model:'new-model',effort:'medium'}));
  expect(useThreadModels.getState().confirmed.a.model).toBe('new-model');
 });
 it('does not claim an unavailable running turn was changed',async()=>{
  useCodexStore.setState({threadStatusMap:{a:{type:'active',activeFlags:[]}},currentTurnId:'turn-a'});
  vi.mocked(switchThreadModel).mockRejectedValue(new Error('The running turn could not be updated'));
  await expect(selectThreadModel('a',{...selection,model:'new-model'})).rejects.toThrow();
  expect(useThreadModels.getState().confirmed.a.model).toBe('gpt-6.1-sol');
 });
 it('refreshes effective settings without hydrating history',async()=>{
  vi.mocked(threadResume).mockResolvedValue(response('openai','gpt-6.1-sol'));
  await refreshThreadModel('a');expect(threadResume).toHaveBeenCalledWith({threadId:'a',excludeTurns:true});
  expect(useConfigStore.getState().model).toBe('gpt-6.1-sol');
 });
 it('uses the addressed chat model even when the global draft belongs to another chat',async()=>{
  expect((await requireThreadModel('a')).model).toBe('gpt-6.1-sol');
 });
});

describe('late model notifications',()=>{
 it('re-reads current configuration instead of overwriting it with an older notification',async()=>{
  vi.resetAllMocks();useCodexStore.setState({currentThreadId:'a'});
  useThreadModels.setState({confirmed:{a:{modelProvider:'local',model:'qwen',reasoningEffort:'medium'}},pending:{},errors:{}});
  vi.mocked(threadResume).mockResolvedValue(response('local','qwen'));
  await reconcileThreadModel('a',{modelProvider:'openai',model:'gpt-6-astra',effort:'medium'});
  expect(useThreadModels.getState().confirmed.a.model).toBe('qwen');expect(threadResume).toHaveBeenCalledTimes(1);
 });
 it('ignores matching notifications and notifications arriving during a switch',async()=>{
  vi.resetAllMocks();useThreadModels.setState({confirmed:{a:selection},pending:{},errors:{}});
  await reconcileThreadModel('a',{...selection,effort:'medium'});
  useThreadModels.getState().begin('a');await reconcileThreadModel('a',{modelProvider:'other',model:'old'});
  expect(threadResume).not.toHaveBeenCalled();useThreadModels.setState({pending:{}});
 });
});

it('does not let a notification silently recover a rejected custom-model selection',async()=>{
 vi.resetAllMocks();useThreadModels.setState({confirmed:{a:selection},pending:{},errors:{a:'Switch failed'}});
 await reconcileThreadModel('a',{modelProvider:'openai',model:'gpt-6-astra',effort:'medium'});
 expect(threadResume).not.toHaveBeenCalled();await expect(requireThreadModel('a')).rejects.toThrow('Switch failed');
});

it('preserves inherited effort without overwriting the new-chat draft preference',async()=>{
 useCodexStore.setState({currentThreadId:'a'});useConfigStore.getState().setModelSelection('openai','gpt-6-astra','high');
 confirmThreadModel('a',{model:'gpt-6.1-sol',modelProvider:'openai',reasoningEffort:null});
 expect((await requireThreadModel('a')).reasoningEffort).toBeNull();expect(useConfigStore.getState().reasoningEffort).toBe('high');
 expect(effectiveThreadModel({model:'gpt-6.1-sol',modelProvider:'openai',reasoningEffort:'none'})?.reasoningEffort).toBe('none');
});
