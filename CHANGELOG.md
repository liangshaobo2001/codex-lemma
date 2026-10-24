# Codex Lemma changelog

## Unreleased

## [0.1.13] - 2026-10-24

- Add manual update checks in General settings, with separate download and installation actions, signed-version/package verification, and active/queued-task installation protection. Opening the app or settings does not check for updates.
- Allow an independent approval-review provider, model, context budget and effort for custom Responses providers. Keep saved and process-loaded settings distinct; apply after restart without changing shared Codex configuration, logins or plugins.
- Route approval and compaction requests with the reviewer endpoint, credentials and session identity, never main-provider credentials. Reject unsupported main providers or missing reviewer metadata instead of silently using the main model.
- Cover allow/deny, budget exhaustion, provider failures, long input, ephemeral chats and transport isolation using synthetic endpoints and the bundled CLI. Real-model and GPU-memory acceptance remains deferred at the user's request.

## [0.1.12] - 2026-10-24

- Archive and delete chats immediately across sidebar groups and pins, with safe rollback on failure. Keep stale list responses from restoring removed chats and preserve newer user navigation.
- Apply shared server lifecycle notifications and keyboard/project archive actions consistently; refresh restored chats without reloading the window. Include custom-provider chats in Archived Threads.
- Replace the misleading fixed context-window placeholder with an explicit model-default label. Saving inherited values keeps them unset.

## [0.1.11] - 2026-10-24

- Vendor the exact MIT-licensed codex-finder revision already pinned by the project, so fresh and release builds no longer depend on its unavailable Git repository. Preserve original source, license and provenance.
- Includes the Bonsai stream compatibility fix and aligned session menu icons from the withheld 0.1.10 candidate.

## [0.1.10] - Unreleased candidate

- Accept Responses streams that omit output indices while retaining stable item or call IDs, including Bonsai/llama.cpp. Preserve explicit indices and reject conflicting identities instead of merging outputs.
- Add matching icons to Rename, Delete, and Copy ID in the session menu, with one aligned text column.

## [0.1.9] - 2026-10-23

- Detect native tool-search compatibility for custom Responses providers with a synthetic discovery/call/result probe; use ordinary function discovery when needed, then fall back to this chat's selected tools. Core CLI tools remain available.
- Add Tools to the composer Plus menu, with chat-specific fallback selection, compatibility status and retry. Keep installed plugins, shared Codex configuration, sandbox and approvals unchanged.
- Defer connected tool schemas instead of preloading the entire registry for unknown models. Preserve canonical call identities, streaming, cancellation, restored history and independent child conversations.
- Keep hidden discovery usage separate from context occupancy; include its input/cache totals in session statistics and measure actual provider request streams without double counting.

## [0.1.8] - 2026-10-23

- Keep a late cached-session refresh from selecting the wrong chat; derive running-turn state from the latest events after refresh.
- Keep model readiness separate from history-page loading, including evicted pages and retryable history errors.
- Includes the model/provider switching and inherited reasoning fixes from withheld 0.1.6/0.1.7 candidates.

## [0.1.7] - Unreleased candidate

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
- Keep the previous turnâ€™s throughput visible while awaiting a new reading and remove the approximate symbol from the compact display; retain measurement details on hover.
- Default completion sound off, including upgrades, with an opt-in switch under Settings â†’ Codex â†’ Task.

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
