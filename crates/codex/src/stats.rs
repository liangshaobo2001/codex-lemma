//! Usage statistics for the chats in this app's CODEX_HOME.
//!
//! Thread metadata comes from Codex's state database, turn timings from its thread-history database, and
//! per-request token counts from the `token_count` events in each thread's rollout file. Only those event
//! lines are parsed; message content is never read.

use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use serde_json::Value;

use crate::utils::codex_home;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageStats {
    pub threads: Vec<ThreadStat>,
    pub requests: Vec<RequestStat>,
    pub turns: Vec<TurnStat>,
    pub projects: Vec<ProjectStat>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadStat {
    pub id: String,
    pub created_at_ms: i64,
    pub model_provider: String,
    pub model: Option<String>,
    pub project_id: Option<String>,
    pub cwd: String,
    pub archived: bool,
    /// Spawned by Codex itself (e.g. the guardian reviewer), not started by the user.
    pub subagent: bool,
}

/// One model request; token counts are what that request added.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestStat {
    pub thread_id: String,
    pub ts_ms: i64,
    pub input: u64,
    pub cached: u64,
    pub output: u64,
    pub reasoning: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnStat {
    pub thread_id: String,
    pub started_at_ms: i64,
    pub duration_ms: Option<i64>,
    pub status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectStat {
    pub id: String,
    pub name: String,
}

/// The newest `<prefix>_<version>.sqlite` in `dir` (Codex bumps the version on schema changes).
fn latest_db(dir: &Path, prefix: &str) -> Option<PathBuf> {
    let mut best: Option<(u32, PathBuf)> = None;
    for entry in std::fs::read_dir(dir).ok()?.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let Some(version) = name
            .strip_prefix(&format!("{prefix}_"))
            .and_then(|rest| rest.strip_suffix(".sqlite"))
            .and_then(|v| v.parse::<u32>().ok())
        else {
            continue;
        };
        if best.as_ref().is_none_or(|(v, _)| version > *v) {
            best = Some((version, entry.path()));
        }
    }
    best.map(|(_, path)| path)
}

fn open_read_only(path: &Path) -> rusqlite::Result<Connection> {
    Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
}

#[derive(Default, Clone, Copy)]
struct Usage {
    input: u64,
    cached: u64,
    output: u64,
    reasoning: u64,
    total: u64,
}

fn usage_of(value: &Value) -> Option<Usage> {
    let n = |key: &str| value.get(key).and_then(Value::as_u64).unwrap_or(0);
    value.is_object().then(|| Usage {
        input: n("input_tokens"),
        cached: n("cached_input_tokens"),
        output: n("output_tokens"),
        reasoning: n("reasoning_output_tokens"),
        total: n("total_tokens"),
    })
}

/// Per-request usage from a rollout's `token_count` events. Codex can report the same request twice, so
/// a request counts once, as the growth of the thread's running total; when the total restarts (a new
/// session file), the event's own `last_token_usage` is used.
fn rollout_requests(thread_id: &str, path: &Path, out: &mut Vec<RequestStat>) {
    let Ok(file) = File::open(path) else { return };
    let mut prev: Option<Usage> = None;
    for line in BufReader::new(file).lines().map_while(Result::ok) {
        if !line.contains("\"token_count\"") {
            continue;
        }
        let Ok(event) = serde_json::from_str::<Value>(&line) else { continue };
        let payload = &event["payload"];
        if payload["type"] != "token_count" {
            continue;
        }
        let info = &payload["info"];
        let (Some(total), last) = (usage_of(&info["total_token_usage"]), usage_of(&info["last_token_usage"]))
        else {
            continue;
        };
        let delta = match prev {
            Some(p) if total.total == p.total => None,
            Some(p) if total.total > p.total => Some(Usage {
                input: total.input.saturating_sub(p.input),
                cached: total.cached.saturating_sub(p.cached),
                output: total.output.saturating_sub(p.output),
                reasoning: total.reasoning.saturating_sub(p.reasoning),
                total: total.total - p.total,
            }),
            _ => last.or(Some(total)),
        };
        prev = Some(total);
        let Some(d) = delta else { continue };
        let ts_ms = event["timestamp"]
            .as_str()
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            .map(|t| t.timestamp_millis())
            .unwrap_or(0);
        out.push(RequestStat {
            thread_id: thread_id.to_string(),
            ts_ms,
            input: d.input,
            cached: d.cached,
            output: d.output,
            reasoning: d.reasoning,
        });
    }
}

fn collect_blocking() -> Result<UsageStats, String> {
    let home = codex_home();
    let state_path = latest_db(&home, "state").ok_or("Codex state database not found")?;
    let state = open_read_only(&state_path).map_err(|e| e.to_string())?;

    let mut threads = Vec::new();
    let mut rollouts = Vec::new();
    {
        let mut stmt = state
            .prepare(
                "SELECT id, rollout_path, created_at_ms, created_at, model_provider, model, project_id, cwd, archived, thread_source
                 FROM threads",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                let created_ms: Option<i64> = row.get(2)?;
                let created_s: i64 = row.get(3)?;
                Ok((
                    ThreadStat {
                        id: row.get(0)?,
                        created_at_ms: created_ms.unwrap_or(created_s * 1000),
                        model_provider: row.get(4)?,
                        model: row.get(5)?,
                        project_id: row.get(6)?,
                        cwd: row.get(7)?,
                        archived: row.get::<_, i64>(8)? != 0,
                        subagent: row.get::<_, Option<String>>(9)?.is_some(),
                    },
                    row.get::<_, String>(1)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        for row in rows.flatten() {
            rollouts.push((row.0.id.clone(), row.1));
            threads.push(row.0);
        }
    }

    let mut projects = Vec::new();
    if let Ok(mut stmt) = state.prepare("SELECT id, name FROM projects")
        && let Ok(rows) = stmt.query_map([], |row| Ok(ProjectStat { id: row.get(0)?, name: row.get(1)? }))
    {
        projects.extend(rows.flatten());
    }

    let mut requests = Vec::new();
    for (thread_id, rollout) in &rollouts {
        let path = PathBuf::from(rollout);
        let path = if path.is_absolute() { path } else { home.join(path) };
        rollout_requests(thread_id, &path, &mut requests);
    }

    let mut turns = Vec::new();
    let known: HashMap<&str, ()> = threads.iter().map(|t| (t.id.as_str(), ())).collect();
    if let Some(history) = latest_db(&home, "thread_history").and_then(|p| open_read_only(&p).ok())
        && let Ok(mut stmt) =
            history.prepare("SELECT thread_id, started_at, duration_ms, status FROM thread_turns")
        && let Ok(rows) = stmt.query_map([], |row| {
            Ok(TurnStat {
                thread_id: row.get(0)?,
                started_at_ms: row.get::<_, Option<i64>>(1)?.unwrap_or(0) * 1000,
                duration_ms: row.get(2)?,
                status: row.get(3)?,
            })
        })
    {
        turns.extend(rows.flatten().filter(|t| known.contains_key(t.thread_id.as_str())));
    }

    Ok(UsageStats { threads, requests, turns, projects })
}

/// Collects the usage statistics; the file reads run off the async runtime.
pub async fn collect_usage_stats() -> Result<UsageStats, String> {
    tokio::task::spawn_blocking(collect_blocking)
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(ts: &str, total: (u64, u64, u64), last: (u64, u64, u64)) -> String {
        let usage = |(i, c, o): (u64, u64, u64)| {
            serde_json::json!({"input_tokens": i, "cached_input_tokens": c, "output_tokens": o,
                "reasoning_output_tokens": 0, "total_tokens": i + o})
        };
        serde_json::json!({"timestamp": ts, "type": "event_msg", "payload": {"type": "token_count",
            "info": {"total_token_usage": usage(total), "last_token_usage": usage(last)}}})
        .to_string()
    }

    #[test]
    fn requests_count_once_and_survive_a_total_reset() {
        let dir = std::env::temp_dir().join(format!("lemma-stats-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("rollout.jsonl");
        let lines = [
            event("2026-10-22T10:00:00Z", (100, 0, 10), (100, 0, 10)),
            // The same request reported twice.
            event("2026-10-22T10:00:01Z", (100, 0, 10), (100, 0, 10)),
            r#"{"timestamp":"2026-10-22T10:00:02Z","type":"event_msg","payload":{"type":"token_count","info":null}}"#.to_string(),
            event("2026-10-22T10:01:00Z", (250, 80, 30), (150, 80, 20)),
            // A new session file: the running total restarts.
            event("2026-10-22T11:00:00Z", (40, 0, 5), (40, 0, 5)),
        ];
        std::fs::write(&path, lines.join("\n")).unwrap();
        let mut out = Vec::new();
        rollout_requests("t", &path, &mut out);
        std::fs::remove_dir_all(&dir).ok();

        let got: Vec<(u64, u64, u64)> = out.iter().map(|r| (r.input, r.cached, r.output)).collect();
        assert_eq!(got, vec![(100, 0, 10), (150, 80, 20), (40, 0, 5)]);
        assert_eq!(out[1].ts_ms, 1792663260000);
    }
}
