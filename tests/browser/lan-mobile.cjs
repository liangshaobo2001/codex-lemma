// Isolated browser regression; no accounts, existing sessions, or models.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs'); const path = require('path'); const http = require('http'); const assert = require('assert');
(async () => {
  const html=fs.readFileSync(path.join(__dirname,'../../web/src/mobile.html'),'utf8');
  let paired=false,approved=false,sent=false,activeTurn=false,previewMode=false;
  const clients=new Set();
  const emit=(method,params)=>{for(const client of clients)client.write('data: '+JSON.stringify({event:'codex:notification',payload:{method,params:{threadId:'mobile-fixture',turnId:'turn-fixture',...params}}})+'\n\n')};
  const entries=[{turnId:'turn-fixture',item:{id:'user',type:'userMessage',content:[{text:'Continue this task'}]}},
    {turnId:'turn-fixture',item:{id:'reasoning',type:'reasoning',summary:['DEEP_THINKING '+('hidden thought '.repeat(2000))],content:[]}},
    ...Array.from({length:50},(_,i)=>({turnId:'turn-fixture',item:{id:'tool-'+i,type:'commandExecution',command:'echo STEP_'+i,aggregatedOutput:'LONG_TOOL_OUTPUT '+('output '.repeat(2000))}})),
    {turnId:'turn-fixture',item:{id:'answer',type:'agentMessage',text:'Safe history <img src=x onerror=alert(1)>'}},
    {turnId:'turn-fixture',item:{id:'long-answer',type:'agentMessage',text:'Readable answer line.\n'.repeat(80)}}];
  const server=http.createServer(async(req,res)=>{
    let text='';for await(const chunk of req)text+=chunk;
    res.setHeader('Content-Type','application/json');
    if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end(html)}
    if(req.url==='/pair'){paired=true;return res.end('{}')}
    if(!paired){res.statusCode=401;return res.end('Pair required')}
    if(req.url==='/api/codex/thread/list')return res.end(JSON.stringify({data:[{id:'mobile-fixture',name:previewMode?'界面预览':'Mobile fixture'}]}));
    if(req.url==='/api/codex/thread/history/page')return res.end(JSON.stringify({entries,turns:activeTurn?[{id:'turn-fixture',status:'inProgress'}]:[]}));
    if(req.url==='/api/pending')return res.end(JSON.stringify(approved?[]:[{requestId:73,method:'item/commandExecution/requestApproval',params:{threadId:'mobile-fixture',command:'echo MOBILE_OK',cwd:'C:/fixture'}}]));
    if(req.url==='/api/codex/approval/command-execution'){assert.deepEqual(JSON.parse(text),{request_id:73,decision:'accept'});approved=true;return res.end('{}')}
    if(req.url==='/api/codex/turn/start'){const body=JSON.parse(text);assert.equal(body.threadId,'mobile-fixture');assert.equal(body.input[0].text,'Message from phone');sent=true;activeTurn=true;return res.end(JSON.stringify({turn:{id:'turn-fixture'}}))}
    if(req.url==='/api/codex/turn/interrupt'){activeTurn=false;emit('turn/completed',{});return res.end('{}')}
    if(req.url==='/api/events?agents=codex'){res.setHeader('Content-Type','text/event-stream');res.write(': connected\n\n');clients.add(res);req.on('close',()=>clients.delete(res));return}
    res.end('{}');
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByLabel('配对码').fill('synthetic-pair-code');await page.getByRole('button',{name:'配对',exact:true}).click();
    await page.getByRole('button',{name:previewMode?'界面预览':'Mobile fixture',exact:true}).click();
    await page.getByText('Safe history <img src=x onerror=alert(1)>',{exact:true}).waitFor();assert.equal(await page.locator('#history img').count(),0);
    assert.equal(await page.locator('.activity-group').count(),1);
    assert.equal(await page.locator('.activity-step').count(),0);
    assert.equal(await page.getByText(/DEEP_THINKING/).count(),0);
    await page.locator('.activity-group>summary').click();
    await page.locator('.activity-step>summary').first().click();
    await page.getByText(/DEEP_THINKING/).waitFor();
    emit('item/reasoning/textDelta',{itemId:'stream-reasoning',delta:'DO_NOT_STREAM_THOUGHT'});
    emit('item/commandExecution/outputDelta',{itemId:'stream-command',delta:'DO_NOT_STREAM_TOOL'});
    emit('item/agentMessage/delta',{itemId:'stream-answer',delta:'Streamed assistant reply'});
    await page.locator('#live').getByText('Streamed assistant reply',{exact:true}).waitFor();
    assert(!(await page.locator('#live').innerText()).includes('DO_NOT_STREAM'));
    entries.push({turnId:'turn-fixture',item:{id:'stream-answer',type:'agentMessage',text:'Streamed assistant reply'}});
    emit('item/completed',{item:entries.at(-1).item});
    await page.locator('#history').getByText('Streamed assistant reply',{exact:true}).waitFor();
    await page.waitForFunction(()=>document.querySelector('#live').textContent==='');
    assert.equal(await page.locator('.activity-group').evaluate(n=>n.open),true);
    assert.equal(await page.locator('.activity-step').first().evaluate(n=>n.open),true);
    await page.locator('.activity-group>summary').click();
    await page.getByRole('button',{name:'允许这一次',exact:true}).click();assert(approved);
    await page.getByLabel('消息',{exact:true}).fill('Message from phone');await page.getByRole('button',{name:'发送',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#input').value==='');assert(sent);
    const stopAction=page.getByRole('button',{name:'停止当前任务',exact:true});
    await stopAction.waitFor({state:'visible'});
    assert.equal(await page.getByRole('button',{name:'发送',exact:true}).count(),0);
    const actionBox=await stopAction.boundingBox(),composerBox=await page.locator('#composer').boundingBox();
    assert(actionBox&&composerBox&&Math.abs(composerBox.x+composerBox.width-actionBox.x-actionBox.width)<24);
    await stopAction.click();await page.getByRole('button',{name:'发送',exact:true}).waitFor({state:'visible'});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    const output=process.env.LAN_SCREENSHOT || path.join(require('os').tmpdir(),'lemma-lan-mobile.png');await page.screenshot({path:output,fullPage:true});console.log(JSON.stringify({paired,approved,sent,screenshot:output}));
    await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
    const back=page.getByRole('button',{name:'返回会话列表',exact:true});
    const box=await back.boundingBox();assert(box&&box.y>=0&&box.y<60&&box.x<100);
    await page.screenshot({path:output.replace('.png','-sticky.png')});
    await back.click();await page.locator('#recents').waitFor({state:'visible'});
    await page.getByRole('button',{name:previewMode?'界面预览':'Mobile fixture',exact:true}).click();
    await page.locator('#chat').waitFor({state:'visible'});
    await page.goBack();await page.locator('#recents').waitFor({state:'visible'});
    console.log('Collapsed 51-step activity, assistant-only streaming, retained expansion, sticky Back and browser Back passed.');
    const dark=await browser.newPage({viewport:{width:360,height:800},isMobile:true,hasTouch:true,colorScheme:'dark'});
    await dark.goto(`http://127.0.0.1:${server.address().port}`);
    await dark.getByRole('button',{name:previewMode?'界面预览':'Mobile fixture',exact:true}).click();
    await dark.locator('.activity-group').waitFor();
    assert.equal(await dark.locator('.activity-step').count(),0);
    assert(await dark.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await dark.screenshot({path:output.replace('.png','-dark.png')});
    await dark.close();
    previewMode=true;activeTurn=false;
    entries.splice(0,entries.length,
      {turnId:'preview',item:{id:'preview-user',type:'userMessage',content:[{text:'把移动端整理得清爽一点，操作尽量像 Codex。'}]}},
      {turnId:'preview',item:{id:'preview-thought',type:'reasoning',summary:['Review the layout'],content:[]}},
      {turnId:'preview',item:{id:'preview-command',type:'commandExecution',command:'检查界面布局',aggregatedOutput:'Preview only'}},
      {turnId:'preview',item:{id:'preview-answer',type:'agentMessage',text:'已调整好了。\n\n工具和思考收在活动步骤里，正文保持清晰。想看具体过程时，点开对应步骤就可以。\n\n返回按钮留在左上角，长对话滚到底也能随时返回。发送与停止共用输入框右下角的位置。'}});
    for(const scheme of ['light','dark']){
      const preview=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,colorScheme:scheme});
      await preview.goto(`http://127.0.0.1:${server.address().port}`);
      await preview.getByRole('button',{name:'界面预览',exact:true}).click();
      await preview.locator('.message-assistant').waitFor();
      await preview.getByLabel('消息',{exact:true}).fill('继续优化一下细节。');
      const inputBox=await preview.locator('#composer').boundingBox();assert(inputBox&&inputBox.y+inputBox.height>=800&&inputBox.y+inputBox.height<=844);
      await preview.screenshot({path:output.replace('.png',`-preview-${scheme}.png`)});
      emit('turn/started',{turn:{id:'preview-active'}});
      await preview.getByRole('button',{name:'停止当前任务',exact:true}).waitFor({state:'visible'});
      await preview.screenshot({path:output.replace('.png',`-preview-${scheme}-running.png`)});
      await preview.close();
    }
    const nojs=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});
    await nojs.goto(`http://127.0.0.1:${server.address().port}`);
    assert((await nojs.locator('noscript').innerText()).includes('JavaScript'));
    assert(await nojs.getByRole('button',{name:'配对',exact:true}).isDisabled());
    console.log('JavaScript-disabled fallback: visible and non-interactive');
  } finally {await browser.close();server.closeAllConnections();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
