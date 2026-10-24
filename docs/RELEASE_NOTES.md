Codex Lemma v0.1.11 fixes Bonsai stream compatibility and restores fresh builds.

- Accept missing Responses output indices using stable item/call identities, while rejecting conflicting identities and incomplete streams. This fixes the Bonsai/llama.cpp regression introduced in v0.1.9.
- Add matching icons and consistent text alignment to Rename, Delete, and Copy ID in the session context menu.
- Include the exact MIT-licensed codex-finder source revision already pinned by the project. Fresh builds no longer depend on its now-unavailable upstream Git repository; original source and license are preserved.

The 0.1.10 candidate was installed and tested locally but withheld from public release after the upstream dependency became unavailable. This version includes its changes. Shared Codex configuration and the model scheduler are unchanged.

Validation covers frontend tests, full Rust workspace checks, captured Bonsai streams, interleaved tool calls and actual Bonsai search/discovery/MCP invocation through Codex CLI 0.163.0. The vendored helper is byte-identical to the previously locked revision.

Install over the existing Lemma installation. Verify SHA256SUMS.txt. The Windows x64 installer includes Codex CLI 0.163.0 and license notices, requires WebView2, and remains unsigned. No automatic updater is included.
