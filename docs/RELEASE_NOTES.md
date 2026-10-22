Initial Windows x64 release of Codex Lemma, a focused open-source Codex GUI based on Codexia v0.58.0.

- Custom Responses-compatible model providers and composer model selection.
- Conversations, approvals, tools, files, Git diffs, terminal, MCP, skills, and scheduled work in one desktop workspace.
- English/Chinese UI, compact window chrome, neutral gray stop button, and corrected command ordering.
- Approximate turn-average output throughput replaces the misleading visible-text decode estimate.
- Per-user installer includes Codex CLI 0.163.0 and license notices; no separate Node/Codex install is needed.

Download the x64 setup executable and optionally verify it against SHA256SUMS.txt. The installer is unsigned. WebView2 is required. Bring your own model endpoint; model weights are not included.

Your endpoint must support Responses streaming and Codex-compatible tool calls. The default CLI home is the standard ~/.codex and may share configuration/login with other Codex clients; set CODEX_HOME before launch if a separate CLI home is desired. Provider keys entered in the GUI are stored in plaintext. Historical-turn loading is limited by app-server compatibility. No automatic updater is included.

The earlier packaging/runtime rehearsal covered installation, bundled CLI launch without a system Codex, a synthetic streamed response with a harmless command, and uninstallation. Frontend and Rust validation cover the final source. See the README for setup and current scope.
