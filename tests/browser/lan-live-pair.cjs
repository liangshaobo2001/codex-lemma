// Opt-in regression against a running LAN listener. No model messages are sent.
const assert=require('assert');const fs=require('fs');const crypto=require('crypto');const net=require('net');
if(process.env.RUN_LEMMA_LAN_LIVE_PAIR!=='1')throw Error('Set RUN_LEMMA_LAN_LIVE_PAIR=1 explicitly; this test consumes a new pairing code.');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const url=new URL(process.env.LEMMA_LAN_URL);const octets=url.hostname.split('.').map(Number);
 assert(url.protocol==='https:'&&net.isIPv4(url.hostname)&&(octets[0]===10||(octets[0]===192&&octets[1]===168)||(octets[0]===172&&octets[1]>=16&&octets[1]<=31)),'Use the private IPv4 address of the local LAN listener.');
 const certificate=new crypto.X509Certificate(fs.readFileSync(process.env.LEMMA_LAN_CERT_CHAIN));assert(certificate.checkIP(url.hostname),'Certificate must match the LAN address.');
 const pin=crypto.createHash('sha256').update(certificate.publicKey.export({type:'spki',format:'der'})).digest('base64');
 // Pin only this test server's public key in a temporary browser; no system trust changes.
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--ignore-certificate-errors-spki-list='+pin]});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.route('**/*',route=>new URL(route.request().url()).origin===url.origin?route.continue():route.abort());
  await context.addCookies([{name:'other_local_app',value:'synthetic',url:url.origin+'/'}]);
  const page=await context.newPage();await page.goto(url.origin+'/',{waitUntil:'domcontentloaded'});
  await page.getByText('尚未配对，请在电脑生成配对码。',{exact:true}).waitFor();
  const result=await fetch('http://127.0.0.1:7419/api/lan/code',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert(result.ok);
  const {code}=await result.json();await page.getByLabel('配对码',{exact:true}).fill(code);
  const paired=page.waitForResponse(r=>new URL(r.url()).pathname==='/pair');
  await page.getByRole('button',{name:'配对',exact:true}).click();assert.equal((await paired).status(),200);
  await page.waitForFunction(()=>!document.getElementById('app').hidden,{},{timeout:15000});
  const status=await page.evaluate(async()=>{const r=await fetch('/api/pending',{credentials:'same-origin'});return r.status});assert.equal(status,200);
  console.log(JSON.stringify({paired:true,unrelatedCookiePresent:true,authenticatedStatus:status}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
