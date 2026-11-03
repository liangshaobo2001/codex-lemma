//! Opt-in LAN companion. Shares the desktop engine, with a smaller API surface.
use std::{net::{Ipv4Addr, SocketAddr}, sync::{Arc, Mutex}};
use axum::{Router, Json, extract::{State, ConnectInfo, Request}, http::{StatusCode, header}, middleware::{self, Next}, response::{Response, IntoResponse, Html}, routing::{get, post}};
use serde::{Serialize, Deserialize};
use serde_json::{Value, json};
use crate::{types::WebServerState, pairing::Pairing, handlers::*, websocket::sse_handler};

#[derive(Default)]
pub struct LanControl { inner: Mutex<Option<Running>> }
struct Running { handle: axum_server::Handle, pairing: Arc<Pairing>, address: String, certificate: String, ip: Ipv4Addr }
#[derive(Clone)]
struct Access { pairing: Arc<Pairing>, authority: String }
#[derive(Serialize)]
pub struct Status { enabled: bool, address: Option<String> }
#[derive(Deserialize)]
pub struct Start { address: Ipv4Addr }
#[derive(Deserialize)]
struct Pair { code: String }

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Preferences { version: u8, enabled: bool, address: Ipv4Addr }
fn storage_root() -> Result<std::path::PathBuf, (StatusCode,String)> {
    dirs::home_dir().map(|root|root.join(".codex-lemma/lan"))
        .ok_or((StatusCode::INTERNAL_SERVER_ERROR,"Home directory unavailable".into()))
}
fn save_preferences(root: &std::path::Path, enabled: bool, address: Ipv4Addr) -> Result<(), (StatusCode,String)> {
    crate::pairing::write_json(&root.join("listener.json"), &Preferences { version: 1, enabled, address })
        .map_err(|_|(StatusCode::INTERNAL_SERVER_ERROR,"Could not save LAN settings".into()))
}

fn saved_address(root: &std::path::Path) -> std::io::Result<Option<Ipv4Addr>> {
    let bytes = match crate::pairing::read_limited(&root.join("listener.json"),4096) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    let preferences: Preferences = serde_json::from_slice(&bytes).map_err(|_|std::io::Error::other("Invalid saved LAN settings"))?;
    if preferences.version != 1 || !preferences.address.is_private() { return Err(std::io::Error::other("Unsupported LAN settings")); }
    Ok(preferences.enabled.then_some(preferences.address))
}

/// Only an explicitly enabled listener is restored; never guess a new interface.
pub async fn restore(state: WebServerState) {
    let Ok(root) = storage_root() else { return; };
    let address = match saved_address(&root) {
        Ok(Some(address)) => address,
        Ok(None) => return,
        Err(_) => { log::error!("Could not restore saved LAN settings; listener remains disabled"); return; }
    };
    if start(State(state),Json(Start { address })).await.is_err() {
        log::error!("Could not restore LAN listener; enable it again in Settings");
    }
}

fn generate_certificate(address: &str) -> Result<(String,String,String),rcgen::Error> {
    let mut root=rcgen::CertificateParams::new(Vec::<String>::new())?;
    root.is_ca=rcgen::IsCa::Ca(rcgen::BasicConstraints::Unconstrained);
    root.distinguished_name.push(rcgen::DnType::CommonName,format!("Lemma LAN {address}"));
    root.key_usages=vec![rcgen::KeyUsagePurpose::KeyCertSign];
    let root_key=rcgen::KeyPair::generate()?;
    let root_cert=root.self_signed(&root_key)?;
    let mut leaf=rcgen::CertificateParams::new(vec![address.to_owned()])?;
    leaf.extended_key_usages=vec![rcgen::ExtendedKeyUsagePurpose::ServerAuth];
    leaf.key_usages=vec![rcgen::KeyUsagePurpose::DigitalSignature];
    let leaf_key=rcgen::KeyPair::generate()?;
    let leaf_cert=leaf.signed_by(&leaf_key,&root_cert,&root_key)?;
    // Discard the CA private key: the saved server key cannot issue certificates.
    Ok((format!("{}{}",leaf_cert.pem(),root_cert.pem()),leaf_key.serialize_pem(),root_cert.pem()))
}

fn local(peer: SocketAddr, request: &Request) -> bool {
    peer.ip().is_loopback() && request.headers().get(header::HOST).and_then(|h| h.to_str().ok())
        .is_some_and(|h| h == "127.0.0.1:7419" || h == "localhost:7419")
}
pub async fn local_only(ConnectInfo(peer): ConnectInfo<SocketAddr>, request: Request, next: Next) -> Response {
    if !local(peer, &request) { return StatusCode::FORBIDDEN.into_response(); }
    if let Some(origin)=request.headers().get(header::ORIGIN).and_then(|v|v.to_str().ok())
        && !matches!(origin,"http://tauri.localhost"|"tauri://localhost"|"http://localhost:1420"|"http://127.0.0.1:1420"|"http://127.0.0.1:7419"|"http://localhost:7419") {
        return StatusCode::FORBIDDEN.into_response();
    }
    next.run(request).await
}
pub async fn status(State(state): State<WebServerState>) -> Json<Status> {
    let guard = state.lan.inner.lock().unwrap();
    Json(Status { enabled: guard.is_some(), address: guard.as_ref().map(|r| r.address.clone()) })
}
pub async fn stop(State(state): State<WebServerState>) -> Result<StatusCode, (StatusCode,String)> {
    let root = storage_root()?;
    let mut guard = state.lan.inner.lock().unwrap();
    if let Some(running) = guard.as_ref() {
        running.pairing.revoke_all().map_err(|_|(StatusCode::INTERNAL_SERVER_ERROR,"Could not revoke paired devices".into()))?;
        save_preferences(&root,false,running.ip)?;
    }
    if let Some(running) = guard.take() {
        running.handle.shutdown();
    }
    Ok(StatusCode::NO_CONTENT)
}
pub async fn code(State(state): State<WebServerState>) -> Result<Json<Value>, StatusCode> {
    let guard = state.lan.inner.lock().unwrap();
    let running = guard.as_ref().ok_or(StatusCode::CONFLICT)?;
    Ok(Json(json!({"code":running.pairing.issue_code(),"expiresIn":120})))
}
pub async fn certificate(State(state): State<WebServerState>) -> Result<Response, StatusCode> {
    let guard = state.lan.inner.lock().unwrap();
    let running = guard.as_ref().ok_or(StatusCode::CONFLICT)?;
    Ok(([(header::CONTENT_TYPE,"application/x-x509-ca-cert"),(header::CONTENT_DISPOSITION,"attachment; filename=lemma-lan.crt")],running.certificate.clone()).into_response())
}
pub async fn start(State(state): State<WebServerState>, Json(params): Json<Start>) -> Result<Json<Status>, (StatusCode,String)> {
    let _ = rustls::crypto::ring::default_provider().install_default();
    if !params.address.is_private() { return Err((StatusCode::BAD_REQUEST,"Choose a private IPv4 address on this computer".into())); }
    if state.lan.inner.lock().unwrap().is_some() { return Err((StatusCode::CONFLICT,"LAN access is already enabled".into())); }
    let address = SocketAddr::from((params.address,7421));
    let listener = std::net::TcpListener::bind(address).map_err(|e|(StatusCode::BAD_REQUEST,e.to_string()))?;
    listener.set_nonblocking(true).map_err(|e|(StatusCode::INTERNAL_SERVER_ERROR,e.to_string()))?;
    let root = storage_root()?;
    std::fs::create_dir_all(&root).map_err(|e|(StatusCode::INTERNAL_SERVER_ERROR,e.to_string()))?;
    let cert_path = root.join(format!("{}.pem",params.address));
    let key_path = root.join(format!("{}.key",params.address));
    let root_path = root.join(format!("{}.root.pem",params.address));
    let (cert, key, root_cert) = match (std::fs::read_to_string(&cert_path),std::fs::read_to_string(&key_path),std::fs::read_to_string(&root_path)) {
        (Ok(cert),Ok(key),Ok(root_cert)) => (cert,key,root_cert),
        _ => {
            let (cert,key,root_cert)=generate_certificate(&params.address.to_string()).map_err(|e|(StatusCode::INTERNAL_SERVER_ERROR,e.to_string()))?;
            std::fs::write(&key_path,&key).and_then(|()| std::fs::write(&cert_path,&cert)).and_then(|()|std::fs::write(&root_path,&root_cert)).map_err(|e|(StatusCode::INTERNAL_SERVER_ERROR,e.to_string()))?;
            #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; std::fs::set_permissions(&key_path,std::fs::Permissions::from_mode(0o600)).map_err(|e|(StatusCode::INTERNAL_SERVER_ERROR,e.to_string()))?; }
            (cert,key,root_cert)
        }
    };
    let tls=axum_server::tls_rustls::RustlsConfig::from_pem(cert.clone().into_bytes(),key.into_bytes()).await.map_err(|e|(StatusCode::INTERNAL_SERVER_ERROR,e.to_string()))?;
    let pairing=Pairing::open(root.join("devices.json"))
        .map_err(|_|(StatusCode::INTERNAL_SERVER_ERROR,"Could not load paired devices".into()))?;
    let access=Access { pairing:Arc::new(pairing),authority:address.to_string() };
    let app=mobile_router(state.clone(),access.clone());
    let handle=axum_server::Handle::new();
    let url=format!("https://{address}");
    {
        let mut guard=state.lan.inner.lock().unwrap();
        if guard.is_some() { return Err((StatusCode::CONFLICT,"LAN access is already enabled".into())); }
        save_preferences(&root,true,params.address)?;
        *guard=Some(Running { handle:handle.clone(),pairing:access.pairing.clone(),address:url.clone(),certificate:root_cert,ip:params.address });
    }
    tokio::spawn(async move {
        if let Err(error)=axum_server::from_tcp_rustls(listener,tls).handle(handle).serve(app.into_make_service_with_connect_info::<SocketAddr>()).await {
            log::error!("LAN listener stopped: {error}");
            let mut guard=state.lan.inner.lock().unwrap();
            if guard.as_ref().is_some_and(|running|Arc::ptr_eq(&running.pairing,&access.pairing)) { guard.take(); }
        }
    });
    Ok(Json(Status{enabled:true,address:Some(url)}))
}

async fn pair(State(access): State<Access>, Json(params): Json<Pair>) -> Response {
    let device=match access.pairing.try_pair(&params.code) {
        Ok(Some(device))=>device,
        Ok(None)=>return (StatusCode::UNAUTHORIZED,"Pairing code invalid or expired").into_response(),
        Err(_)=>return (StatusCode::INTERNAL_SERVER_ERROR,"Could not save device pairing").into_response(),
    };
    ([(header::SET_COOKIE,format!("lemma_device={}.{}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=31536000" ,device.id,device.token))],Json(json!({"paired":true}))).into_response()
}
async fn boundary(State(access): State<Access>, ConnectInfo(peer): ConnectInfo<SocketAddr>, request: Request, next: Next) -> Response {
    let headers=request.headers();
    let valid_peer=matches!(peer.ip(),std::net::IpAddr::V4(ip) if ip.is_private());
    // HTTP/2 carries :authority in the request URI, normally without Host.
    // If both are present they must agree; neither may override a mismatch.
    let host=headers.get(header::HOST).and_then(|v|v.to_str().ok());
    let authority=request.uri().authority().map(|v|v.as_str());
    let expected_host=access.authority.as_str();
    let valid_host=(host.is_some() || authority.is_some())
        && (!headers.contains_key(header::HOST) || host.is_some())
        && host.is_none_or(|v|v==expected_host)
        && authority.is_none_or(|v|v==expected_host);
    let origin=headers.get(header::ORIGIN).and_then(|v|v.to_str().ok());
    let expected=format!("https://{}",access.authority);
    if !valid_peer || !valid_host || origin.is_some_and(|o|o!=expected) || (request.method()!=axum::http::Method::GET && origin!=Some(expected.as_str())) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let mut response=next.run(request).await;
    response.headers_mut().insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    response.headers_mut().insert(header::CONTENT_SECURITY_POLICY, "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'".parse().unwrap());
    response
}
async fn authenticated(State(access): State<Access>, request: Request, next: Next) -> Response {
    // HTTP/2 may split cookie crumbs across multiple Cookie fields. Reading
    // only get(COOKIE) loses our credential when another local app's cookie is first.
    let valid=request.headers().get_all(header::COOKIE).iter()
        .filter_map(|field|field.to_str().ok())
        .flat_map(|field|field.split(';'))
        .filter_map(|crumb|crumb.trim().strip_prefix("lemma_device="))
        .any(|token|token.split_once('.').and_then(|(id,token)|uuid::Uuid::parse_str(id).ok().map(|id|access.pairing.is_authorized(id,token))).unwrap_or(false));
    if !valid { return StatusCode::UNAUTHORIZED.into_response(); }
    next.run(request).await
}

fn mobile_router(state: WebServerState, access: Access) -> Router {
    let api=Router::new()
        .route("/api/pending",get(pending))
        .route("/api/events",get(sse_handler))
        .route("/api/codex/thread/list",post(api_list_threads))
        .route("/api/codex/thread/resume",post(api_resume_thread))
        .route("/api/codex/thread/history/page",post(api_history_page))
        .route("/api/codex/turn/start",post(api_turn_start))
        .route("/api/codex/turn/interrupt",post(api_turn_interrupt))
        .route("/api/codex/approval/command-execution",post(api_respond_command_execution_approval))
        .route("/api/codex/approval/file-change",post(api_respond_file_change_approval))
        .route("/api/codex/approval/user-input",post(api_respond_user_input))
        .route("/api/codex/approval/mcp-elicitation",post(api_respond_mcp_elicitation))
        .route("/api/codex/approval/permissions",post(api_respond_permissions_approval))
        .route_layer(middleware::from_fn_with_state(access.clone(),authenticated))
        .with_state(state);
    Router::new().route("/",get(||async {Html(include_str!("mobile.html"))}))
        .route("/pair",post(pair)).with_state(access.clone()).merge(api)
        .layer(middleware::from_fn_with_state(access,boundary))
        .layer(axum::extract::DefaultBodyLimit::max(64*1024))
}

async fn pending(State(state): State<WebServerState>) -> Json<Value> {
    match state.codex_state.as_ref() {
        Some(codex) => Json(json!(codex.codex.remote_approvals.lock().await.values().collect::<Vec<_>>())),
        None => Json(json!([])),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body,http::Request};
    use tower::ServiceExt;
    fn fixture() -> (Router, Access) {
        fixture_at("192.168.1.2:7421")
    }
    fn fixture_at(authority: &str) -> (Router, Access) {
        let access=Access{pairing:Arc::new(Pairing::default()),authority:authority.into()};
        let state=WebServerState::new(None,None,Default::default(),Default::default(),Default::default(),tokio::sync::broadcast::channel(32).0,crate::auth::DeviceToken::for_test(),7421);
        (mobile_router(state,access.clone()),access)
    }

    #[tokio::test]
    async fn paired_cookie_survives_listener_recreation_and_revocation_survives_restart() {
        let dir=tempfile::tempdir().unwrap();
        let path=dir.path().join("devices.json");
        let make=|| {
            let access=Access{pairing:Arc::new(Pairing::open(path.clone()).unwrap()),authority:"192.168.1.2:7421".into()};
            let state=WebServerState::new(None,None,Default::default(),Default::default(),Default::default(),tokio::sync::broadcast::channel(32).0,crate::auth::DeviceToken::for_test(),7421);
            (mobile_router(state,access.clone()),access)
        };
        let (app,access)=make();
        let code=access.pairing.issue_code();
        let response=app.oneshot(request("/pair",Some(json!({"code":code})),None,Some("https://192.168.1.2:7421"))).await.unwrap();
        assert_eq!(response.status(),StatusCode::OK);
        let header=response.headers().get(header::SET_COOKIE).unwrap().to_str().unwrap();
        assert!(header.contains("HttpOnly; Secure; SameSite=Strict"));
        assert!(header.contains("Max-Age=31536000"));
        let cookie=header.split(';').next().unwrap().to_owned();
        drop(access);
        let (app,access)=make();
        assert_eq!(app.clone().oneshot(request("/api/pending",None,Some(&cookie),None)).await.unwrap().status(),StatusCode::OK);
        access.pairing.revoke_all().unwrap();
        drop(app);drop(access);
        let (app,_)=make();
        assert_eq!(app.oneshot(request("/api/pending",None,Some(&cookie),None)).await.unwrap().status(),StatusCode::UNAUTHORIZED);
    }

    #[test]
    fn listener_preferences_record_opt_in_and_explicit_disable() {
        let dir=tempfile::tempdir().unwrap();let ip=Ipv4Addr::new(192,168,1,2);
        assert_eq!(saved_address(dir.path()).unwrap(),None);
        save_preferences(dir.path(),true,ip).unwrap();
        assert_eq!(saved_address(dir.path()).unwrap(),Some(ip));
        save_preferences(dir.path(),false,ip).unwrap();assert_eq!(saved_address(dir.path()).unwrap(),None);
        std::fs::write(dir.path().join("listener.json"),r#"{"version":1,"enabled":true,"address":"8.8.8.8"}"#).unwrap();
        assert!(saved_address(dir.path()).is_err());
        std::fs::write(dir.path().join("listener.json"),"not json").unwrap();
        assert!(saved_address(dir.path()).is_err());
    }
    fn request(path:&str,body:Option<Value>,cookie:Option<&str>,origin:Option<&str>) -> Request<Body> {
        let mut builder=Request::builder().uri(path).header("host","192.168.1.2:7421");
        if let Some(origin)=origin {builder=builder.header("origin",origin);}
        if let Some(cookie)=cookie {builder=builder.header("cookie",cookie);}
        let mut request=if let Some(body)=body {builder.method("POST").header("content-type","application/json").body(Body::from(body.to_string())).unwrap()}else{builder.body(Body::empty()).unwrap()};
        request.extensions_mut().insert(ConnectInfo("192.168.1.3:5000".parse::<SocketAddr>().unwrap()));request
    }
    #[tokio::test]
    async fn pairing_protects_api_and_revocation_is_immediate() {
        let (app,access)=fixture();
        assert_eq!(app.clone().oneshot(request("/api/pending",None,None,None)).await.unwrap().status(),StatusCode::UNAUTHORIZED);
        let code=access.pairing.issue_code();
        let response=app.clone().oneshot(request("/pair",Some(json!({"code":code})),None,Some("https://192.168.1.2:7421"))).await.unwrap();
        assert_eq!(response.status(),StatusCode::OK);
        let cookie=response.headers()[header::SET_COOKIE].to_str().unwrap().to_owned();
        assert!(cookie.contains("HttpOnly; Secure; SameSite=Strict"));
        assert_eq!(app.clone().oneshot(request("/api/pending",None,Some(&cookie),None)).await.unwrap().status(),StatusCode::OK);
        assert_eq!(app.clone().oneshot(request("/pair",Some(json!({"code":code})),None,Some("https://192.168.1.2:7421"))).await.unwrap().status(),StatusCode::UNAUTHORIZED);
        access.pairing.revoke_all().unwrap();
        assert_eq!(app.oneshot(request("/api/pending",None,Some(&cookie),None)).await.unwrap().status(),StatusCode::UNAUTHORIZED);
    }
    #[tokio::test]
    async fn cross_origin_rebinding_and_unexposed_apis_are_rejected() {
        let (app,access)=fixture();let device=access.pairing.pair(&access.pairing.issue_code()).unwrap();let cookie=format!("lemma_device={}.{}",device.id,device.token);
        assert_eq!(app.clone().oneshot(request("/pair",Some(json!({"code":"bad"})),None,Some("https://evil.example"))).await.unwrap().status(),StatusCode::FORBIDDEN);
        let mut rebound=request("/",None,None,None);rebound.headers_mut().insert(header::HOST,"evil.example".parse().unwrap());
        assert_eq!(app.clone().oneshot(rebound).await.unwrap().status(),StatusCode::FORBIDDEN);
        assert_eq!(app.clone().oneshot(request("/api/terminal/start",Some(json!({})),Some(&cookie),Some("https://192.168.1.2:7421"))).await.unwrap().status(),StatusCode::NOT_FOUND);
        assert_eq!(app.clone().oneshot(request("/api/lan/code",Some(json!({})),Some(&cookie),Some("https://192.168.1.2:7421"))).await.unwrap().status(),StatusCode::NOT_FOUND);
        assert_eq!(app.oneshot(request("/api/codex/turn/start",Some(json!({})),Some(&cookie),None)).await.unwrap().status(),StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn https_handshake_pair_cookie_and_disconnect_work_over_a_real_socket() {
        let _=rustls::crypto::ring::default_provider().install_default();
        let listener=std::net::TcpListener::bind("127.0.0.1:0").unwrap();listener.set_nonblocking(true).unwrap();let address=listener.local_addr().unwrap();
        let (app,access)=fixture_at(&address.to_string());
        // Only the peer metadata is simulated; TLS and the HTTP client are real.
        let app=app.layer(middleware::from_fn(|mut req:Request<Body>,next:Next|async move {
            req.extensions_mut().insert(ConnectInfo("192.168.1.3:5000".parse::<SocketAddr>().unwrap()));
            next.run(req).await
        }));
        let (chain,key,root)=generate_certificate("127.0.0.1").unwrap();
        let config=axum_server::tls_rustls::RustlsConfig::from_pem(chain.into_bytes(),key.into_bytes()).await.unwrap();
        let handle=axum_server::Handle::new();let server_handle=handle.clone();
        let task=tokio::spawn(async move { axum_server::from_tcp_rustls(listener,config).handle(server_handle).serve(app.into_make_service_with_connect_info::<SocketAddr>()).await.unwrap(); });
        for http2 in [false,true] {
        let builder=reqwest::Client::builder().no_proxy().add_root_certificate(reqwest::Certificate::from_pem(root.as_bytes()).unwrap()).timeout(std::time::Duration::from_secs(5));
        let client=if http2 {builder.http2_prior_knowledge()}else{builder.http1_only()}.build().unwrap();
        let code=access.pairing.issue_code();
        let response=client.post(format!("https://{address}/pair")).header("origin",format!("https://{address}")).json(&json!({"code":code})).send().await.unwrap();
        assert_eq!(response.status(),StatusCode::OK);
        assert_eq!(response.version(),if http2 {axum::http::Version::HTTP_2}else{axum::http::Version::HTTP_11});
        let cookie=response.headers()[header::SET_COOKIE].to_str().unwrap();
        let result=client.get(format!("https://{address}/api/pending")).header("cookie",cookie).send().await.unwrap();
        assert_eq!(result.status(),StatusCode::OK);
        let split=client.get(format!("https://{address}/api/pending"))
            .header(header::COOKIE,"other_local_app=synthetic")
            .header(header::COOKIE,cookie).send().await.unwrap();
        assert_eq!(split.status(),StatusCode::OK);
        }
        handle.shutdown();
        tokio::time::timeout(std::time::Duration::from_secs(5),task).await.unwrap().unwrap();
    }

    #[tokio::test]
    async fn http2_authority_is_accepted_but_conflicting_host_or_authority_is_rejected() {
        let (app,_)=fixture();
        let mut req=request("/",None,None,None);
        *req.version_mut()=axum::http::Version::HTTP_2;
        *req.uri_mut()="https://192.168.1.2:7421/".parse().unwrap();
        req.headers_mut().remove(header::HOST);
        assert_eq!(app.clone().oneshot(req).await.unwrap().status(),StatusCode::OK);
        let mut wrong_authority=request("/",None,None,None);
        *wrong_authority.uri_mut()="https://evil.example/".parse().unwrap();
        assert_eq!(app.clone().oneshot(wrong_authority).await.unwrap().status(),StatusCode::FORBIDDEN);
        let mut wrong_host=request("/",None,None,None);
        *wrong_host.uri_mut()="https://192.168.1.2:7421/".parse().unwrap();
        wrong_host.headers_mut().insert(header::HOST,"evil.example".parse().unwrap());
        assert_eq!(app.oneshot(wrong_host).await.unwrap().status(),StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn unrelated_or_stale_cookie_fields_do_not_hide_a_valid_device_credential() {
        let (app,access)=fixture();
        let device=access.pairing.pair(&access.pairing.issue_code()).unwrap();
        let cookie=format!("lemma_device={}.{}",device.id,device.token);
        for first in ["other_local_app=synthetic", "lemma_device=stale.invalid"] {
            let mut split=request("/api/pending",None,Some(first),None);
            split.headers_mut().append(header::COOKIE,cookie.parse().unwrap());
            assert_eq!(app.clone().oneshot(split).await.unwrap().status(),StatusCode::OK);
            let joined=format!("{first}; {cookie}");
            assert_eq!(app.clone().oneshot(request("/api/pending",None,Some(&joined),None)).await.unwrap().status(),StatusCode::OK);
        }
        let mut invalid=request("/api/pending",None,Some("other_local_app=synthetic"),None);
        invalid.headers_mut().append(header::COOKIE,"lemma_device=unknown.invalid".parse().unwrap());
        assert_eq!(app.oneshot(invalid).await.unwrap().status(),StatusCode::UNAUTHORIZED);
    }
}
