Codex Lemma v0.1.5 fixes large-session loading.

- Open the latest messages first and load older records as you scroll upward. The history view retains at most three pages; scrolling downward can reload newer pages, and Jump to latest returns to recent activity.
- Each page contains up to 40 records. Very large records use bounded previews; View full record loads the complete stored record in 64 KiB text pages. Original history and model context are preserved.
- Keep the reading position, streamed text, selected chat, loading/retry state, and stop controls stable while history loads. Completion notifications no longer duplicate entire turn histories.

Validation includes a synthetic 153 MiB legacy session (399 turns), modern paginated sessions, frontend regression tests, Rust workspace clippy/tests, and browser paging checks. Legacy Codex engines may still parse history internally; this update bounds what crosses into the chat window.

Download the Windows x64 setup executable and verify SHA256SUMS.txt. The installer bundles Codex CLI 0.163.0 and license notices, is unsigned, and requires WebView2. Install over the existing Lemma installation to update. No automatic updater is included.
