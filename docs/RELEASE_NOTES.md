Codex Lemma v0.1.14 fixes new chats disappearing from the sidebar until the window is refreshed.

- Newly started chats remain visible while their history is being indexed, so switching away and returning does not require Ctrl+R.
- Switching projects, delayed list responses, and failed list refreshes preserve open chats. Creation notifications and responses produce one sidebar entry and preserve the selected model.
- Existing archive/delete behavior, Codex home, conversations, logins, plugins, and model settings are preserved. This release was validated with frontend regression tests and synthetic interfaces; no real-model or GPU tests were run for this fix.

The Windows x64 installer includes Codex CLI 0.163.0, license notices, checksums, and a version-bound updater signature. The executable is not Authenticode-signed. Check for updates manually in Settings → General, or download the installer below.
