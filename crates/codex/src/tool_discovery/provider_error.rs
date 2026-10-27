//! Preserve useful provider diagnostics without exposing request bodies or credentials.
use super::probe::Endpoint;
use serde_json::Value;

fn detail(bytes: &[u8], endpoint: &Endpoint) -> Option<String> {
    let value:Value=serde_json::from_slice(bytes).ok()?;
    let message=value.pointer("/error/message").or_else(||value.get("message"))?.as_str()?;
    let mut safe=message.to_string();
    for (name,value) in &endpoint.headers {
        if (name.as_str().contains("authorization") || name.as_str().contains("key") || name.as_str().contains("token"))
            && let Ok(secret)=value.to_str() {
            for secret in [secret, secret.strip_prefix("Bearer ").unwrap_or(secret)] {
                if !secret.is_empty() {safe=safe.replace(secret,"[redacted]");}
            }
        }
    }
    // Avoid provider errors echoing a complete image or request/credential URL.
    let safe=safe.split_whitespace().map(|word| {
        if word.contains("data:") || word.contains("http://") || word.contains("https://") || word.contains("sk-") {"[redacted]"} else {word}
    }).collect::<Vec<_>>().join(" ");
    let safe:String=safe.chars().filter(|c|!c.is_control()).take(400).collect();
    if safe.is_empty(){None}else{Some(safe)}
}
pub(super) async fn rejection(mut response:reqwest::Response, endpoint:&Endpoint, initial:bool)->String {
    let status=response.status().as_u16();
    let prefix=if initial {format!("Provider rejected the initial request (HTTP {status}).")}
        else {format!("Provider returned HTTP {status} after discovery started.")};
    let read=async {
        let mut bytes=Vec::new();
        while let Ok(Some(chunk))=response.chunk().await {
            if bytes.len()+chunk.len()>8192 {return None;}
            bytes.extend_from_slice(&chunk);
        }
        detail(&bytes,endpoint)
    };
    match tokio::time::timeout(std::time::Duration::from_secs(2),read).await {
        Ok(Some(detail))=>format!("{prefix} {detail}"), _=>prefix,
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn returns_reason_but_redacts_credentials_images_and_urls() {
        let mut headers=reqwest::header::HeaderMap::new();headers.insert("authorization","Bearer PRIVATE_CREDENTIAL".parse().unwrap());
        let endpoint=Endpoint{url:"https://example.test/responses".into(),headers};
        let bytes=br#"{"error":{"message":"Expected output string. Bearer PRIVATE_CREDENTIAL data:image/png;base64,AA https://example.test/?key=secret"}}"#;
        let result=detail(bytes,&endpoint).unwrap();
        assert!(result.contains("Expected output string"));assert!(!result.contains("PRIVATE"));assert!(!result.contains("base64"));assert!(!result.contains("?key"));
        assert!(detail(b"<html>proxy failure</html>",&endpoint).is_none());
    }
    #[test]
    fn bounds_long_unicode_errors() {
        let endpoint=Endpoint{url:String::new(),headers:Default::default()};
        let bytes=serde_json::to_vec(&serde_json::json!({"message":"图".repeat(500)})).unwrap();
        assert_eq!(detail(&bytes,&endpoint).unwrap().chars().count(),400);
    }
}
