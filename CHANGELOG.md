# Codex Lemma changelog

## Unreleased

## [0.1.7] - 2026-10-23

- Preserve inherited reasoning effort when resuming a Desktop/CLI session; an unset value is distinct from explicit `none`, and the composer shows Default.
- Includes the model-switching changes from the withheld 0.1.6 candidate.

## [0.1.6] - Unreleased candidate

- Confirm model/provider changes with the CLI before updating the picker; reconnect idle sessions when changing providers, preserving the same conversation and permission settings.
- Keep effective model and reasoning effort per session, including Desktop/CLI histories and older responses that report the model only at the top level. Refresh cached sessions on selection.
- Pause sends and queue starts during switches and after failures; preserve drafts and show an actionable error rather than silently using the old provider. Persist supported running-turn changes for later turns too.

## [0.1.5] - 2026-10-23

- Open large sessions with metadata-only resume and bounded history pages instead of hydrating the full transcript. Load older records on upward scrolling; keep at most three history pages in the view and reload evicted pages when returning.
- Bound large record previews by text and structure, with a separate paged full-record viewer. Preserve source records and model context.
- Preserve reading position, in-flight text, current selection, retry state, and stop controls across history loads. Remove duplicate history graphs from completion notifications.
- Verify both legacy and paginated Codex history, including a synthetic 153 MiB session with 399 turns.

## [0.1.4] - 2026-10-23

- Use neutral controls, interruption/error states, and notifications in both themes, with red limited to small trash icons; preserve diff and source-content colors.

- Hide the native long-thread compaction advisory in live and restored chats while preserving other warnings.

- Collapse long user messages to a 15-line preview with expand/collapse controls, preserving full copy/edit content.
- Keep the previous turn’s throughput visible while awaiting a new reading and remove the approximate symbol from the compact display; retain measurement details on hover.
- Default completion sound off, including upgrades, with an opt-in switch under Settings → Codex → Task.

- Use regular-weight text for workspace navigation, project/chat names, and composer/toolbar controls; retain the settings typography and message emphasis.

- Measure approximate decode speed from backend stream event times per request, including reasoning and tool arguments, excluding tool execution; show mean TTFT on hover. Missing measurements remain unavailable.
- Show session-wide token-weighted prompt-cache hits with one decimal, preserving unknown/invalid states and distinguishing partial hits from exact 100%.
- Add the Lemma logo and a synthetic-data workspace screenshot to both READMEs.

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
