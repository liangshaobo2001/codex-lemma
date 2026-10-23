# Using Codex Lemma

Install the Windows x64 package from the project's Releases page, open a project folder, and configure a model in Settings → Models. Select it from the composer before sending a message. Model settings remain available without logging out of a subscription account.

## CLI configuration home

By default, Lemma uses Codex's standard home, `%USERPROFILE%\.codex`. It can therefore see and change settings shared with another Codex client. For a separate CLI home, launch from PowerShell:

```powershell
$env:CODEX_HOME = Join-Path $env:LOCALAPPDATA 'CodexLemma/codex-home'
& 'D:/Programs/Codex Lemma/codex-lemma.exe'
```

Adjust the executable path to your installation. The variable applies to this process and its children. Configure the model in the new home on first use. Lemma's UI metadata is still under `%USERPROFILE%\.codex-lemma`; CODEX_HOME separates CLI state, not all UI state.

## Messages and completion sound

Long user messages start as a preview of about 15 rendered lines, with Expand/Collapse controls. Window resizing and wrapped text are included in the height measurement. Copy and Edit continue to use the complete original text, and attached images remain visible.

Completion sound is off by default. Enable it under **Settings → Codex → Task → Task completion sound**. Upgrading from the previous enabled default turns it off once; subsequent choices are retained.

The workspace navigation, project/chat names, composer controls and top toolbar use regular-weight text. Settings typography and intentional emphasis inside messages retain their own hierarchy.

## Composer statistics

Cache hit is the session's cumulative cached-input tokens divided by cumulative input tokens, weighted by token count across all requests. It is not the last request's hit rate or an average of request percentages. One decimal is shown; a partial hit that would round to 100.0% displays >99.9%. Hover for exact cumulative counts. Missing or invalid counts display a dash.

The development build's approximate decode speed sums reported output tokens across measured requests in the last user turn and divides by their summed first-generation-event-to-completion time. Output already includes reasoning tokens; those are not added twice. Tool argument generation counts; tool execution and time before generation do not. The compact label omits the approximate symbol. While a new turn has no valid measurement, it keeps the last valid reading from the same session; the hover text identifies this as a previous reading. Hover for mean time to first token (TTFT) and the number of measured requests. This is client-observed streaming timing, not the inference engine's internal decode timer. Buffered streams, empty delta events, retries, and networking can affect it. Requests without valid timing or usage, including reported reasoning with no observed reasoning stream, are omitted, and no turn-average fallback is presented as decode speed.

Timing uses the bundled Codex CLI's HTTP Responses observation events, received by a temporary authenticated loopback collector. Configuration applies only to Lemma's CLI child and is not written to config.toml. A custom log exporter in the CLI home or its profiles is preserved by leaving timing unavailable. Existing historical turns and unsupported transports have no inferred timing. Cache totals come from Codex's session usage events; they appear when the CLI reports them.

## Troubleshooting

- A model metadata fallback warning means Codex does not recognize the model's capabilities. Set the actual context window in model settings and test tool calls; do not assume the warning proves a failed connection.
- For a greeting that works but commands that fail or stall, check Responses streaming/function-call support and the model's tool format.
- Back up configuration before changing providers or resetting data. Do not delete the entire Codex home as a routine fix.
- Historical-turn loading may be unavailable with some app-server versions; live events and resume behavior are separate paths.
- Report problems with the Lemma version, bundled CLI version, endpoint software/version, reproduction steps, and redacted logs. Never post keys or private conversations.

## Large histories

Lemma opens recent records first. Scroll to the top or choose **Load older messages** to retrieve another page. The view keeps three pages; **Load newer messages** and **Jump to latest** return toward current activity. The displayed window does not limit the model context or remove stored messages.

A page holds up to 40 records. A very large record is shown as a bounded preview; **View full record** opens its exact stored JSON in 64 KiB text pages. This keeps large tool results out of the main render tree. Legacy Codex histories still require engine-side parsing of a turn, so older machines can show a loading indicator while that finishes.
