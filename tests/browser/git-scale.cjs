const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs');
const outputDir=process.env.GIT_SCALE_OUTPUT || fs.mkdtempSync(require('path').join(require('os').tmpdir(),'lemma-git-scale-'));
fs.mkdirSync(outputDir,{recursive:true});
console.log('Evidence directory:',outputDir);
(async()=>{
 const results=[];
 const browser=await chromium.launch({...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {channel:'msedge'}),headless:true,args:['--enable-precise-memory-info']});
 for(const n of (process.argv[3] ? [Number(process.argv[3])] : [0,1000,41569])){
  const context=await browser.newContext({viewport:{width:1400,height:900}});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let requests={};
  await context.route('**/api/**',async route=>{
   const url=new URL(route.request().url()).pathname;requests[url]=(requests[url]||0)+1;
   const body=route.request().postDataJSON()||{};
   let data={};
   if(url.endsWith('/branch-info'))data={owner:'fixture',repo:'fixture',branch:'main'};
   if(url.endsWith('/status'))data={repo_root:body.cwd,entries:Array.from({length:n},(_,i)=>({path:`work/group-${Math.floor(i/100)}/file-${i}.txt`,index_status:'?',worktree_status:'?'}))};
   if(url.endsWith('/diff-stats'))data={staged:{additions:0,deletions:0},unstaged:{additions:0,deletions:0}};
   if(url.endsWith('/file-diff-meta'))data={old_bytes:0,new_bytes:4,total_bytes:4,is_binary:false};
   if(url.endsWith('/file-diff'))data={old_content:'',new_content:'ok\n',has_changes:true,is_binary:false};
   if(url.endsWith('/read-file'))data='ok';
   if(url.includes('/read-directory') || url.includes('/todo'))data=[];
   await route.fulfill({json:data});
  });
  const client=await context.newCDPSession(page);
  const sample=async label=>({label,n,dom:await client.send('Memory.getDOMCounters'),heap:await page.evaluate(()=>performance.memory?.usedJSHeapSize),elements:await page.locator('*').count(),requests:{...requests}});
  const clicked=async name=>{const t=performance.now();await page.getByRole('button',{name,exact:true}).click({timeout:120000});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));return Math.round(performance.now()-t)};
  const t=performance.now();await page.goto((process.env.GIT_FIXTURE_URL || 'http://127.0.0.1:1438/tests/browser/git-scale.html'),{waitUntil:'networkidle',timeout:120000});
  await page.waitForTimeout(1000);
  results.push({...await sample('closed'),loadMs:Math.round(performance.now()-t)}); console.log(JSON.stringify(results.at(-1))); fs.writeFileSync(outputDir+'/'+(process.argv[2]||'result')+'.json',JSON.stringify(results,null,2)); if(process.argv[4]==='closed-only'){await context.close();continue;}
  const openMs=await clicked('Toggle review');await page.waitForTimeout(1200);results.push({...await sample('open'),openMs});
  const settingsMs=await clicked('Settings');results.push({...await sample('settings'),settingsMs});
  const returnMs=await clicked('Settings');await page.waitForTimeout(600);results.push({...await sample('returned'),returnMs});
  results.push({n,errors});console.log(JSON.stringify(results.slice(-5)));
  await context.close();
 }
 await browser.close();fs.writeFileSync(outputDir+'/'+(process.argv[2]||'result')+'.json',JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exit(1)});

