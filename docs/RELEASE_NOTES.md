Codex Lemma v0.1.7 fixes model switching and session model display.

- Preserve inherited reasoning settings in Desktop/CLI sessions. An unset effort remains model-default rather than being converted to explicit none; the UI shows Default.
- Switch providers in an idle chat without creating another conversation. Verify the CLI's actual provider and model before updating the picker; preserve the workspace, permissions and stored history.
- Show each session's confirmed model and reasoning effort, including chats opened in Codex Desktop/CLI. Prefer effective response fields over stale or absent nested metadata, and refresh model state when returning to a cached chat.
- Pause sending and manual queue starts while a switch is pending or failed. Keep drafts and show a retry message instead of silently sending through the previous provider.
- Apply supported running-turn model changes to both the active turn and future defaults. Cross-provider changes wait for the current task to finish. The OpenAI model visibility option remains a picker filter.

Validation includes frontend regressions, Rust workspace clippy/tests, and real Codex CLI tests using isolated localhost endpoints in read-only and workspace-write modes. Tests verify actual request routing, the same session ID, permission preservation, active-task protection and subsequent-turn defaults. No private conversations are used.

Download the Windows x64 setup executable and verify SHA256SUMS.txt. The installer bundles Codex CLI 0.163.0 and license notices, is unsigned, and requires WebView2. Install over the existing Lemma installation to update. No automatic updater is included.
