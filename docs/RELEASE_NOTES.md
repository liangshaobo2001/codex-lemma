Codex Lemma v0.1.4 collects four updates since v0.1.0.

- Neutral black/gray controls, interrupted/error states, notifications, recording state, and window close hover. Small trash icons remain red; Git diffs, syntax highlighting, and terminal content retain their colors.
- Lighter workspace typography and expandable 15-line previews for long user messages. Copy/edit keep the full message.
- Approximate per-request decode throughput including reported reasoning output, excluding tool execution, with mean TTFT on hover. Unsupported or incomplete timing stays unavailable. The last valid same-session reading remains visible while a new one is pending.
- Session-wide token-weighted prompt-cache hits with one decimal.
- Completion sound defaults off, including upgrades, with an opt-in Settings → Codex → Task switch.
- Hide the native long-thread advisory while preserving other warnings and compaction behavior.
- README logo and a clean synthetic-data screenshot.

Download the Windows x64 setup executable and verify it against SHA256SUMS.txt. The installer bundles Codex CLI 0.163.0 and license notices; it is unsigned and requires WebView2. Install over an existing Lemma installation to update it.

Bring your own Responses-compatible model endpoint with Codex tool-call support. Model weights are not included. The default CLI home is ~/.codex; set CODEX_HOME before launch to select a separate home. Provider keys entered in the GUI are stored in plaintext. Historical-turn loading depends on app-server compatibility. No automatic updater is included.

Local validation covers frontend tests/typechecking, registry, Rust workspace clippy/tests, and Windows packaging. This update retains the runtime/installer layout exercised for v0.1.0; no model service, user login, or conversation configuration is migrated by these UI changes.
