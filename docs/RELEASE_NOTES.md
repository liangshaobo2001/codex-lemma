Codex Lemma v0.1.10 fixes a Bonsai streaming compatibility regression introduced in v0.1.9.

- Repair missing `output_index` fields using stable output item/call IDs. Bonsai/llama.cpp streams can now finish normally through the tool-discovery adapter.
- Keep distinct tool calls separate, preserve provider-supplied indices, and continue rejecting ambiguous or conflicting identities and incomplete streams.
- Add icons to Rename, Delete, and Copy ID in the session context menu, with consistent text alignment.

Validation includes captured Bonsai response streams, fragmented events, interleaved tool calls, invalid/conflicting indices, and an actual Bonsai search/discovery/MCP invocation through Codex CLI 0.163.0 under workspace-write/on-request. Frontend and Rust workspace checks are run before publication. No model scheduler or shared Codex configuration is changed.

Install over the existing Lemma installation. Verify SHA256SUMS.txt. The Windows x64 installer includes Codex CLI 0.163.0 and license notices, requires WebView2, and remains unsigned. No automatic updater is included.
