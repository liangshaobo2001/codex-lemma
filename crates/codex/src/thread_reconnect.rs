//! A detach acknowledgement is not a thread shutdown acknowledgement.
use serde_json::Value;
use std::{future::Future, time::Duration};
use tokio::{sync::broadcast, time::{Instant, timeout_at}};

pub(crate) const RECONNECT_TIMEOUT: Duration = Duration::from_secs(45);

pub(crate) struct ClosingThread {
    thread: String,
    events: broadcast::Receiver<String>,
    deadline: Instant,
    closed: bool,
}

impl ClosingThread {
    pub(crate) fn new(thread: &str, events: broadcast::Receiver<String>) -> Self {
        Self { thread: thread.into(), events, deadline: Instant::now() + RECONNECT_TIMEOUT, closed: false }
    }

    pub(crate) fn deadline(&self) -> Instant { self.deadline }

    pub(crate) async fn accepted(&mut self, status: &Value, immediate: bool) -> Result<(), String> {
        match status.as_str() {
            Some("notLoaded") => { self.closed = true; Ok(()) },
            Some("unsubscribed") if immediate => self.wait().await,
            // With a nonzero idle timer, the CLI rebuilds an unsubscribed idle
            // thread synchronously when resume includes configuration overrides.
            Some("unsubscribed") => Ok(()),
            Some("notSubscribed") => Err("This connection no longer owns the chat subscription. Reopen the chat before switching models.".into()),
            _ => Err("The CLI returned an unknown unsubscribe status. Model switching was stopped.".into()),
        }
    }

    async fn wait(&mut self) -> Result<(), String> {
        if self.closed { return Ok(()); }
        timeout_at(self.deadline, async {
            loop {
                let thread = self.events.recv().await.map_err(|_| "Lost the chat's shutdown notification. Reopen the chat before switching models.".to_string())?;
                if thread == self.thread { self.closed = true; return Ok(()); }
            }
        }).await.map_err(|_| "Timed out waiting for the chat to close. Another client may still be subscribed; close it there and retry the model selection.".to_string())?
    }

    pub(crate) async fn resume<F, Fut>(&mut self, mut request: F) -> Result<Value, String>
    where F: FnMut() -> Fut, Fut: Future<Output = Result<Value, String>> {
        let result = timeout_at(self.deadline, request()).await.map_err(|_| "Timed out restoring the chat. No message was resent.".to_string())?;
        match result {
            Err(error) if closing_error(&error, &self.thread) => {
                self.wait().await?;
                // Retry only the resume RPC, never a user turn. A second closing
                // response is surfaced rather than spinning or guessing a delay.
                timeout_at(self.deadline, request()).await.map_err(|_| "Timed out restoring the closed chat. No message was resent.".to_string())?
            },
            other => other,
        }
    }
}

fn closing_error(error: &str, thread: &str) -> bool {
    error.strip_prefix("Request failed: ").and_then(|error| serde_json::from_str::<Value>(error).ok())
        .is_some_and(|error| error["code"] == -32600 && error["message"].as_str().is_some_and(|message|
            message == format!("thread {thread} is closing; retry thread/resume after the thread is closed")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::{Arc, atomic::{AtomicUsize, Ordering}};

    #[tokio::test]
    async fn close_before_ack_is_retained_and_other_threads_are_ignored() {
        let (events, _) = broadcast::channel(8);
        let mut wait = ClosingThread::new("target", events.subscribe());
        events.send("other".into()).unwrap();
        events.send("target".into()).unwrap();
        wait.accepted(&json!("unsubscribed"), true).await.unwrap();
        assert!(wait.closed);
    }

    #[tokio::test]
    async fn close_after_ack_and_cancel_do_not_resume_a_turn() {
        let (events, _) = broadcast::channel(8);
        let mut wait = ClosingThread::new("target", events.subscribe());
        assert!(tokio::time::timeout(Duration::from_millis(5), wait.accepted(&json!("unsubscribed"), true)).await.is_err());
        events.send("target".into()).unwrap();
        wait.accepted(&json!("unsubscribed"), true).await.unwrap();
    }

    #[tokio::test]
    async fn statuses_and_missing_shutdown_fail_closed() {
        let (events, _) = broadcast::channel(8);
        let mut wait = ClosingThread::new("target", events.subscribe());
        assert!(wait.accepted(&json!("notSubscribed"), false).await.is_err());
        assert!(wait.accepted(&json!("futureStatus"), false).await.is_err());
        wait.deadline = Instant::now();
        assert!(wait.accepted(&json!("unsubscribed"), true).await.unwrap_err().contains("Timed out"));
        wait.accepted(&json!("notLoaded"), true).await.unwrap();
    }

    #[tokio::test]
    async fn nonzero_delay_retries_only_matching_closing_after_notification() {
        let (events, _) = broadcast::channel(8);
        let mut wait = ClosingThread::new("target", events.subscribe());
        wait.accepted(&json!("unsubscribed"), false).await.unwrap();
        let calls = Arc::new(AtomicUsize::new(0));
        let result = wait.resume(|| {
            let n = calls.fetch_add(1, Ordering::SeqCst);
            let events = events.clone();
            async move {
                if n == 0 {
                    events.send("target".into()).unwrap();
                    Err(format!("Request failed: {}", json!({"code":-32600,"message":"thread target is closing; retry thread/resume after the thread is closed"})))
                } else { Ok(json!({"model":"target"})) }
            }
        }).await.unwrap();
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        assert_eq!(result["model"], "target");
    }

    #[tokio::test]
    async fn unrelated_failure_is_never_retried() {
        let (events, _) = broadcast::channel(8);
        let mut wait = ClosingThread::new("target", events.subscribe());
        let mut calls = 0;
        assert!(wait.resume(|| { calls += 1; async { Err("already has an active writer".into()) } }).await.is_err());
        assert_eq!(calls, 1);
    }

    #[tokio::test]
    async fn closing_without_notification_does_not_retry_or_take_ownership() {
        let (events, _) = broadcast::channel(8);
        let mut wait = ClosingThread::new("target", events.subscribe());
        wait.deadline = Instant::now() + Duration::from_millis(5);
        let mut calls = 0;
        let error = wait.resume(|| {
            calls += 1;
            async { Err(format!("Request failed: {}", json!({"code":-32600,"message":"thread target is closing; retry thread/resume after the thread is closed"}))) }
        }).await.unwrap_err();
        assert!(error.contains("Timed out waiting"));
        assert_eq!(calls, 1);
    }

    #[tokio::test]
    async fn repeated_closing_is_bounded_and_other_thread_errors_are_not_retried() {
        let (events, _) = broadcast::channel(8);
        let mut wait = ClosingThread::new("target", events.subscribe());
        events.send("target".into()).unwrap();
        let mut calls = 0;
        assert!(wait.resume(|| {
            calls += 1;
            async { Err(format!("Request failed: {}", json!({"code":-32600,"message":"thread target is closing; retry thread/resume after the thread is closed"}))) }
        }).await.is_err());
        assert_eq!(calls, 2);
        assert!(!closing_error(&format!("Request failed: {}", json!({"code":-32600,"message":"thread other is closing; retry thread/resume after the thread is closed"})), "target"));
    }
}
