Codex Lemma v0.1.17 fixes provider switching when an idle chat is unloaded immediately.

- Switching between OpenAI and custom providers now waits for the CLI to finish closing the previous connection before restoring the same conversation. Tool-discovery connections follow the same shutdown handling.
- Keep your existing unload policy, shared Codex home, installed plugins, permissions and conversation history. A closing race can retry restoring the chat; it never automatically resends your message. Subscription conflicts and timeouts stop with a clear error.
- Fix standard Windows taskbar grouping by matching the running program's identity to the installed shortcuts.

Validation used Codex CLI 0.163.0 with temporary homes and local synthetic Responses services, including immediate and delayed unloading, concurrent model choices and history preservation. No real model or GPU inference was run for this release.

The Windows x64 installer includes Codex CLI 0.163.0, license notices, checksums, and a version-bound updater signature. The executable is not Authenticode-signed. Check for updates manually in Settings → General, or download the installer below.
