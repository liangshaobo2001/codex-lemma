const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs');
const outputDir=process.env.GIT_SCALE_OUTPUT || fs.mkdtempSync(require('path').join(require('os').tmpdir(),'lemma-git-scale-'));
fs.mkdirSync(outputDir,{recursive:true});
console.log('Evidence directory:',outputDir);const path=require('path');const {execFileSync}=require('child_process');const assert=require('assert/strict');
(async()=>{
 if(!process.env.LEMMA_TEST_API_URL)throw Error('Set LEMMA_TEST_API_URL to a local Lemma Git test backend.');
 const cwd=fs.mkdtempSync(path.join(outputDir,'repo-')).replaceAll('\\','/');
 const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',windowsHide:true}).trim();
 git('init','-b','main');git('config','core.autocrlf','false');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
 git('remote','add','origin','https://example.invalid/fixture/fixture.git');
 for(const file of ['modified.txt','staged.txt','both.txt'])fs.writeFileSync(cwd+'/'+file,'base\n');
 git('add','.');git('commit','-m','Fixture baseline');
 for(const file of ['modified.txt','staged.txt','both.txt'])fs.writeFileSync(cwd+'/'+file,'changed\n');
 git('add','staged.txt','both.txt');fs.appendFileSync(cwd+'/both.txt','working\n');
 fs.mkdirSync(cwd+'/untracked');for(let i=0;i<300;i++)fs.writeFileSync(cwd+`/untracked/file-${i}.txt`,'new\n');
 const api=async(endpoint,body)=>{const response=await fetch(process.env.LEMMA_TEST_API_URL+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const text=await response.text();if(!response.ok)throw Error(endpoint+' '+text);return {text,status:response.status}};
 const initial=await api('/api/git/status',{cwd});assert.equal(JSON.parse(initial.text).entries.length,303);
 const browser=await chromium.launch({...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {channel:'msedge'}),headless:true});
 const context=await browser.newContext({viewport:{width:1400,height:900}});const page=await context.newPage();const mutations=[];
 await context.route('**/api/**',async route=>{
  const url=new URL(route.request().url()).pathname;const body=route.request().postDataJSON()||{};
  if(url.startsWith('/api/git/')){
   assert(['branch-info','status','diff-stats','file-diff-meta','file-diff','stage-files','unstage-files','reverse-files'].some(x=>url==='/api/git/'+x));
   body.cwd=cwd;
   if(/stage-files|reverse-files/.test(url))mutations.push({url,body});
   const result=await api(url,body);await route.fulfill({status:result.status,contentType:'application/json',body:result.text});
  }else await route.fulfill({json:url.includes('read-directory')?[]:{}});
 });
 try{
  await page.goto((process.env.GIT_FIXTURE_URL || 'http://127.0.0.1:1438/tests/browser/git-scale.html'),{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Toggle review',exact:true}).click();
  const search=page.getByRole('textbox');const tree=page.getByRole('region',{name:'Changed file tree'});const diffs=page.getByRole('region',{name:'Changed file diffs'});
  await search.fill('modified.txt');const modified=tree.locator('[data-git-row="file:modified.txt"]');await modified.waitFor();await modified.hover();await modified.getByRole('button',{name:'Stage file',exact:true}).click();
  await page.waitForTimeout(200);assert.equal(git('diff','--cached','--name-only').split('\n').includes('modified.txt'),true);
  await page.getByRole('combobox').first().click();await page.getByRole('option',{name:/^staged/i}).click();
  await modified.waitFor();await modified.hover();await modified.getByRole('button',{name:'Unstage file',exact:true}).click();
  await page.waitForTimeout(200);assert.equal(git('diff','--cached','--name-only').split('\n').includes('modified.txt'),false);
  await page.getByRole('combobox').first().click();await page.getByRole('option',{name:/^unstaged/i}).click();
  const card=diffs.locator('[data-git-row="modified.txt"]');await card.waitFor();await card.getByTitle('Revert file changes',{exact:true}).click();await card.getByRole('button',{name:'Revert',exact:true}).click();
  await page.waitForTimeout(200);assert.equal(fs.readFileSync(cwd+'/modified.txt','utf8'),'base\n');
  assert.equal(fs.readFileSync(cwd+'/staged.txt','utf8'),'changed\n');assert.equal(fs.readFileSync(cwd+'/both.txt','utf8'),'changed\nworking\n');
  await search.fill('');await tree.evaluate(el=>el.scrollTop=el.scrollHeight);await page.waitForTimeout(150);
  const last=tree.locator('[data-git-row^="file:untracked/"]').last();const target=(await last.getAttribute('data-git-row')).slice(5);await last.hover();await last.getByRole('button',{name:'Stage file',exact:true}).click();
  await page.waitForTimeout(200);assert(git('diff','--cached','--name-only').split('\n').includes(target));
  assert.equal(git('diff','--cached','--name-only').split('\n').length,3);
  const result={pass:true,cwd,initialEntries:303,mutations,staged:git('diff','--cached','--name-only')};
  fs.writeFileSync(outputDir+'/real-git.json',JSON.stringify(result,null,2));console.log(result);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});

