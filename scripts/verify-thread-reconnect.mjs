// No real models: private temporary home and loopback Responses endpoints only.
// Usage: CODEX_PATH=<exact CLI executable> node scripts/verify-thread-reconnect.mjs [unload-delay-seconds]
import {mkdtempSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import http from 'node:http';
const root=fileURLToPath(new URL('../',import.meta.url));
const cli=process.env.CODEX_PATH;
if(!cli || !existsSync(cli)) throw Error('Set CODEX_PATH to the exact Codex CLI executable being verified.');
const cliVersion=execFileSync(cli,['--version'],{encoding:'utf8'}).trim();
const home=mkdtempSync(join(tmpdir(),'lemma-model-native-'));
const requests=[];const requestEfforts=[];
const sandbox='read-only'; const delay=Number(process.argv[2]||0);
if(!Number.isSafeInteger(delay) || delay<0) throw Error('Unload delay must be a nonnegative integer.');
const server=http.createServer(async(req,res)=>{
 let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw||'{}');
 if(typeof body.model!=='string'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data:[]}));return;}
 if (!body.input?.[0]?.content?.includes?.('tool-protocol self-test')) { requests.push({provider:req.url.split('/')[1],model:body.model});requestEfforts.push(body.reasoning?.effort??null); }
 if(raw.includes('HOLD_ACTIVE_FIXTURE'))await new Promise(r=>setTimeout(r,1500));
 const n=requests.length;
 const item={id:'m'+n,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Synthetic response.',annotations:[]}]};
 const response={id:'r'+n,object:'response',model:body.model,status:'completed',output:[item],usage:{input_tokens:20,output_tokens:5,total_tokens:25}};
 res.writeHead(200,{'content-type':'text/event-stream'});
 for(const event of [{type:'response.created',response:{...response,status:'in_progress',output:[]}},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response}])res.write('event: '+event.type+'\ndata: '+JSON.stringify(event)+'\n\n');res.end();
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
writeFileSync(join(home,'.lemma-synthetic-history'),'Synthetic model fixture.');
const port=server.address().port;
writeFileSync(join(home,'config.toml'),`thread_unload_delay_secs=${delay}\nopenai_base_url="http://127.0.0.1:${port}/openai/v1"\nmodel="gpt-6-astra"\nmodel_provider="fixture_a"\n[features]\nstep_model_switching=true\n[model_providers.fixture_a]\nname="Fixture A"\nbase_url="http://127.0.0.1:${port}/fixture_a/v1"\nwire_api="responses"\nrequires_openai_auth=false\n[model_providers.fixture_b]\nname="Fixture B"\nbase_url="http://127.0.0.1:${port}/fixture_b/v1"\nwire_api="responses"\nrequires_openai_auth=false\n[windows]\nsandbox="unelevated"\n`);
const digest=()=>createHash('sha256').update(readFileSync(join(home,'config.toml'))).digest('hex');
const configBefore=digest();
const child=spawn('cargo',['run','--locked','-p','codexia-codex','--example','model_fixture'],{cwd:root,env:{...process.env,LEMMA_FIXTURE_INITIAL_PROVIDER:'openai',HTTP_PROXY:'http://127.0.0.1:9',HTTPS_PROXY:'http://127.0.0.1:9',ALL_PROXY:'http://127.0.0.1:9',NO_PROXY:'127.0.0.1,localhost',OPENAI_API_KEY:'synthetic-not-a-credential',CODEX_HOME:home,LEMMA_FIXTURE_SANDBOX:sandbox,CODEX_PATH:cli},stdio:['ignore','pipe','pipe']});
let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
const code=await new Promise(r=>child.once('exit',r));
writeFileSync(join(home,'fixture.log'),stdout+'\n'+stderr);
const expected=[{provider:'openai',model:'gpt-6.1-sol'},{provider:'fixture_b',model:'deepseek-v4.1-flash'},{provider:'fixture_a',model:'qwen-fixture'},{provider:'fixture_a',model:'qwen-fixture-2'},{provider:'openai',model:'gpt-6.1-sol'},{provider:'fixture_a',model:'gpt-6.1-sol'},{provider:'fixture_a',model:'gpt-6-astra'},{provider:'fixture_b',model:'deepseek-v4.1-flash'}];
const verified=code===0&&configBefore===digest()&&requestEfforts[0]==='low'&&JSON.stringify(requests)===JSON.stringify(expected);
writeFileSync(join(home,'result.json'),JSON.stringify({home,cli,cliVersion,delay,configUnchanged:configBefore===digest(),code,verified,requests,requestEfforts,stdout},null,2));
console.log(JSON.stringify({home,cli,cliVersion,delay,configUnchanged:configBefore===digest(),code,verified,requests,requestEfforts,stdout,errors:code?stderr.slice(-2400):undefined},null,2));
server.closeAllConnections();server.close();if(!verified)process.exitCode=1;
