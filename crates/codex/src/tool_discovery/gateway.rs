//! Private loopback transport. Provider credentials are forwarded in memory, never persisted.
use super::{probe,protocol::{Inventory,Mode},relay};
use axum::{Router,Json,body::Body,extract::{DefaultBodyLimit,OriginalUri,Path,State},http::{HeaderMap,StatusCode},response::{IntoResponse,Response},routing::post};
use codexia_shared::event_sink::EventSink;
use serde::{Deserialize,Serialize};
use serde_json::{Value,json};
use std::{collections::{BTreeMap,BTreeSet},hash::{Hash,Hasher},sync::Arc,time::{Duration,Instant}};
use tokio::sync::{Mutex,RwLock,mpsc};
use std::sync::atomic::{AtomicBool,Ordering};

#[derive(Clone,Debug,Default,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Policy { #[serde(default)] pub selected: BTreeSet<String> }

struct Route {
    thread_id:String, provider:String, base_url:String, auth_headers:Vec<String>,
    closed:AtomicBool,
    session:Arc<Mutex<relay::Session>>, status:Mutex<(String,Option<Mode>,Option<String>)>, last_model:Mutex<Option<String>>, capability_keys:Mutex<BTreeSet<u64>>,
}
struct Shared {
    reviewer:RwLock<Option<crate::reviewer::Target>>,
    secret:String, client:reqwest::Client, routes:RwLock<BTreeMap<String,Arc<Route>>>,
    capabilities:Mutex<BTreeMap<u64,Capability>>,
    policy_path:std::path::PathBuf,
    events:Arc<dyn EventSink>,
    metrics:Option<Arc<std::sync::Mutex<crate::request_metrics::Metrics>>>,
}
type Capability=Arc<Mutex<Option<(Mode,Instant)>>>;
pub struct Gateway { shared:Arc<Shared>, address:String, server:tokio::task::AbortHandle }
impl Drop for Gateway { fn drop(&mut self) { self.server.abort(); } }

fn store_path() -> Result<std::path::PathBuf,String> {
    dirs::home_dir().map(|p|p.join(".codex-lemma/tool-policies.json")).ok_or("User application directory is unavailable.".into())
}
static POLICY_LOCK:Mutex<()>=Mutex::const_new(());
async fn policy(path:&std::path::Path,thread:&str,change:Option<&Policy>) -> Result<Option<Policy>,String> {
    let _guard=POLICY_LOCK.lock().await;
    let mut policies:BTreeMap<String,Policy>=match std::fs::read(path) {
        Ok(bytes)=>serde_json::from_slice(&bytes).map_err(|_|"Tool selection settings could not be read.")?,
        Err(error) if error.kind()==std::io::ErrorKind::NotFound=>BTreeMap::new(),
        Err(_)=>return Err("Tool selection settings are unavailable.".into()),
    };
    if let Some(change)=change {
        if change.selected.len()>2000 || change.selected.iter().any(|key|key.len()>512) { return Err("Too many tool selections.".into()); }
        policies.insert(thread.into(),change.clone());
        if policies.len()>10_000 { return Err("Tool selection storage is full.".into()); }
        let directory=path.parent().unwrap();std::fs::create_dir_all(directory).map_err(|_|"Tool selection settings could not be saved.")?;
        let mut temporary=tempfile::NamedTempFile::new_in(directory).map_err(|_|"Tool selection settings could not be saved.")?;
        std::io::Write::write_all(&mut temporary,&serde_json::to_vec(&policies).map_err(|e|e.to_string())?).map_err(|_|"Tool selection settings could not be saved.")?;
        temporary.persist(path).map_err(|_|"Tool selection settings could not be saved.")?;
    }
    Ok(policies.remove(thread))
}

impl Gateway {
    pub async fn start(events:Arc<dyn EventSink>) -> Result<Self,String> {
        Self::start_with_policy_path(events,store_path()?).await
    }
    pub async fn start_with_policy_path(events:Arc<dyn EventSink>,policy_path:std::path::PathBuf) -> Result<Self,String> {
        Self::start_observed(events,Some(policy_path),None).await
    }
    pub(crate) async fn start_observed(events:Arc<dyn EventSink>,policy_path:Option<std::path::PathBuf>,metrics:Option<Arc<std::sync::Mutex<crate::request_metrics::Metrics>>>) -> Result<Self,String> {
        let policy_path=match policy_path {Some(path)=>path,None=>store_path()?};
        let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.map_err(|_|"Could not start the local tool adapter.")?;
        let address=format!("http://{}",listener.local_addr().map_err(|e|e.to_string())?);
        let shared=Arc::new(Shared{reviewer:RwLock::new(None),secret:uuid::Uuid::new_v4().simple().to_string(),
            client:reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).connect_timeout(Duration::from_secs(10)).build().map_err(|e|e.to_string())?,
            routes:RwLock::new(BTreeMap::new()),capabilities:Mutex::new(BTreeMap::new()),policy_path,events,metrics});
        let router=Router::new().route("/{secret}/{route}/responses",post(responses))
            .route("/{secret}/{route}/responses/compact",post(compact))
            .layer(DefaultBodyLimit::max(16*1024*1024)).with_state(Arc::clone(&shared));
        let server=tokio::spawn(async move { let _=axum::serve(listener,router).await; });
        Ok(Self{shared,address,server:server.abort_handle()})
    }

    pub async fn set_reviewer(&self,target:Option<crate::reviewer::Target>) {*self.shared.reviewer.write().await=target;}
    pub async fn register(&self,thread:&str,provider:&str,base_url:&str,auth_headers:Vec<String>) -> Result<String,String> {
        let url=reqwest::Url::parse(base_url).map_err(|_|"The provider URL is invalid.")?;
        if !matches!(url.scheme(),"http"|"https") || url.host_str().is_none() || !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() {
            return Err("Tool discovery requires an HTTP provider base URL without credentials, query or fragment.".into());
        }
        let mut routes=self.shared.routes.write().await;
        if let Some(metrics)=&self.shared.metrics && let Ok(mut metrics)=metrics.lock() {metrics.manage(thread,true);}
        if let Some((id,_))=routes.iter().find(|(_,r)|!r.closed.load(Ordering::Relaxed)&&r.thread_id==thread&&r.provider==provider&&r.base_url==base_url) {
            return Ok(format!("{}/{}/{id}",self.address,self.shared.secret));
        }
        // Connections are per active chat. Replacing a provider never changes the user's provider definition.
        for route in routes.values().filter(|route|route.thread_id==thread) {close_route(route).await;}
        if routes.values().filter(|route|!route.closed.load(Ordering::Relaxed)).count()>=128 || routes.len()>=4096 { return Err("Too many tool discovery sessions. Reopen Lemma to release inactive sessions.".into()); }
        let selected=policy(&self.shared.policy_path,thread,None).await?.unwrap_or_default().selected;
        let session=relay::Session{selected,..Default::default()};
        let route=Arc::new(Route{thread_id:thread.into(),provider:provider.into(),base_url:base_url.into(),auth_headers,closed:AtomicBool::new(false),
            session:Arc::new(Mutex::new(session)),status:Mutex::new(("waiting".into(),None,None)),last_model:Mutex::new(None),capability_keys:Mutex::new(BTreeSet::new())});
        let id=uuid::Uuid::new_v4().simple().to_string();routes.insert(id.clone(),route);
        Ok(format!("{}/{}/{id}",self.address,self.shared.secret))
    }

    pub async fn address_for(&self,thread:&str,provider:&str) -> Option<String> {
        self.shared.routes.read().await.iter().find(|(_,r)|!r.closed.load(Ordering::Relaxed)&&r.thread_id==thread&&r.provider==provider)
            .map(|(id,_)|format!("{}/{}/{id}",self.address,self.shared.secret))
    }

    pub async fn relabel(&self,pending:&str,thread:&str) -> Result<(),String> {
        if let Some(metrics)=&self.shared.metrics && let Ok(mut metrics)=metrics.lock() {metrics.manage(pending,false);metrics.manage(thread,true);}
        let mut routes=self.shared.routes.write().await;
        let Some((id,route))=routes.iter().find(|(_,r)|r.thread_id==pending).map(|(id,r)|(id.clone(),Arc::clone(r))) else { return Err("The new chat tool route is unavailable.".into()); };
        let status=route.status.lock().await.clone();
        let model=route.last_model.lock().await.clone();
        let keys=route.capability_keys.lock().await.clone();
        routes.insert(id,Arc::new(Route{thread_id:thread.into(),provider:route.provider.clone(),base_url:route.base_url.clone(),auth_headers:route.auth_headers.clone(),closed:AtomicBool::new(false),session:Arc::clone(&route.session),status:Mutex::new(status),last_model:Mutex::new(model),capability_keys:Mutex::new(keys)}));
        Ok(())
    }

    pub async fn snapshot(&self,thread:&str) -> Value {
        let route=self.shared.routes.read().await.values().find(|r|!r.closed.load(Ordering::Relaxed)&&r.thread_id==thread).cloned();
        let Some(route)=route else { return json!({"threadId":thread,"phase":"unavailable","mode":null,"tools":[],"selected":[],"error":null}); };
        let state=route.session.lock().await;let status=route.status.lock().await;
        json!({"threadId":thread,"provider":route.provider,"model":*route.last_model.lock().await,"catalogReady":state.wire_inventory,"phase":status.0,"mode":status.1,"error":status.2,
            "selected":state.selected,"tools":state.inventory.tools.values().filter(|t|t.deferred).map(|t|json!({"id":t.key,"name":t.name,"group":t.namespace,"description":t.spec["description"].as_str().unwrap_or("").chars().take(160).collect::<String>()})).collect::<Vec<_>>()})
    }

    pub async fn select(&self,thread:&str,selection:Policy) -> Result<Value,String> {
        let route=self.shared.routes.read().await.values().find(|r|!r.closed.load(Ordering::Relaxed)&&r.thread_id==thread).cloned().ok_or("This chat does not use a custom provider tool adapter.")?;
        let mut session=route.session.lock().await;
        if selection.selected.iter().any(|key|!session.inventory.tools.get(key).is_some_and(|tool|tool.deferred)) {
            return Err("A selected tool is no longer available. Refresh the tool list.".into());
        }
        policy(&self.shared.policy_path,thread,Some(&selection)).await?;session.selected=selection.selected;drop(session);
        Ok(self.snapshot(thread).await)
    }
    pub async fn usage(&self,thread:&str)->Result<Value,String> {
        let usage=super::observation::totals(&self.shared.policy_path.with_extension("usage.json"),thread).await?;
        Ok(json!({"threadId":thread,"usage":usage}))
    }
    pub async fn unmanage(&self,thread:&str) {
        if let Some(metrics)=&self.shared.metrics && let Ok(mut metrics)=metrics.lock() {metrics.manage(thread,false);}
    }
    pub async fn closed(&self,thread:&str) {
        let routes:Vec<_>=self.shared.routes.read().await.values().filter(|route|route.thread_id==thread).cloned().collect();
        for route in routes {close_route(&route).await;}self.unmanage(thread).await;
    }

    pub async fn catalog(&self,thread:&str,specs:&[Value])->Result<(),String> {
        let route=self.shared.routes.read().await.values().find(|r|!r.closed.load(Ordering::Relaxed)&&r.thread_id==thread).cloned().ok_or("This chat does not use a custom provider tool adapter.")?;
        let catalog=Inventory::parse(specs)?;let mut session=route.session.lock().await;
        if session.wire_inventory {return Ok(());}
        session.inventory.tools.retain(|_,tool|!tool.deferred);
        session.inventory.tools.extend(catalog.tools);session.inventory.assign_aliases();Ok(())
    }

    pub async fn retry(&self,thread:&str) -> Result<Value,String> {
        let route=self.shared.routes.read().await.values().find(|r|!r.closed.load(Ordering::Relaxed)&&r.thread_id==thread).cloned().ok_or("Tool discovery is unavailable for this chat.")?;
        let keys=route.capability_keys.lock().await.clone();self.shared.capabilities.lock().await.retain(|key,_|!keys.contains(key));
        *route.status.lock().await=("waiting".into(),None,None);
        Ok(self.snapshot(thread).await)
    }
}

fn forwarded_headers(headers:&HeaderMap) -> HeaderMap {
    headers.iter().filter(|(name,_)|!matches!(name.as_str(),"host"|"connection"|"content-length"|"content-encoding"|"accept-encoding"|"transfer-encoding"|"upgrade"|"proxy-authorization"|"proxy-connection"|"keep-alive"|"te"|"trailer"))
        .map(|(name,value)|(name.clone(),value.clone())).collect()
}
fn cache_key(route:&Route,headers:&HeaderMap,body:&Value,url:&str) -> u64 {
    let mut hash=std::collections::hash_map::DefaultHasher::new();route.provider.hash(&mut hash);route.base_url.hash(&mut hash);
    body["model"].as_str().hash(&mut hash);body.get("reasoning").map(Value::to_string).hash(&mut hash);
    url.hash(&mut hash);
    for name in &route.auth_headers { name.hash(&mut hash);headers.get(name).map(|h|h.as_bytes()).hash(&mut hash); }
    hash.finish()
}
async fn locate(shared:&Shared,secret:&str,id:&str) -> Option<Arc<Route>> {
    if secret!=shared.secret { return None; } shared.routes.read().await.get(id).cloned()
}
async fn close_route(route:&Route) {
    route.closed.store(true,Ordering::Relaxed);
    let mut session=route.session.lock().await;session.inventory=Inventory::default();session.loaded.clear();
    // Retain a small transport alias for subagents that inherited this URL before their parent closed.
}
async fn request_route(shared:&Shared,parent:Arc<Route>,headers:&HeaderMap)->Result<Arc<Route>,String> {
    let Some(thread)=headers.get("thread-id").and_then(|value|value.to_str().ok()).filter(|id|uuid::Uuid::parse_str(id).is_ok()) else {
        return if parent.closed.load(Ordering::Relaxed) {Err("This chat connection was replaced.".into())} else {Ok(parent)};
    };
    if thread==parent.thread_id {
        if parent.closed.load(Ordering::Relaxed) {return Err("This chat connection was replaced. Reopen the chat before sending.".into());}
        return Ok(parent);
    }
    let mut routes=shared.routes.write().await;
    if let Some(route)=routes.values().find(|route|!route.closed.load(Ordering::Relaxed)&&route.thread_id==thread&&route.provider==parent.provider&&route.base_url==parent.base_url) {return Ok(Arc::clone(route));}
    if routes.values().filter(|route|!route.closed.load(Ordering::Relaxed)).count()>=128 || routes.len()>=4096 {return Err("Too many active tool discovery sessions.".into());}
    let selected=match policy(&shared.policy_path,thread,None).await? {Some(policy)=>policy.selected,None=>parent.session.lock().await.selected.clone()};
    let route=Arc::new(Route{thread_id:thread.into(),provider:parent.provider.clone(),base_url:parent.base_url.clone(),auth_headers:parent.auth_headers.clone(),closed:AtomicBool::new(false),
        session:Arc::new(Mutex::new(relay::Session{selected,..Default::default()})),status:Mutex::new(("waiting".into(),None,None)),last_model:Mutex::new(None),capability_keys:Mutex::new(BTreeSet::new())});
    if let Some(metrics)=&shared.metrics&&let Ok(mut metrics)=metrics.lock(){metrics.manage(thread,true);}
    routes.insert(uuid::Uuid::new_v4().simple().to_string(),Arc::clone(&route));Ok(route)
}
async fn status(shared:&Shared,route:&Route,phase:&str,mode:Option<Mode>,error:Option<String>) {
    *route.status.lock().await=(phase.into(),mode,error.clone());
    shared.events.emit("codex:toolDiscovery",json!({"threadId":route.thread_id,"phase":phase,"mode":mode,"error":error}));
}
fn error(status:StatusCode,message:&str) -> Response { (status,Json(json!({"error":{"type":"tool_discovery_error","message":message}}))).into_response() }

fn endpoint_url(base:&str,suffix:&str,query:Option<&str>)->String {
    let mut url=format!("{}{suffix}",base.trim_end_matches('/'));
    if let Some(query)=query {url.push('?');url.push_str(query);}url
}
async fn review_route(shared:&Shared,parent:&Route,headers:&HeaderMap,body:&mut Value)->Result<(Arc<Route>,HeaderMap),String>{
    let target=shared.reviewer.read().await.clone().ok_or("The independent reviewer is unavailable. Use manual approval.")?;
    let child=headers.get("thread-id").and_then(|v|v.to_str().ok()).filter(|v|uuid::Uuid::parse_str(v).is_ok()).unwrap_or(&parent.thread_id);
    let key=format!("approval-review:{}:{child}",parent.thread_id);
    let mut routes=shared.routes.write().await;
    let route=if let Some(route)=routes.get(&key){Arc::clone(route)}else{
        if routes.len()>=4096{return Err("Too many reviewer connections. Reopen Lemma.".into());}
        let selected=parent.session.lock().await.selected.clone();
        let route=Arc::new(Route{thread_id:key.clone(),provider:target.provider.clone(),base_url:target.base_url.clone(),auth_headers:target.headers.keys().map(|k|k.as_str().to_string()).collect(),closed:AtomicBool::new(false),
            session:Arc::new(Mutex::new(relay::Session{selected,..Default::default()})),status:Mutex::new(("waiting".into(),None,None)),last_model:Mutex::new(None),capability_keys:Mutex::new(BTreeSet::new())});
        routes.insert(key,Arc::clone(&route));route
    };
    body["model"]=json!(target.model);
    if !body["reasoning"].is_object(){body["reasoning"]=json!({});}body["reasoning"]["effort"]=json!(target.effort);
    // Preserve CLI-generated policy, tool declarations and budgeted input verbatim.
    // These headers are rebuilt from the target definition; none are inherited from the main provider.
    let mut target_headers=target.headers;
    // Provider routing/cache identifiers are generated for this review route, never copied from the main account.
    for name in ["x-opencode-session","session-id","thread-id"] {
        if !target_headers.contains_key(name){target_headers.insert(reqwest::header::HeaderName::from_static(name),reqwest::header::HeaderValue::from_str(&route.thread_id).map_err(|_|"Invalid review session identifier.")?);}
    }
    Ok((route,target_headers))
}
async fn responses(State(shared):State<Arc<Shared>>,Path((secret,id)):Path<(String,String)>,OriginalUri(uri):OriginalUri,headers:HeaderMap,Json(mut body):Json<Value>) -> Response {
    let Some(route)=locate(&shared,&secret,&id).await else { return StatusCode::NOT_FOUND.into_response(); };
    let reviewing=body["model"]==crate::reviewer::ALIAS;
    if body["model"].as_str().is_some_and(|s|s.starts_with("lemma-internal-")) && !reviewing {return error(StatusCode::BAD_REQUEST,"Unknown internal reviewer model.");}
    let (route,headers)=if reviewing {
        match review_route(&shared,&route,&headers,&mut body).await{Ok(value)=>value,Err(message)=>return error(StatusCode::BAD_REQUEST,&message)}
    }else{(match request_route(&shared,route,&headers).await {Ok(route)=>route,Err(message)=>return error(StatusCode::BAD_REQUEST,&message)},headers)};
    if body["stream"]!=true { return error(StatusCode::BAD_REQUEST,"The tool adapter requires a streaming Responses request."); }
    // Responses permits omitting tools when this model has no exposed tools.
    if body.get("tools").is_none() { body["tools"]=json!([]); }
    *route.last_model.lock().await=body["model"].as_str().map(str::to_string);
    let inventory=match body["tools"].as_array().ok_or_else(||"Tool definitions must be an array.".to_string()).and_then(|tools|Inventory::parse(tools)) {
        Ok(inventory)=>inventory,
        Err(message)=>{status(&shared,&route,"error",None,Some(message.clone())).await;return error(StatusCode::BAD_REQUEST,&message);}
    };
    let endpoint=probe::Endpoint{url:endpoint_url(&route.base_url,"/responses",if reviewing{None}else{uri.query()}),headers:forwarded_headers(&headers)};
    let observer=super::observation::Observer{thread_id:route.thread_id.clone(),usage_path:shared.policy_path.with_extension("usage.json"),events:Arc::clone(&shared.events),metrics:shared.metrics.clone()};
    let (tx,rx)=mpsc::channel::<Vec<u8>>(16);
    tokio::spawn(async move {
        let work=async {
            let needs_discovery=inventory.tools.values().any(|t|t.deferred)||inventory.other.iter().any(|spec|spec["type"]=="tool_search");
            if !inventory.other.iter().any(|spec|spec["type"]=="tool_search") {let mut state=route.session.lock().await;state.inventory=inventory;state.wire_inventory=true;}
            if !needs_discovery {
                status(&shared,&route,"ready",None,None).await;
                if let Err(message)=relay::run_observed(&shared.client,&endpoint,body,Mode::Direct,Arc::clone(&route.session),&tx,Some(&observer)).await {
                    status(&shared,&route,"error",None,Some(message.clone())).await;
                    let _=tx.send(format!("event: response.failed\ndata: {}\n\n",super::wire::failure(&message)).into_bytes()).await;
                }
                return;
            }
            let key=cache_key(&route,&endpoint.headers,&body,&endpoint.url);
            route.capability_keys.lock().await.insert(key);
            let cache={ let mut cache=shared.capabilities.lock().await;Arc::clone(cache.entry(key).or_insert_with(||Arc::new(Mutex::new(None)))) };
            let mut cache=cache.lock().await;
            let mode=if let Some((mode,at))=*cache && at.elapsed()<Duration::from_secs(6*60*60) { mode }
                else {
                    status(&shared,&route,"probing",None,None).await;
                    let result=tokio::time::timeout(Duration::from_secs(90),probe::negotiate(&shared.client,&endpoint,body["model"].as_str().unwrap_or(""),body.get("reasoning"))).await;
                    match result {
                        Ok(Ok(mode))=>{*cache=Some((mode,Instant::now()));mode},
                        result=>{
                            let message=match result { Ok(Err(message))=>message,_=>"Tool capability detection timed out. Retry when the provider is available.".into() };
                            status(&shared,&route,"error",None,Some(message.clone())).await;
                            let _=tx.send(format!("event: response.failed\ndata: {}\n\n",super::wire::failure(&message)).into_bytes()).await;return;
                        },
                    }
                };
            drop(cache);let mut mode=mode;
            loop {
                status(&shared,&route,"ready",Some(mode),None).await;
                let Err(message)=relay::run_observed(&shared.client,&endpoint,body.clone(),mode,Arc::clone(&route.session),&tx,Some(&observer)).await else {break;};
                // These rejections occur before the relay forwards any response events or tool calls.
                // Never replay a request after streaming has begun or after an execution result.
                if mode!=Mode::Direct && [400,415,422].iter().any(|code|message==format!("Provider rejected the initial request (HTTP {code}).")) {
                    mode=if mode==Mode::Native {
                        status(&shared,&route,"probing",None,None).await;
                        match tokio::time::timeout(Duration::from_secs(60),probe::verify(&shared.client,&endpoint,body["model"].as_str().unwrap_or(""),body.get("reasoning"),Mode::Function)).await {
                            Ok(Ok(true))=>Mode::Function,
                            Ok(Ok(false))=>Mode::Direct,
                            _=>{
                                let message="Tool compatibility could not be checked. Retry when the provider is available.";
                                status(&shared,&route,"error",None,Some(message.into())).await;
                                let _=tx.send(format!("event: response.failed\ndata: {}\n\n",super::wire::failure(message)).into_bytes()).await;break;
                            },
                        }
                    } else {Mode::Direct};
                    if let Some(entry)=shared.capabilities.lock().await.get(&key).cloned() {*entry.lock().await=Some((mode,Instant::now()));}
                    continue;
                }
                status(&shared,&route,"error",Some(mode),Some(message.clone())).await;
                let _=tx.send(format!("event: response.failed\ndata: {}\n\n",super::wire::failure(&message)).into_bytes()).await;break;
            }
        };
        tokio::select! { _=tx.closed()=>{},_=work=>{} }
    });
    let stream=futures::stream::unfold(rx,|mut receiver|async {receiver.recv().await.map(|bytes|(Ok::<_,std::convert::Infallible>(bytes),receiver))});
    ([("content-type","text/event-stream"),("cache-control","no-store")],Body::from_stream(stream)).into_response()
}

async fn compact(State(shared):State<Arc<Shared>>,Path((secret,id)):Path<(String,String)>,OriginalUri(uri):OriginalUri,headers:HeaderMap,Json(mut body):Json<Value>) -> Response {
    let Some(route)=locate(&shared,&secret,&id).await else { return StatusCode::NOT_FOUND.into_response(); };
    let reviewing=body["model"]==crate::reviewer::ALIAS;
    if body["model"].as_str().is_some_and(|s|s.starts_with("lemma-internal-")) && !reviewing {return error(StatusCode::BAD_REQUEST,"Unknown internal reviewer model.");}
    let (route,headers)=if reviewing{match review_route(&shared,&route,&headers,&mut body).await{Ok(value)=>value,Err(message)=>return error(StatusCode::BAD_REQUEST,&message)}}else{(route,headers)};
    match shared.client.post(endpoint_url(&route.base_url,"/responses/compact",if reviewing{None}else{uri.query()})).headers(forwarded_headers(&headers)).json(&body).send().await {
        Ok(mut response)=>{
            let status=response.status();let content_type=response.headers().get("content-type").cloned();
            let mut bytes=Vec::new();
            loop { match response.chunk().await {
                Ok(Some(chunk)) if bytes.len()+chunk.len()<=super::wire::MAX_RESPONSE_BYTES=>bytes.extend_from_slice(&chunk),
                Ok(None)=>break,
                _=>return error(StatusCode::BAD_GATEWAY,"Provider compaction response could not be read within its limit."),
            }}
            let mut response=(status,bytes).into_response();
            if let Some(value)=content_type { response.headers_mut().insert("content-type",value); }
            response
        },
        Err(_)=>error(StatusCode::BAD_GATEWAY,"Provider compaction request could not be completed."),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cache_is_scoped_to_endpoint_model_and_credentials_but_not_session_trace() {
        let route=Route{thread_id:"fixture".into(),provider:"local".into(),base_url:"http://127.0.0.1:1/v1".into(),auth_headers:vec!["authorization".into()],closed:AtomicBool::new(false),session:Arc::new(Mutex::new(relay::Session::default())),status:Mutex::new(("waiting".into(),None,None)),last_model:Mutex::new(None),capability_keys:Mutex::new(BTreeSet::new())};
        let mut headers=HeaderMap::new();headers.insert("authorization","Bearer fixture".parse().unwrap());
        let body=json!({"model":"qwen"});let key=cache_key(&route,&headers,&body,"http://fixture/responses");
        headers.insert("x-request-id","other".parse().unwrap());assert_eq!(cache_key(&route,&headers,&body,"http://fixture/responses"),key);
        assert_ne!(cache_key(&route,&headers,&json!({"model":"other"}),"http://fixture/responses"),key);
        assert_ne!(cache_key(&route,&headers,&body,"http://fixture/responses?version=other"),key);
        headers.insert("authorization","Bearer changed".parse().unwrap());assert_ne!(cache_key(&route,&headers,&body,"http://fixture/responses"),key);
    }
    #[tokio::test]
    async fn inherited_child_routes_remain_independent_when_parent_changes_provider() {
        struct Sink;impl EventSink for Sink{fn emit(&self,_:&str,_:Value){}}
        let directory=tempfile::tempdir().unwrap();let gateway=Gateway::start_with_policy_path(Arc::new(Sink),directory.path().join("policy.json")).await.unwrap();
        let parent=uuid::Uuid::new_v4().to_string();let child=uuid::Uuid::new_v4().to_string();
        gateway.register(&parent,"first","http://127.0.0.1:1/v1",vec![]).await.unwrap();
        gateway.catalog(&parent,&[json!({"type":"namespace","name":"mcp__fixture","tools":[{"type":"function","name":"read","parameters":{"type":"object"}}]})]).await.unwrap();
        gateway.select(&parent,Policy{selected:BTreeSet::from(["mcp__fixture.read".into()])}).await.unwrap();
        let original=gateway.shared.routes.read().await.values().find(|route|route.thread_id==parent).cloned().unwrap();
        let mut headers=HeaderMap::new();headers.insert("thread-id",child.parse().unwrap());
        let inherited=request_route(&gateway.shared,Arc::clone(&original),&headers).await.unwrap();
        assert_eq!(inherited.thread_id,child);assert!(inherited.session.lock().await.selected.contains("mcp__fixture.read"));
        inherited.session.lock().await.selected.clear();assert!(original.session.lock().await.selected.contains("mcp__fixture.read"));
        gateway.closed(&parent).await;gateway.register(&parent,"second","http://127.0.0.1:2/v1",vec![]).await.unwrap();
        let still_inherited=request_route(&gateway.shared,Arc::clone(&original),&headers).await.unwrap();assert_eq!(still_inherited.provider,"first");
        assert_eq!(gateway.snapshot(&parent).await["provider"],"second");assert!(original.session.lock().await.inventory.tools.is_empty());
        headers.insert("thread-id",parent.parse().unwrap());assert!(request_route(&gateway.shared,original,&headers).await.is_err());
    }

    #[tokio::test]
    async fn http_transport_preserves_auth_queries_compaction_and_reports_truncated_streams() {
        struct Sink;impl EventSink for Sink{fn emit(&self,_:&str,_:Value){}}
        let seen=Arc::new(Mutex::new(Vec::<(String,String,Value)>::new()));
        let captures=Arc::clone(&seen);
        let upstream=Router::new().fallback(post(move |OriginalUri(uri):OriginalUri,headers:HeaderMap,Json(body):Json<Value>|{
            let captures=Arc::clone(&captures);
            async move {
                captures.lock().await.push((uri.to_string(),headers.get("authorization").unwrap().to_str().unwrap().into(),body.clone()));
                if uri.path().ends_with("/compact") {return Json(json!({"object":"response.compaction","output":[]})).into_response();}
                let created=json!({"type":"response.created","response":{"id":"fixture","status":"in_progress","output":[]}});
                let mut bytes=format!("event: response.created\ndata: {created}\n\n");
                if body["model"]!="truncated" {
                    let completed=json!({"type":"response.completed","response":{"id":"fixture","status":"completed","output":[],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}});
                    bytes.push_str(&format!("event: response.completed\ndata: {completed}\n\n"));
                }
                ([("content-type","text/event-stream")],bytes).into_response()
            }
        }));
        let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();let address=listener.local_addr().unwrap();
        let server=tokio::spawn(async move{axum::serve(listener,upstream).await.unwrap()});
        let directory=tempfile::tempdir().unwrap();let gateway=Gateway::start_with_policy_path(Arc::new(Sink),directory.path().join("policy.json")).await.unwrap();
        let base=gateway.register("fixture","custom",&format!("http://{address}/v1"),vec!["authorization".into()]).await.unwrap();
        let client=reqwest::Client::new();let body=json!({"model":"plain","stream":true,"input":[]});
        let bad=client.post(format!("{}/wrong/route/responses",gateway.address)).json(&body).send().await.unwrap();assert_eq!(bad.status(),404);assert!(seen.lock().await.is_empty());
        let response=client.post(format!("{base}/responses?api-version=fixture")).bearer_auth("synthetic").json(&body).send().await.unwrap();
        let parsed=super::super::wire::collect(response).await.unwrap();assert_eq!(parsed["status"],"completed");
        let compact=client.post(format!("{base}/responses/compact?api-version=compact")).bearer_auth("synthetic").json(&json!({"model":"plain","input":[]})).send().await.unwrap();
        assert_eq!(compact.json::<Value>().await.unwrap()["object"],"response.compaction");
        let mut truncated=body;truncated["model"]=json!("truncated");
        let failed=client.post(format!("{base}/responses")).bearer_auth("synthetic").json(&truncated).send().await.unwrap().text().await.unwrap();
        assert!(failed.contains("event: response.failed\n"));assert!(failed.contains("ended without response.completed"));assert!(!failed.contains("event: response.completed\n"));
        let seen=seen.lock().await;assert_eq!(seen.len(),3);assert_eq!(seen[0].0,"/v1/responses?api-version=fixture");assert_eq!(seen[1].0,"/v1/responses/compact?api-version=compact");assert!(seen.iter().all(|(_,auth,_)|auth=="Bearer synthetic"));
        assert_eq!(seen[0].2["tools"],json!([]));server.abort();
    }
    #[tokio::test]
    async fn independent_review_and_compaction_use_target_credentials_and_never_main_query_parameters(){
        struct Sink;impl EventSink for Sink{fn emit(&self,_:&str,_:Value){}}
        let seen=Arc::new(Mutex::new(Vec::<(String,HeaderMap,Value)>::new()));let captures=Arc::clone(&seen);
        let upstream=Router::new().fallback(post(move|OriginalUri(uri):OriginalUri,headers:HeaderMap,Json(body):Json<Value>|{
            let captures=Arc::clone(&captures);async move{
                captures.lock().await.push((uri.to_string(),headers,body));
                if uri.path().ends_with("/compact"){return Json(json!({"object":"response.compaction","output":[]})).into_response();}
                let event=json!({"type":"response.completed","response":{"id":"synthetic","status":"completed","output":[],"usage":{"input_tokens":10,"output_tokens":0,"total_tokens":10}}});
                ([("content-type","text/event-stream")],format!("event: response.completed\ndata: {event}\n\n")).into_response()
            }
        }));
        let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();let address=listener.local_addr().unwrap();let server=tokio::spawn(async move{axum::serve(listener,upstream).await.unwrap()});
        let directory=tempfile::tempdir().unwrap();let gateway=Gateway::start_with_policy_path(Arc::new(Sink),directory.path().join("policy.json")).await.unwrap();
        let base=gateway.register("main-chat","main",&format!("http://{address}/main"),vec!["authorization".into()]).await.unwrap();
        let mut target_headers=HeaderMap::new();target_headers.insert("authorization","Bearer reviewer".parse().unwrap());
        gateway.set_reviewer(Some(crate::reviewer::Target{provider:"review".into(),model:"cheap".into(),base_url:format!("http://{address}/review"),effort:"none".into(),headers:target_headers})).await;
        let client=reqwest::Client::new();let body=json!({"model":crate::reviewer::ALIAS,"stream":true,"input":[{"role":"user","content":"Preserve this explicit restriction."}],"reasoning":{"effort":"high"}});
        for suffix in ["/responses?main-only=1","/responses/compact?main-only=1"]{
            let response=client.post(format!("{base}{suffix}")).bearer_auth("main-secret").header("chatgpt-account-id","main-account").header("x-main-key","main-secret").json(&body).send().await.unwrap();assert!(response.status().is_success());let _=response.bytes().await.unwrap();
        }
        let captures=seen.lock().await;assert_eq!(captures.len(),2);
        for (uri,headers,sent) in captures.iter(){assert!(uri.starts_with("/review/responses"));assert!(!uri.contains('?'));assert_eq!(headers["authorization"],"Bearer reviewer");assert!(!headers.contains_key("chatgpt-account-id"));assert!(!headers.contains_key("x-main-key"));assert_eq!(sent["model"],"cheap");assert_eq!(sent["reasoning"]["effort"],"none");assert_eq!(sent["input"],body["input"]);}
        server.abort();
    }

}
