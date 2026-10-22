# Codex Lemma changelog

## [0.1.0] - 2026-10-22

Initial Windows x64 release, based on Codexia v0.58.0.

- Removed the fork-specific Auto mode. Fresh installs default to Ask for approval; legacy Auto mode migrates to it while preserving other supported choices.
- Focused Codex workspace with custom Responses-compatible model providers, local model catalog, and composer model selection.
- Project files, editor, terminal, Git diffs, MCP connectors, skills, automation, and local usage statistics.
- Lemma branding, compact window controls, English/Chinese UI, and a neutral gray stop button.
- Replace misleading visible-text decode timing with explicitly approximate turn-average output throughput.
- Stable placement for completed tool steps, preserving the launch order of parallel commands.
- Per-user NSIS installer bundles Codex CLI 0.163.0, helper binaries, and license notices.
- Removed upstream Bots, Claude Code, ACP, remote/mobile UI, publishing, telemetry, and automatic updater flows.

Windows installation, bundled-CLI startup, synthetic Responses streaming/tool execution, and uninstallation were rehearsed locally. This is an unsigned initial release; API compatibility depends on the model server. Historical-turn loading can be limited by the bundled CLI.

Upstream history is retained in [docs/upstream/CHANGELOG.md](docs/upstream/CHANGELOG.md) and [changelogs/](changelogs/).
