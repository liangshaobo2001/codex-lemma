import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import html from '../../../web/src/mobile.html?raw';

beforeEach(()=>{vi.stubGlobal('scrollTo',vi.fn());});
afterEach(() => { const mobile=window as Window & {lemmaMobilePopState?: EventListener};if(mobile.lemmaMobilePopState)window.removeEventListener('popstate',mobile.lemmaMobilePopState); window.onpopstate=null; vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

it('keeps newest same-ID metadata within and across pages without merging same-name chats',async()=>{
  vi.useFakeTimers({toFake:['setInterval']});
  vi.stubGlobal('fetch',vi.fn(async(_path:string,options?:RequestInit)=>{
    const params=JSON.parse(String(options?.body||'{}'));
    const data=params.cursor
      ? [{id:'a',name:'Stale page title',updatedAt:1},{id:'c',name:'Same name',updatedAt:4}]
      : [{id:'a',name:'Latest title',updatedAt:5},{id:'a',name:'Older title',updatedAt:2},{id:'b',name:'Same name',updatedAt:3}];
    return {ok:true,status:200,text:async()=>JSON.stringify({data,nextCursor:'page-2'})} as Response;
  }));
  vi.stubGlobal('EventSource',class {close() {}});
  document.body.innerHTML=html.replace(/<script>[\s\S]*<\/script>/,'');
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Function(match[1])();
  await waitFor(()=>expect(document.querySelectorAll('#threads button')).toHaveLength(2));
  expect(document.querySelector('#threads [data-thread-id="a"] .thread-title')?.textContent).toBe('Latest title');
  (document.getElementById('moreThreads') as HTMLButtonElement).click();
  await waitFor(()=>expect(document.querySelectorAll('#threads button')).toHaveLength(3));
  expect(document.querySelector('#threads [data-thread-id="a"] .thread-title')?.textContent).toBe('Latest title');
  expect(Array.from(document.querySelectorAll('#threads .thread-title')).filter(n=>n.textContent==='Same name')).toHaveLength(2);
  expect((document.getElementById('moreThreads') as HTMLButtonElement).hidden).toBe(true);
});

it('refreshes away archived chats and restores unarchived chats without duplicates',async()=>{
  vi.useFakeTimers({toFake:['setInterval','setTimeout']});
  let archived=false,source:{onmessage?:(e:{data:string})=>void}|undefined;
  vi.stubGlobal('fetch',vi.fn(async(_path:string,options?:RequestInit)=>{
    expect(JSON.parse(String(options?.body)).archived).toBe(false);
    const row={id:'a',name:'Retained chat',updatedAt:5};
    return {ok:true,status:200,text:async()=>JSON.stringify({data:archived?[]:[row,row],nextCursor:null})} as Response;
  }));
  vi.stubGlobal('EventSource',class {constructor(){source=this}close() {}onmessage?:(e:{data:string})=>void});
  document.body.innerHTML=html.replace(/<script>[\s\S]*<\/script>/,'');
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Function(match[1])();
  await vi.advanceTimersByTimeAsync(0);
  expect(document.querySelectorAll('#threads button')).toHaveLength(1);
  archived=true;source?.onmessage?.({data:JSON.stringify({event:'codex:notification',payload:{method:'thread/archived',params:{threadId:'a'}}})});
  await vi.advanceTimersByTimeAsync(200);
  expect(document.querySelectorAll('#threads button')).toHaveLength(0);
  archived=false;source?.onmessage?.({data:JSON.stringify({event:'codex:notification',payload:{method:'thread/unarchived',params:{threadId:'a'}}})});
  await vi.advanceTimersByTimeAsync(200);
  expect(document.querySelectorAll('#threads button')).toHaveLength(1);
});

it('uses desktop Recents ordering across providers and deduplicates paginated threads', async () => {
  vi.useFakeTimers({toFake:['setInterval']});
  const now = Date.now()/1000;
  const wire = vi.fn(async (_path: string, options?: RequestInit) => {
    const params = JSON.parse(String(options?.body || '{}'));
    const data = params.cursor
      ? [{id:'recent',name:'Renamed recent',updatedAt:now-120},{id:'older',name:'Other project',updatedAt:now-86400}]
      : [{id:'stale',name:'Old activity',createdAt:now,updatedAt:now-7200,modelProvider:'openai'},
         {id:'recent',name:'Recent activity',createdAt:now-86400,updatedAt:now-120,modelProvider:'local',status:{type:'active'}}];
    return {ok:true,status:200,text:async()=>JSON.stringify({data,nextCursor:params.cursor?null:'page-2'})} as Response;
  });
  vi.stubGlobal('fetch',wire);vi.stubGlobal('EventSource',class {close() {}});
  document.body.innerHTML=html.replace(/<script>[\s\S]*<\/script>/,'');
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Function(match[1])();
  await waitFor(()=>expect(document.querySelectorAll('#threads button')).toHaveLength(2));
  const params = JSON.parse(String(wire.mock.calls[0][1]?.body));
  expect(params).toMatchObject({sortKey:'updated_at',sortDirection:'desc',modelProviders:[],archived:false,useStateDbOnly:true});
  expect(params).not.toHaveProperty('cwd');expect(params).not.toHaveProperty('projectId');
  expect(document.querySelector('#threads button .thread-title')!.textContent).toBe('Recent activity');
  expect(document.querySelector('#threads button .thread-age')!.textContent).toBe('2m');
  expect(document.querySelector('#threads [aria-label="正在运行"]')).not.toBeNull();
  (document.getElementById('moreThreads') as HTMLButtonElement).click();
  await waitFor(()=>expect(document.querySelectorAll('#threads button')).toHaveLength(3));
  expect(document.querySelector('#threads button .thread-title')!.textContent).toBe('Renamed recent');
  expect((document.getElementById('moreThreads') as HTMLButtonElement).hidden).toBe(true);
});

it('refreshes Recents on desktop lifecycle events without replacing a newer response with an older one', async () => {
  vi.useFakeTimers({toFake:['setInterval','setTimeout']});
  let source: {onmessage?: (e:{data:string})=>void} | undefined;
  let resolveOld: ((value: Response)=>void) | undefined;
  let reads=0;
  const response=(name:string)=>({ok:true,status:200,text:async()=>JSON.stringify({data:[{id:'t',name,updatedAt:Date.now()/1000}]})}) as Response;
  vi.stubGlobal('fetch',vi.fn(async()=>{reads++;if(reads===2)return new Promise<Response>(resolve=>{resolveOld=resolve});return response(reads===1?'Before rename':'Latest rename')}));
  vi.stubGlobal('EventSource',class {constructor(){source=this} close() {} onmessage?: (e:{data:string})=>void});
  document.body.innerHTML=html.replace(/<script>[\s\S]*<\/script>/,'');
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Function(match[1])();
  await vi.advanceTimersByTimeAsync(0);
  expect(document.querySelector('#threads')!.textContent).toContain('Before rename');
  source?.onmessage?.({data:JSON.stringify({event:'codex:notification',payload:{method:'thread/name/updated',params:{threadId:'t'}}})});
  await vi.advanceTimersByTimeAsync(200);
  expect(reads).toBe(2);
  source?.onmessage?.({data:JSON.stringify({event:'codex:notification',payload:{method:'turn/completed',params:{threadId:'t'}}})});
  await vi.advanceTimersByTimeAsync(200);
  expect(document.querySelector('#threads')!.textContent).toContain('Latest rename');
  resolveOld?.(response('Stale rename'));await vi.advanceTimersByTimeAsync(0);
  expect(document.querySelector('#threads')!.textContent).not.toContain('Stale rename');
});

it('renders bounded history, submits a message, and answers an actual pending approval id', async () => {
  vi.useFakeTimers({toFake:['setInterval']});
  const wire = vi.fn(async (path: string, options?: RequestInit) => {
    const responses: Record<string, unknown> = {
      '/api/codex/thread/list': {data:[{id:'chat-1',name:'Mobile test'}]},
      '/api/codex/thread/history/page': {entries:[{item:{type:'agentMessage',text:'History <script>unsafe</script>'}}],nextCursor:'older-page'},
      '/api/pending': [{requestId:73,method:'item/commandExecution/requestApproval',params:{threadId:'chat-1',command:'echo OK'}}],
      '/api/codex/thread/resume': {}, '/api/codex/turn/start': {turn:{id:'turn-1'}},
    };
    if (path === '/api/codex/thread/history/page' && JSON.parse(String(options?.body)).cursor === 'older-page') {
      responses[path] = {entries:[{item:{type:'userMessage',content:[{text:'Older message stays visible'}]}}]};
    }
    return {ok:true,status:200,text:async()=>JSON.stringify(responses[path] ?? {}),json:async()=>responses[path] ?? {}} as Response;
  });
  vi.stubGlobal('fetch',wire);
  vi.stubGlobal('EventSource',class {close() {}});
  document.body.innerHTML=html.replace(/<script>[\s\S]*<\/script>/,'');
  for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(match[1])();
  await waitFor(()=>expect(document.querySelector('#threads button')).not.toBeNull());
  (document.querySelector('#threads button') as HTMLButtonElement).click();
  await waitFor(()=>expect(document.getElementById('history')!.textContent).toContain('History <script>unsafe</script>'));
  expect(document.querySelector('#history script')).toBeNull();
  (document.getElementById('older') as HTMLButtonElement).click();
  await waitFor(()=>expect(document.getElementById('history')!.textContent).toContain('Older message stays visible'));
  const reads = wire.mock.calls.filter(([path])=>path==='/api/codex/thread/history/page').length;
  await vi.advanceTimersByTimeAsync(9000);
  expect(wire.mock.calls.filter(([path])=>path==='/api/codex/thread/history/page')).toHaveLength(reads);
  (document.getElementById('latest') as HTMLButtonElement).click();
  await waitFor(()=>expect(document.getElementById('history')!.textContent).not.toContain('Older message stays visible'));
  await waitFor(()=>expect(document.getElementById('approvals')!.textContent).toContain('echo OK'));
  const approve=Array.from(document.querySelectorAll('#approvals button')).find(n=>n.textContent==='允许这一次') as HTMLButtonElement;
  approve.click();
  await waitFor(()=>expect(wire).toHaveBeenCalledWith('/api/codex/approval/command-execution',expect.objectContaining({body:JSON.stringify({request_id:73,decision:'accept'})})));
  (document.getElementById('input') as HTMLTextAreaElement).value='Continue from phone';
  document.getElementById('composer')!.dispatchEvent(new Event('submit',{cancelable:true}));
  await waitFor(()=>expect(wire).toHaveBeenCalledWith('/api/codex/turn/start',expect.objectContaining({body:expect.stringContaining('Continue from phone')})));
});

it('shows an actionable expired-code error and re-enables the pair button', async()=>{
  vi.useFakeTimers({toFake:['setInterval']});
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status:401,text:async()=> 'Pairing code invalid or expired'})));
  document.body.innerHTML=html.replace(/<script>[\s\S]*<\/script>/,'');
  for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(match[1])();
  await waitFor(()=>expect(document.getElementById('message')!.textContent).toContain('尚未配对'));
  (document.getElementById('code') as HTMLInputElement).value='BADCODE1';
  document.getElementById('pairform')!.dispatchEvent(new Event('submit',{cancelable:true}));
  expect(document.getElementById('message')!.textContent).toContain('正在验证');
  expect((document.getElementById('pairButton') as HTMLButtonElement).disabled).toBe(true);
  await waitFor(()=>expect(document.getElementById('message')!.textContent).toContain('无效、已过期或已使用'));
  expect((document.getElementById('pairButton') as HTMLButtonElement).disabled).toBe(false);
});

it('collapses tool/thinking groups lazily, preserves explicit expansion, and streams only assistant text',async()=>{
  vi.useFakeTimers({toFake:['setInterval']});
  let source:{onmessage?:(e:{data:string})=>void}|undefined;
  const rows=[
    {turnId:'turn',item:{type:'userMessage',id:'u',content:[{text:'A question'}]}},
    {turnId:'turn',item:{type:'reasoning',id:'r',summary:['Private reasoning'],content:[]}},
    {turnId:'turn',item:{type:'commandExecution',id:'c',command:'echo TEST',aggregatedOutput:'Long tool output'}},
    {turnId:'turn',item:{type:'agentMessage',id:'a',text:'Readable answer'}},
  ];
  vi.stubGlobal('fetch',vi.fn(async(path:string)=>({ok:true,status:200,text:async()=>JSON.stringify(
    path.endsWith('/list')?{data:[{id:'t',name:'Chat'}]}:path.endsWith('/page')?{entries:rows}:[]
  )})));
  vi.stubGlobal('EventSource',class {constructor(){source=this}close() {}onmessage?:(e:{data:string})=>void});
  document.body.innerHTML=html.replace(/<script>[\s\S]*<\/script>/,'');
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Function(match[1])();
  await waitFor(()=>expect(document.querySelector('#threads button')).not.toBeNull());
  (document.querySelector('#threads button') as HTMLButtonElement).click();
  await waitFor(()=>expect(document.getElementById('history')!.textContent).toContain('Readable answer'));
  const group=document.querySelector<HTMLDetailsElement>('.activity-group')!;
  expect(group.open).toBe(false);
  expect(document.getElementById('history')!.textContent).not.toContain('Private reasoning');
  expect(document.querySelectorAll('.activity-step')).toHaveLength(0);
  group.open=true;group.dispatchEvent(new Event('toggle'));
  const step=document.querySelector<HTMLDetailsElement>('.activity-step')!;
  expect(step.open).toBe(false);step.open=true;step.dispatchEvent(new Event('toggle'));
  expect(step.textContent).toContain('Private reasoning');
  rows.push({turnId:'turn',item:{type:'agentMessage',id:'a2',text:'Further answer'}});
  await vi.advanceTimersByTimeAsync(3000);
  expect(document.querySelector<HTMLDetailsElement>('.activity-group')!.open).toBe(true);
  expect(document.querySelector<HTMLDetailsElement>('.activity-step')!.open).toBe(true);
  const emit=(method:string,params:object)=>source?.onmessage?.({data:JSON.stringify({event:'codex:notification',payload:{method,params:{threadId:'t',turnId:'turn',...params}}})});
  emit('item/reasoning/textDelta',{itemId:'r2',delta:'HIDDEN_REASONING'});
  emit('item/commandExecution/outputDelta',{itemId:'c2',delta:'HIDDEN_TOOL_OUTPUT'});
  expect(document.getElementById('live')!.textContent).toBe('');
  emit('item/agentMessage/delta',{itemId:'reply',delta:'Visible reply'});
  expect(document.getElementById('live')!.textContent).toContain('Visible reply');
  expect(document.body.textContent).not.toContain('HIDDEN_REASONING');
  expect(document.body.textContent).not.toContain('HIDDEN_TOOL_OUTPUT');
  rows.push({turnId:'turn',item:{type:'agentMessage',id:'reply',text:'Visible reply'}});
  emit('item/completed',{item:{type:'agentMessage',id:'reply',text:'Visible reply'}});
  await waitFor(()=>expect(document.getElementById('live')!.textContent).toBe(''));
  expect(document.getElementById('history')!.textContent?.match(/Visible reply/g)).toHaveLength(1);
});

it('puts Back in the sticky header and handles browser back without another message request',async()=>{
  vi.useFakeTimers({toFake:['setInterval']});
  const wire=vi.fn(async(path:string)=>({ok:true,status:200,text:async()=>JSON.stringify(path.endsWith('/list')?{data:[{id:'t',name:'Chat'}]}:path.endsWith('/page')?{entries:[]}:[])}));
  vi.stubGlobal('fetch',wire);vi.stubGlobal('EventSource',class {close() {}});
  document.body.innerHTML=html.replace(/<script>[\s\S]*<\/script>/,'');
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Function(match[1])();
  await waitFor(()=>expect(document.querySelector('#threads button')).not.toBeNull());
  (document.querySelector('#threads button') as HTMLButtonElement).click();
  await waitFor(()=>expect((document.getElementById('chat') as HTMLElement).hidden).toBe(false));
  expect(document.getElementById('back')!.parentElement?.id).toBe('topbar');
  expect(window.history.state).toMatchObject({lemmaChat:true,threadId:'t'});
  window.dispatchEvent(new PopStateEvent('popstate',{state:{lemmaList:true}}));
  expect((document.getElementById('chat') as HTMLElement).hidden).toBe(true);
  expect((document.getElementById('recents') as HTMLElement).hidden).toBe(false);
  expect(wire.mock.calls.some(([path])=>path.includes('/turn/'))).toBe(false);
});

it('switches the bottom-right action between Send and Stop with completion and no duplicate submission',async()=>{
  vi.useFakeTimers({toFake:['setInterval']});
  let source:{onmessage?:(e:{data:string})=>void}|undefined;
  let running=true,historyLag=false;
  const wire=vi.fn(async(path:string)=>({ok:true,status:200,text:async()=>JSON.stringify(
    path.endsWith('/list')?{data:[{id:'t',name:'Chat'}]}:path.endsWith('/page')?{entries:[],turns:running&&!historyLag?[{id:'run',status:'inProgress'}]:[]}:path.endsWith('/start')?{turn:{id:'next'}}:{}
  )}));
  vi.stubGlobal('fetch',wire);vi.stubGlobal('EventSource',class {constructor(){source=this}close() {}onmessage?:(e:{data:string})=>void});
  document.body.innerHTML=html.replace(/<script>[\s\S]*<\/script>/,'');
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Function(match[1])();
  await waitFor(()=>expect(document.querySelector('#threads button')).not.toBeNull());
  (document.querySelector('#threads button') as HTMLButtonElement).click();
  const send=document.getElementById('send') as HTMLButtonElement,stop=document.getElementById('stop') as HTMLButtonElement;
  await waitFor(()=>expect(stop.hidden).toBe(false));expect(send.hidden).toBe(true);
  historyLag=true;await vi.advanceTimersByTimeAsync(3000);expect(stop.hidden).toBe(false);expect(send.hidden).toBe(true);
  stop.click();stop.click();
  await waitFor(()=>expect(wire.mock.calls.filter(([path])=>path.endsWith('/interrupt'))).toHaveLength(1));
  expect(stop.disabled).toBe(true);
  running=false;source?.onmessage?.({data:JSON.stringify({event:'codex:notification',payload:{method:'turn/completed',params:{threadId:'t'}}})});
  await waitFor(()=>expect(stop.hidden).toBe(true));expect(send.hidden).toBe(false);expect(send.disabled).toBe(true);
  const input=document.getElementById('input') as HTMLTextAreaElement;
  input.value='Next message';input.dispatchEvent(new Event('input'));expect(send.disabled).toBe(false);
  send.click();
  await waitFor(()=>expect(wire.mock.calls.some(([path])=>path.endsWith('/start'))).toBe(true));
  await waitFor(()=>expect(stop.hidden).toBe(false));
});

it('restores the Send action and keeps the draft after a send failure',async()=>{
  vi.useFakeTimers({toFake:['setInterval']});
  vi.stubGlobal('fetch',vi.fn(async(path:string)=>({ok:!path.endsWith('/start'),status:path.endsWith('/start')?500:200,text:async()=>path.endsWith('/start')?'Temporary failure':JSON.stringify(path.endsWith('/list')?{data:[{id:'t',name:'Chat'}]}:path.endsWith('/page')?{entries:[]}:[])})));
  vi.stubGlobal('EventSource',class {close() {}});
  document.body.innerHTML=html.replace(/<script>[\s\S]*<\/script>/,'');
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Function(match[1])();
  await waitFor(()=>expect(document.querySelector('#threads button')).not.toBeNull());
  (document.querySelector('#threads button') as HTMLButtonElement).click();
  await waitFor(()=>expect((document.getElementById('chat') as HTMLElement).hidden).toBe(false));
  const input=document.getElementById('input') as HTMLTextAreaElement,send=document.getElementById('send') as HTMLButtonElement;
  input.value='Keep my draft';input.dispatchEvent(new Event('input'));send.click();
  await waitFor(()=>expect(document.getElementById('message')!.textContent).toContain('Temporary failure'));
  expect(input.value).toBe('Keep my draft');expect(send.hidden).toBe(false);expect(send.disabled).toBe(false);
});
