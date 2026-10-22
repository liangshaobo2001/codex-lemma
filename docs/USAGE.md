# Using Codex Lemma

Install the Windows x64 package from the project's Releases page, open a project folder, and configure a model in Settings → Models. Select it from the composer before sending a message. Model settings remain available without logging out of a subscription account.

## CLI configuration home

By default, Lemma uses Codex's standard home, `%USERPROFILE%\.codex`. It can therefore see and change settings shared with another Codex client. For a separate CLI home, launch from PowerShell:

```powershell
$env:CODEX_HOME = Join-Path $env:LOCALAPPDATA 'CodexLemma/codex-home'
& 'D:/Programs/Codex Lemma/codex-lemma.exe'
```

Adjust the executable path to your installation. The variable applies to this process and its children. Configure the model in the new home on first use. Lemma's UI metadata is still under `%USERPROFILE%\.codex-lemma`; CODEX_HOME separates CLI state, not all UI state.

## Troubleshooting

- A model metadata fallback warning means Codex does not recognize the model's capabilities. Set the actual context window in model settings and test tool calls; do not assume the warning proves a failed connection.
- For a greeting that works but commands that fail or stall, check Responses streaming/function-call support and the model's tool format.
- Back up configuration before changing providers or resetting data. Do not delete the entire Codex home as a routine fix.
- Historical-turn loading may be unavailable with some app-server versions; live events and resume behavior are separate paths.
- Report problems with the Lemma version, bundled CLI version, endpoint software/version, reproduction steps, and redacted logs. Never post keys or private conversations.
