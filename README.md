<p align="center"><img src="branding/lemma-icon.svg" width="96" height="96" alt="Codex Lemma logo"></p>

# Codex Lemma

[简体中文](README.zh-CN.md) · [Download](https://github.com/liangshaobo2001/codex-lemma/releases) · [Build from source](CONTRIBUTING.md)

Codex Lemma is an open-source Windows desktop workspace for Codex CLI. It puts conversations, model selection, files, Git changes, and a terminal in one GUI, with custom endpoints for locally hosted models.

**Local-first and open source.** The desktop app runs on your computer, and its source is available to inspect and build. There is no Lemma-maintainer telemetry service or automatic update checker. You choose the model endpoint and integrations; their network activity is described in [privacy](docs/PRIVACY.md).

It is a focused fork of [Codexia v0.58.0](https://github.com/milisp/codexia/tree/v0.58.0), built with React and Tauri. Lemma is an independent community project, unaffiliated with OpenAI.

![Codex Lemma workspace](docs/images/workspace-demo.jpg)

*Development UI with a synthetic project, conversation, and statistics. No private session data is shown.*

## What is included

- Codex conversations with streamed output, command approvals, tool activity, and subagent views. Large histories open with recent messages first and load older records on demand.
- Custom provider and model settings, plus a model selector in the composer. Automatic tool discovery for custom Responses models, with chat-specific fallback tools under **+ → Tools**.
- Project workspaces, file editing and previews, Git diffs, and an integrated terminal.
- MCP connectors, skills, scheduled tasks, todos, and local usage statistics.
- English and Simplified Chinese UI, light/dark themes, and a compact frameless Windows window.

This fork removes the upstream Bots, Claude Code, ACP, remote/mobile UI, publishing, telemetry, and automatic updater flows. Internal Rust crate names may still use Codexia for source compatibility.

## Install

1. Download the Windows x64 setup executable from [Releases](https://github.com/liangshaobo2001/codex-lemma/releases/latest).
2. Run the per-user installer and choose a folder. WebView2 is required; the installer can bootstrap it when missing.
3. Open Codex Lemma and select a project folder.
4. Open **Settings → Models**, add a custom provider, enter the endpoint and model ID, then select the model in the composer.

The Windows installer includes Codex CLI **0.163.0** and its required helpers. You do not need to install Node.js or Codex separately. A model server is separate; Lemma does not include model weights or an inference engine.

## Use a local model

Your endpoint must implement the **OpenAI Responses API**, including streaming and function/tool calls used by Codex. A Chat Completions endpoint alone is insufficient.

For example, if your server exposes Responses at `http://127.0.0.1:8000/v1/responses`, enter `http://127.0.0.1:8000/v1` as the base URL, a provider ID such as `local`, and the exact model ID served by your backend. Supply a key only if the server requires one. Set a context window that your server actually supports.

Saving a provider records configuration; it does not verify the server. Test a short conversation and a harmless command in a disposable workspace. Model quality, tool support, and API compatibility determine how well agent tasks work. See [provider setup and troubleshooting](docs/PROVIDERS.md).

New installs default to **Ask for approval**: workspace operations use the sandbox, and requests to cross its boundary go to you. The separate **Approve for me** option uses Codex’s AI reviewer. The fork-specific no-approval Auto mode has been removed; existing selections of it migrate to Ask for approval.

## Configuration and privacy

- By default, Codex uses `%USERPROFILE%\.codex`. Existing Codex configuration, login, and sessions can therefore be shared. Changes in Lemma's model settings can affect other Codex clients using that home.
- For a separate CLI home, set `CODEX_HOME` **before launching** Lemma. See [usage](docs/USAGE.md).
- Lemma's own metadata is in `%USERPROFILE%\.codex-lemma`; WebView data is under `%LOCALAPPDATA%\app.codexlemma`.
- Provider keys entered in the GUI are stored in the Codex configuration as plaintext. Keep config files private.
- Requests go to your selected provider and any integrations you enable. Choosing a local provider does not guarantee zero internet traffic from Codex, plugin catalogs, connectors, or optional downloads. See [privacy](docs/PRIVACY.md).

## Current scope

Version 0.1.0 is the initial Windows x64 release. macOS/Linux packages, automatic updates, and remote access are outside this release's tested scope. The app is unsigned. Some Codex features depend on the bundled CLI and provider; a successful greeting does not establish full tool compatibility. Historical-turn loading can be limited by the CLI's app-server API.

## Development and attribution

See [CONTRIBUTING.md](CONTRIBUTING.md) for build and validation instructions, [CHANGELOG.md](CHANGELOG.md) for Lemma changes, and [release instructions](docs/RELEASING.md) for packaging.

The application is MIT licensed; original Codexia copyright is preserved in [LICENSE](LICENSE). The bundled Codex CLI is Apache-2.0 and carries its own LICENSE and NOTICE. See [third-party notices](THIRD_PARTY_NOTICES.md).
