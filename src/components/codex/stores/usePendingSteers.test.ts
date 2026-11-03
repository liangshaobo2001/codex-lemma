import { beforeEach, expect, it } from 'vitest';
import type { ServerNotification } from '@/bindings';
import type { UserInput } from '@/bindings/v2';
import { useCodexStore } from './useCodexStore';
import { usePendingSteers } from './usePendingSteers';
import { useThreadHistory } from './threadHistory';

const content: UserInput[] = [{type:'text',text:'Follow up',text_elements:[]},{type:'localImage',path:'D:/fixture/image.png'}];
const message = (id: string, turnId='turn', method='item/started') => ({method,params:{threadId:'a',turnId,item:{type:'userMessage',id,content}}}) as ServerNotification;
beforeEach(()=>{usePendingSteers.setState({items:[],observed:[]});useCodexStore.setState({events:{}});});

it('keeps transport acceptance separate from actual receipt, then reconciles through real events',()=>{
  const state=usePendingSteers.getState();const id=state.begin('a','turn',content);
  expect(usePendingSteers.getState().items[0].status).toBe('sending');
  state.update(id,'accepted');expect(usePendingSteers.getState().items).toHaveLength(1);
  useCodexStore.getState().addEvent('a',message('server-message'));
  expect(usePendingSteers.getState().items).toHaveLength(0);
  state.update(id,'accepted');expect(usePendingSteers.getState().items).toHaveLength(0);
});

it('matches identical followups once each, not twice for started and completed',()=>{
  const state=usePendingSteers.getState();const first=state.begin('a','turn',content);const second=state.begin('a','turn',content);
  state.observe('a',message('one'));state.observe('a',message('one','turn','item/completed'));
  expect(usePendingSteers.getState().items.map(item=>item.id)).toEqual([second]);
  state.observe('a',message('two'));expect(usePendingSteers.getState().items).toHaveLength(0);
  expect(first).not.toBe(second);
});

it('does not consume a message from another chat, turn, or attachment',()=>{
  const state=usePendingSteers.getState();state.begin('a','turn',content);
  state.observe('b',message('other-chat'));state.observe('a',message('other-turn','older-turn'));
  const other=message('other-image') as Extract<ServerNotification,{method:'item/started'}>;
  other.params.item={type:'userMessage',id:'other-image',clientId:null,content:[content[0],{type:'localImage',path:'D:/fixture/other.png'}]};
  state.observe('a',other);expect(usePendingSteers.getState().items).toHaveLength(1);
});

it('retains failures for retry and does not resurrect a confirmed message after a late RPC error',()=>{
  const state=usePendingSteers.getState();const id=state.begin('a','turn',content);
  state.update(id,'failed','Connection interrupted');expect(usePendingSteers.getState().items[0].error).toBe('Connection interrupted');
  state.observe('a',message('accepted-despite-rpc-error'));state.update(id,'failed','Late error');
  expect(usePendingSteers.getState().items).toHaveLength(0);
});

it('uses exact client IDs for identical followups, even with out-of-order receipts',()=>{
  const state=usePendingSteers.getState();
  const first=state.begin('a','turn',content), second=state.begin('a','turn',content);
  const event=message('server-second') as Extract<ServerNotification,{method:'item/started'}>;
  if(event.params.item.type!=='userMessage')throw Error('fixture');
  event.params.item.clientId=second;
  state.observe('a',event);
  expect(usePendingSteers.getState().items.map(item=>item.id)).toEqual([first]);
  event.params.item.clientId='another-client';event.params.item.id='other';
  state.observe('a',event);
  expect(usePendingSteers.getState().items.map(item=>item.id)).toEqual([first]);
});

it('reconciles canonical history after a missed receipt without matching old text',()=>{
  const state=usePendingSteers.getState();
  const first=state.begin('a','turn',content), second=state.begin('a','turn',content);
  const entry={turnId:'turn',item:{type:'userMessage' as const,id:'canonical',clientId:first,content},truncated:false,detailCursor:null};
  useThreadHistory.getState().reset('b',{entries:[entry],nextCursor:null});
  expect(usePendingSteers.getState().items).toHaveLength(2);
  useThreadHistory.getState().reset('a',{entries:[entry,{...entry,item:{...entry.item,id:'legacy',clientId:null}}],nextCursor:null});
  state.update(first,'failed','Late transport error');
  expect(usePendingSteers.getState().items.map(item=>item.id)).toEqual([second]);
});
