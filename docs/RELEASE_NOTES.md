Codex Lemma v0.1.9 adds automatic tool discovery for custom Responses models.

- Probe native tool search, then ordinary function search; if neither works, preload only the connected tools selected for this chat. Core Codex tools stay available.
- Open **+ → Tools** to inspect the detected mode, choose fallback tools, or check compatibility again. The first request can take longer while a small synthetic tool test runs; detection is cached per endpoint/model/reasoning/authentication for this app run.
- Keep the shared Codex home and installed plugins. Actual tools still execute through Codex with the chat's existing sandbox and approvals. Selections control fallback preloading, not permissions during automatic discovery.
- Avoid sending every connector schema up front for unknown models. Preserve model/provider switching, streamed output, cancellation, restored history and independent child chats.
- Account for internal discovery requests separately: cache totals include their usage while the context display retains the final request's occupancy. Synthetic compatibility probes are excluded from task statistics.

Local validation covers frontend regressions, full Rust workspace checks, actual bundled-version CLI discovery and MCP invocation in native/function/direct modes, runtime native-to-function downgrade, model/provider switching, stream errors, and authenticated HTTP forwarding. Local Qwen testing uses a different quantization from the reported server. That server is on another computer's LAN; exact IQ3_S/full-account acceptance remains for that computer after installation. A local Windows CLI sandbox limitation prevented workspace-write command execution even without Lemma; ordinary-command execution is verified under read-only/on-request and MCP execution under workspace-write/on-request.

Install over the existing Lemma installation. Verify SHA256SUMS.txt. The Windows x64 installer includes Codex CLI 0.163.0 and license notices, requires WebView2, and remains unsigned. No automatic updater is included.
