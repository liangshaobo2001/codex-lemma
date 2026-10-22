//! MCP server configuration for Codex. Moved here from the removed Claude Code crate, which used to
//! dispatch between Codex and Claude Code; only the Codex half remains, and other clients are refused.

use codexia_codex as codex;
use codexia_codex::config::mcp::McpServerConfig;
use serde_json::Value as JsonValue;

fn require_codex(client_name: &str) -> Result<(), String> {
    if client_name == "codex" {
        Ok(())
    } else {
        Err(format!("Unknown client: {client_name}"))
    }
}

pub async fn unified_add_mcp_server(
    client_name: String,
    _path: Option<String>,
    server_name: String,
    server_config: JsonValue,
    _scope: Option<String>,
) -> Result<(), String> {
    require_codex(&client_name)?;
    let config: McpServerConfig = serde_json::from_value(server_config)
        .map_err(|e| format!("Failed to parse Codex MCP config: {e}"))?;
    codex::add_mcp_server(server_name, config).await
}

pub async fn unified_enable_mcp_server(
    client_name: String,
    _path: Option<String>,
    server_name: String,
) -> Result<(), String> {
    require_codex(&client_name)?;
    codex::set_mcp_server_enabled(server_name, true).await
}

pub async fn unified_disable_mcp_server(
    client_name: String,
    _path: Option<String>,
    server_name: String,
) -> Result<(), String> {
    require_codex(&client_name)?;
    codex::set_mcp_server_enabled(server_name, false).await
}

pub async fn unified_remove_mcp_server(
    client_name: String,
    _path: Option<String>,
    server_name: String,
    _scope: Option<String>,
) -> Result<(), String> {
    require_codex(&client_name)?;
    codex::delete_mcp_server(server_name).await
}

pub async fn unified_read_mcp_config(
    client_name: String,
    _path: Option<String>,
) -> Result<JsonValue, String> {
    require_codex(&client_name)?;
    let servers = codex::read_mcp_servers().await?;
    Ok(serde_json::json!({ "mcpServers": servers }))
}
