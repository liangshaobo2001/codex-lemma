Codex Lemma v0.1.12 makes chat archive and delete respond immediately.

- Archive or delete from the sidebar and the chat disappears immediately, including pinned entries. Archiving the current chat opens an empty composer. If the operation fails, the entry returns without interrupting another chat or a new draft.
- Prevent stale sidebar requests from bringing removed entries back. Keyboard shortcuts, project-wide archive and server lifecycle notifications use the same state handling.
- Restore archived chats without refreshing the window. Archived Threads includes custom providers and handles concurrent restore failures independently.
- Model settings clearly show when context length inherits the model default. This display correction does not change existing context limits or force new overrides.

Validation includes component/API regression tests for pending operations, rollback, stale lists, navigation, notifications, shortcuts, concurrent restore and unchanged context inheritance, plus the full frontend suite and release checks.

Install over the existing Lemma installation. Verify SHA256SUMS.txt. The Windows x64 installer includes Codex CLI 0.163.0 and license notices, requires WebView2, and remains unsigned. No automatic updater is included. Shared Codex configuration, installed plugins and model services are unchanged.
