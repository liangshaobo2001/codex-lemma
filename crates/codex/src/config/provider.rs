//! Reads and writes the `model_providers` entries of the user's `config.toml`.
//! Nothing is written unless the user explicitly adds or removes a provider.

use crate::app_server::CodexAppServer;
use serde::{Deserialize, Serialize};
use serde_json::json;

/// Maximum number of retry attempts when the app-server is not yet initialized.
const MAX_INIT_RETRIES: u32 = 10;

/// Delay between retry attempts in milliseconds.
const RETRY_DELAY_MS: u64 = 200;

/// Shared retry loop used by [`write_model_providers`].
///
/// Sends `config/value/write` with upsert merge strategy. Retries on
/// "Not initialized" errors up to [`MAX_INIT_RETRIES`] times.
async fn upsert_config_value(
    client: &CodexAppServer,
    key_path: &str,
    value: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let mut attempts = 0;
    let write_params = json!({
        "keyPath": key_path,
        "value": value,
        "mergeStrategy": "upsert"
    });

    loop {
        match client
            .send_request("config/value/write", write_params.clone())
            .await
        {
            Ok(res) => {
                return Ok(res);
            }
            Err(e) => {
                let err_str = format!("{:?}", e);
                if err_str.contains("Not initialized") && attempts < MAX_INIT_RETRIES {
                    attempts += 1;
                    tokio::time::sleep(tokio::time::Duration::from_millis(RETRY_DELAY_MS)).await;
                    continue;
                }
                return Err(format!("Failed to write config at {}: {}", key_path, err_str));
            }
        }
    }
}

/// Provider IDs that are reserved built-ins in the Codex app-server and
/// cannot be overridden via `config/value/write`.
const BUILTIN_PROVIDER_IDS: &[&str] = &["ollama", "lmstudio"];

/// Writes a single provider to the Codex app-server under
/// `model_providers.<name>`, which persists it in the user's `config.toml`.
///
/// Only called when the user explicitly adds a provider — nothing is written
/// at startup, so an untouched `config.toml` stays untouched.
///
/// Built-in provider IDs (e.g. `ollama`) are skipped since the app-server
/// rejects attempts to override them.
///
/// `api_key` is stored as the provider's `experimental_bearer_token` (sent as
/// `Authorization: Bearer`, effective at once, no restart); `None` keeps the key
/// already stored. `wire_api` is always `responses`, the only one Codex speaks.
pub async fn write_model_provider(
    client: &CodexAppServer,
    name: &str,
    base_url: &str,
    env_key: &str,
    api_key: Option<&str>,
) -> Result<(), String> {
    if BUILTIN_PROVIDER_IDS.contains(&name) {
        log::debug!("Skipping built-in provider: {}", name);
        return Ok(());
    }

    let mut provider_value = json!({
        "name": name,
        "base_url": base_url,
        "wire_api": "responses",
    });
    if !env_key.trim().is_empty() {
        provider_value["env_key"] = json!(env_key.trim());
    }
    let token = match api_key.map(str::trim) {
        Some(key) if !key.is_empty() => Some(key.to_string()),
        Some(_) => None,
        None => stored_bearer_token(client, name).await?,
    };
    if let Some(token) = token {
        provider_value["experimental_bearer_token"] = json!(token);
    }

    upsert_config_value(client, &format!("model_providers.{}", name), provider_value).await?;
    log::debug!("Config written for provider: {}", name);
    Ok(())
}

/// A `model_providers` entry as it exists in the user's config. The API key itself never
/// leaves the backend; the UI only learns whether one is stored.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ConfigProvider {
    pub name: String,
    pub base_url: Option<String>,
    pub env_key: Option<String>,
    #[serde(default)]
    pub has_api_key: bool,
}

/// The effective config's `model_providers` tables, later layers overriding earlier ones.
async fn provider_tables(
    client: &CodexAppServer,
) -> Result<Vec<(String, serde_json::Value)>, String> {
    let response = client
        .send_request("config/read", json!({ "includeLayers": true }))
        .await
        .map_err(|e| format!("Failed to read config: {:?}", e))?;
    let layers = response
        .get("layers")
        .and_then(|l| l.as_array())
        .cloned()
        .unwrap_or_default();
    let mut tables: Vec<(String, serde_json::Value)> = Vec::new();
    for layer in layers {
        let Some(table) = layer
            .get("config")
            .and_then(|c| c.get("model_providers"))
            .and_then(|p| p.as_object())
        else {
            continue;
        };
        for (name, value) in table {
            match tables.iter_mut().find(|(n, _)| n == name) {
                Some(existing) => existing.1 = value.clone(),
                None => tables.push((name.clone(), value.clone())),
            }
        }
    }
    Ok(tables)
}

async fn stored_bearer_token(client: &CodexAppServer, name: &str) -> Result<Option<String>, String> {
    Ok(provider_tables(client)
        .await?
        .into_iter()
        .find(|(n, _)| n == name)
        .and_then(|(_, v)| v.get("experimental_bearer_token").and_then(|t| t.as_str()).map(str::to_string))
        .filter(|t| !t.is_empty()))
}

/// Lists the providers actually present in the effective Codex config.
///
/// `config/read` only types the *active* `model_provider`, so the full
/// `model_providers` table is picked out of the untyped config layers.
pub async fn read_model_providers(
    client: &CodexAppServer,
) -> Result<Vec<ConfigProvider>, String> {
    let mut providers: Vec<ConfigProvider> = provider_tables(client)
        .await?
        .into_iter()
        .map(|(name, value)| ConfigProvider {
            name,
            base_url: value.get("base_url").and_then(|v| v.as_str()).map(str::to_string),
            env_key: value.get("env_key").and_then(|v| v.as_str()).map(str::to_string),
            has_api_key: value
                .get("experimental_bearer_token")
                .and_then(|v| v.as_str())
                .is_some_and(|t| !t.is_empty()),
        })
        .collect();

    // `ollama` and `lmstudio` are built-ins of the app-server: never written
    // to config.toml and need no API key, but must always be selectable.
    if !providers.iter().any(|p| p.name == "ollama") {
        providers.push(ConfigProvider {
            name: "ollama".to_string(),
            base_url: Some("http://localhost:11434/v1".to_string()),
            env_key: None,
            has_api_key: false,
        });
    }
    if !providers.iter().any(|p| p.name == "lmstudio") {
        providers.push(ConfigProvider {
            name: "lmstudio".to_string(),
            base_url: Some("http://localhost:1234/v1".to_string()),
            env_key: None,
            has_api_key: false,
        });
    }

    providers.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(providers)
}

/// Drops `model_providers.<name>` from the user's `config.toml`.
///
/// Done by editing the file directly: the app-server config write API has no
/// delete operation.
pub fn remove_model_provider(name: &str) -> Result<(), String> {
    use std::str::FromStr;
    use toml_edit::Document;

    let path = super::get_config_path()?;
    if !path.exists() {
        return Ok(());
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read config file: {}", e))?;
    let mut doc =
        Document::from_str(&content).map_err(|e| format!("Failed to parse config file: {}", e))?;

    let Some(providers) = doc
        .get_mut("model_providers")
        .and_then(|item| item.as_table_like_mut())
    else {
        return Ok(());
    };
    providers.remove(name);

    let is_empty = providers.is_empty();
    if is_empty {
        doc.as_table_mut().remove("model_providers");
    }

    super::toml_helpers::write_document_with_backup(&path, &doc)
}
