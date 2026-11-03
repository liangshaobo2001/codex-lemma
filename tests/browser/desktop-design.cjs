const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const out = process.env.DESIGN_OUTPUT || require('node:os').tmpdir() + '/lemma-design';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel:'msedge',headless:true,args:['--disable-gpu'] });
  const evidence = [];
  try {
    for (const theme of ['light','dark']) {
      const context = await browser.newContext({ viewport:{width:1440,height:900}, colorScheme:theme });
      const page = await context.newPage(), errors = [], forbidden = [], requests = [];
      page.on('pageerror',error=>errors.push(error.message));
      await context.route('**/*',async route=>{
        const request=route.request(),url=new URL(request.url());
        if(url.origin!=='http://127.0.0.1:1441'){forbidden.push(url.origin);return route.abort()}
        if(!url.pathname.startsWith('/api/'))return route.continue();
        const path=url.pathname;requests.push(path);
        if(/\/turn\/|\/thread\/(start|resume|fork|revert)/.test(path)){forbidden.push(path);return route.abort()}
        let data={data:[],nextCursor:null,marketplaces:[]};
        if(path.endsWith('/thread/list'))data={data:await page.evaluate(()=>window.previewThreads||[]),nextCursor:null};
        else if(path.includes('/account'))data={account:null,requiresOpenaiAuth:false};
        else if(path.includes('/pending'))data=[];
        else if(path.includes('/status'))data={repo_root:'D:/Demo/website',entries:[]};
        else if(path.includes('/branch-info'))data={owner:'demo',repo:'website',branch:'main'};
        else if(path.includes('read-directory')||path.includes('list-directory')||path.includes('/todo'))data=[];
        else if(path.includes('/settings')||path.includes('/config'))data={};
        await route.fulfill({json:data});
      });
      await context.routeWebSocket('**/*',socket=>socket.close());
      await page.goto('http://127.0.0.1:1441/tests/browser/desktop-design.html',{waitUntil:'networkidle'});
      await page.getByText('更安静的聊天界面',{exact:true}).waitFor();
      await page.locator('[data-composer-toolbar]').waitFor();
      await page.evaluate(()=>{
        (document.querySelector('[data-chat-composer]')||document.querySelector('[data-composer-toolbar]')?.closest('div.border.rounded-xl'))?.setAttribute('data-design-composer','');
        document.querySelectorAll('[data-chat-user-bubble], [data-slot=message-scroller-content] .bg-gray-100').forEach(node=>node.setAttribute('data-design-user',''));
      });
      assert.equal(await page.locator('[data-design-composer]').count(),1);
      assert.equal(await page.locator('[data-design-user]').count(),1);
      await page.mouse.move(1438,898);
      for(const variant of ['before','after']){
        await page.evaluate(value=>document.documentElement.dataset.lemmaDesign=value,variant);
        await page.waitForTimeout(300);
        await page.screenshot({path:`${out}/desktop-${theme}-${variant}.png`});
        evidence.push({theme,variant,userBubble:await page.locator('[data-design-user]').evaluate(el=>({radius:getComputedStyle(el).borderRadius,border:getComputedStyle(el).borderWidth})),composer:await page.locator('[data-design-composer]').evaluate(el=>({radius:getComputedStyle(el).borderRadius,border:getComputedStyle(el).borderColor}))});
      }
      assert.deepEqual(forbidden,[]);
      assert.deepEqual(errors,[]);
      await context.close();
      console.log(theme+' before/after captured; fixture requests '+new Set(requests).size);
    }
    fs.writeFileSync(`${out}/evidence.json`,JSON.stringify(evidence,null,2));
  } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
