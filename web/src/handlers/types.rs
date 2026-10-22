use codexia_codex::protocol::RequestId;
use serde::Deserialize;
use serde_json::Value;

use codexia_automation::{AutomationSchedule, AutomationTrigger, CwdMode};

#[derive(Deserialize)]
pub(crate) struct ApprovalDecisionParams {
    pub(crate) request_id: RequestId,
    pub(crate) decision: Value,
}

#[derive(Deserialize)]
pub(crate) struct UserInputResponseParams {
    pub(crate) request_id: RequestId,
    pub(crate) response: Value,
}

#[derive(Deserialize)]
pub(crate) struct McpElicitationResponseParams {
    pub(crate) request_id: RequestId,
    pub(crate) action: String,
    #[serde(default)]
    pub(crate) content: Option<Value>,
    #[serde(default)]
    pub(crate) meta: Option<Value>,
}

#[derive(Deserialize)]
pub(crate) struct PermissionsApprovalParams {
    pub(crate) request_id: RequestId,
    pub(crate) permissions: Value,
    pub(crate) scope: String,
    #[serde(default)]
    pub(crate) strict_auto_review: bool,
}

#[derive(Deserialize)]
pub(crate) struct SkillsMarketplaceParams {
    pub(crate) selected_agent: String,
    pub(crate) scope: String,
    pub(crate) cwd: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct SkillsInstallParams {
    pub(crate) skill_md_path: String,
    pub(crate) skill_name: String,
    pub(crate) selected_agent: String,
    pub(crate) scope: String,
    pub(crate) cwd: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct SkillsUninstallParams {
    pub(crate) skill_name: String,
    pub(crate) selected_agent: String,
    pub(crate) scope: String,
    pub(crate) cwd: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct SkillsCloneRepoParams {
    pub(crate) url: String,
}

#[derive(Deserialize)]
pub(crate) struct SkillGroupsScopeParams {
    pub(crate) scope: String,
    pub(crate) cwd: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct SkillsLinkToAgentParams {
    pub(crate) skill_name: String,
    pub(crate) agent: String,
    pub(crate) scope: String,
    pub(crate) cwd: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct SkillsDeleteCentralParams {
    pub(crate) skill_name: String,
    pub(crate) scope: String,
    pub(crate) cwd: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct SkillsshLeaderboardParams {
    pub(crate) board: String,
}

#[derive(Deserialize)]
pub(crate) struct SkillsshSearchParams {
    pub(crate) query: String,
    pub(crate) limit: u32,
}

#[derive(Deserialize)]
pub(crate) struct SkillsshInstallParams {
    pub(crate) source: String,
    pub(crate) skill_id: String,
    pub(crate) scope: String,
    pub(crate) cwd: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct SkillGroupsWriteParams {
    pub(crate) config: codexia_shared::skills::SkillGroupsConfig,
}

#[derive(Deserialize)]
pub(crate) struct UnifiedMcpAddParams {
    #[serde(rename = "client_name", alias = "clientName")]
    pub(crate) client_name: String,
    pub(crate) path: Option<String>,
    #[serde(rename = "server_name", alias = "serverName")]
    pub(crate) server_name: String,
    #[serde(rename = "server_config", alias = "serverConfig")]
    pub(crate) server_config: Value,
    pub(crate) scope: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct UnifiedMcpRemoveParams {
    #[serde(rename = "client_name", alias = "clientName")]
    pub(crate) client_name: String,
    pub(crate) path: Option<String>,
    #[serde(rename = "server_name", alias = "serverName")]
    pub(crate) server_name: String,
    pub(crate) scope: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct UnifiedMcpToggleParams {
    #[serde(rename = "client_name", alias = "clientName")]
    pub(crate) client_name: String,
    pub(crate) path: Option<String>,
    #[serde(rename = "server_name", alias = "serverName")]
    pub(crate) server_name: String,
}

#[derive(Deserialize)]
pub(crate) struct UnifiedMcpReadParams {
    #[serde(rename = "client_name", alias = "clientName")]
    pub(crate) client_name: String,
    pub(crate) path: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct SleepParams {
    #[serde(default, rename = "conversation_id", alias = "conversationId")]
    pub(crate) conversation_id: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct CreateAutomationParams {
  pub(crate) name: String,
  #[serde(default)]
  pub(crate) projects: Vec<String>,
  pub(crate) prompt: String,
  pub(crate) schedule: AutomationSchedule,
  #[serde(default)]
  pub(crate) agent: Option<String>,
  #[serde(default)]
  #[serde(rename = "model_provider", alias = "modelProvider")]
  pub(crate) model_provider: Option<String>,
  #[serde(default)]
  pub(crate) model: Option<String>,
  #[serde(default)]
  #[serde(rename = "cwd_mode", alias = "cwdMode")]
  pub(crate) cwd_mode: Option<CwdMode>,
  #[serde(default, rename = "bot_id", alias = "botId")]
  pub(crate) bot_id: Option<String>,
  #[serde(default)]
  pub(crate) trigger: Option<AutomationTrigger>,
}

#[derive(Deserialize)]
pub(crate) struct ListAutomationRunsParams {
    #[serde(default, rename = "task_id", alias = "taskId")]
    pub(crate) task_id: Option<String>,
    #[serde(default)]
    pub(crate) limit: Option<u32>,
}

#[derive(Deserialize)]
pub(crate) struct UpdateAutomationParams {
    pub(crate) id: String,
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) projects: Vec<String>,
    pub(crate) prompt: String,
    pub(crate) schedule: AutomationSchedule,
    #[serde(default)]
    pub(crate) agent: Option<String>,
    #[serde(default)]
    #[serde(rename = "model_provider", alias = "modelProvider")]
    pub(crate) model_provider: Option<String>,
    #[serde(default)]
    pub(crate) model: Option<String>,
    #[serde(default)]
    #[serde(rename = "cwd_mode", alias = "cwdMode")]
    pub(crate) cwd_mode: Option<CwdMode>,
    #[serde(default, rename = "bot_id", alias = "botId")]
    pub(crate) bot_id: Option<String>,
    #[serde(default)]
    pub(crate) trigger: Option<AutomationTrigger>,
}

#[derive(Deserialize)]
pub(crate) struct SetAutomationPausedParams {
    pub(crate) id: String,
    pub(crate) paused: bool,
}

#[derive(Deserialize)]
pub(crate) struct DeleteAutomationParams {
    pub(crate) id: String,
}

#[derive(Deserialize)]
pub(crate) struct RunAutomationNowParams {
    pub(crate) id: String,
}

