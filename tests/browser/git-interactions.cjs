const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs');
const outputDir=process.env.GIT_SCALE_OUTPUT || fs.mkdtempSync(require('path').join(require('os').tmpdir(),'lemma-git-scale-'));
fs.mkdirSync(outputDir,{recursive:true});
console.log('Evidence directory:',outputDir);const assert=require('assert/strict');
(async()=>{
 const browser=await chromium.launch({...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {channel:'msedge'}),headless:true});
 const context=await browser.newContext({viewport:{width:1400,height:900}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const calls=[];
 await context.route('**/api/**',async route=>{
  const url=new URL(route.request().url()).pathname;const body=route.request().postDataJSON()||{};calls.push({url,body});let data={};
  if(url.endsWith('/branch-info'))data={owner:'fixture',repo:'fixture',branch:'main'};
  if(url.endsWith('/status'))data={repo_root:body.cwd,entries:Array.from({length:body.cwd.endsWith('other')?3:41569},(_,i)=>({path:`work/group-${Math.floor(i/100)}/file-${i}.txt`,index_status:'?',worktree_status:'?'}))};
  if(url.endsWith('/diff-stats'))data={staged:{additions:0,deletions:0},unstaged:{additions:0,deletions:0}};
  if(url.endsWith('/file-diff-meta'))data={old_bytes:0,new_bytes:4,total_bytes:4,is_binary:false};
  if(url.endsWith('/file-diff'))data={old_content:'',new_content:'ok\n',has_changes:true,is_binary:false};
  if(url.includes('/todo')||url.includes('/read-directory'))data=[];
  await route.fulfill({json:data});
 });
 try{
 await page.goto((process.env.GIT_FIXTURE_URL || 'http://127.0.0.1:1438/tests/browser/git-scale.html'),{waitUntil:'networkidle'});
 assert.equal(await page.locator('[data-git-row]').count(),0);
 await page.getByRole('button',{name:'Toggle review',exact:true}).click();
 const tree=page.getByRole('region',{name:'Changed file tree'});const diffs=page.getByRole('region',{name:'Changed file diffs'});
 await tree.waitFor();await page.waitForTimeout(300);
 await tree.evaluate(el=>el.scrollTop=el.scrollHeight);await page.waitForTimeout(200);
 // Tree order is lexical, so its final group is 99; search locates any file without truncation.
 const search=page.getByRole('textbox');
 await search.fill('file-41568.txt');
 const target=tree.locator('[data-git-row="file:work/group-415/file-41568.txt"]');await target.waitFor();
 await target.getByText('file-41568.txt',{exact:true}).click();
 await page.waitForTimeout(150);
 assert(calls.some(c=>c.url.endsWith('/file-diff')&&c.body.filePath==='work/group-415/file-41568.txt'));
 await search.fill('');await page.waitForTimeout(200);
 // Selection is still the same after filtering; explicitly choose another far file to exercise index jumping.
 await tree.evaluate(el=>el.scrollTop=el.scrollHeight);await page.waitForTimeout(200);
 const last=tree.locator('[data-git-row^="file:"]').last();const path=(await last.getAttribute('data-git-row')).slice(5);
 await last.locator('span[title]').click();await page.waitForTimeout(200);
 await diffs.locator(`[data-git-row="${path}"]`).waitFor({state:'visible'});
 assert(calls.some(c=>c.url.endsWith('/file-diff')&&c.body.filePath===path));
 const requestCount=calls.filter(c=>c.url.endsWith('/file-diff')).length;
 if(await page.getByTitle('Collapse all diffs',{exact:true}).count()) await page.getByTitle('Collapse all diffs',{exact:true}).click();
 await page.getByTitle('Expand all diffs',{exact:true}).click();await page.waitForTimeout(300);
 assert(await page.locator('[data-git-row]').count()<150);
 assert(calls.filter(c=>c.url.endsWith('/file-diff')).length-requestCount<100);
 const before=await diffs.evaluate(el=>el.scrollTop);
 await page.getByRole('button',{name:'Toggle review',exact:true}).click();assert.equal(await page.locator('[data-git-row]').count(),0);
 const reads=calls.filter(c=>c.url.endsWith('/file-diff')).length;
 await page.getByRole('button',{name:'File refresh',exact:true}).click();await page.waitForTimeout(500);
 assert.equal(calls.filter(c=>c.url.endsWith('/file-diff')).length,reads);
 await page.getByRole('button',{name:'Toggle review',exact:true}).click();await diffs.waitFor();await page.waitForTimeout(250);
 const after=await diffs.evaluate(el=>el.scrollTop);
 assert(Math.abs(after-before)<500,`scroll changed ${before} -> ${after}`);
 await page.getByRole('button',{name:'Other tab',exact:true}).click();assert.equal(await page.locator('[data-git-row]').count(),0);
 await page.getByRole('button',{name:'Review tab',exact:true}).click();await tree.waitFor();
 for(let i=0;i<4;i++){await page.getByRole('button',{name:'Settings',exact:true}).click();assert.equal(await page.locator('[data-git-row]').count(),0);await page.getByRole('button',{name:'Settings',exact:true}).click();await tree.waitFor();}
 await page.getByRole('button',{name:'Other workspace',exact:true}).click();await page.waitForTimeout(400);
 assert.equal(await tree.locator('[data-git-row^="file:"]').count(),3);
 assert(await page.locator('*').count()<2500);assert.deepEqual(errors,[]);
 const result={pass:true,path,scrollBefore:before,scrollAfter:after,finalElements:await page.locator('*').count(),errors};
 fs.writeFileSync(outputDir+'/functional.json',JSON.stringify(result,null,2));console.log(result);
 await page.screenshot({path:outputDir+'/git-fixed.png'});
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});

