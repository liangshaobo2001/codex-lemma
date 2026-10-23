# Custom-provider tool discovery: acceptance checklist

Use a disposable workspace and preserve the existing shared Codex home, login and installed plugins. Do not change approval/sandbox settings to make a failing task pass. Never publish raw requests, credentials or private sessions.

## Record the environment

- Lemma version/tag and source commit.
- Full path of the CLI actually launched by Lemma, plus its `--version` output. The installer pins 0.163.0; a PATH lookup alone is insufficient.
- Provider, exact served model ID, reasoning effort and context limit; sandbox/approval settings.
- Installed plugin/server identities before and after, and hashes of shared configuration files. Exclude credentials from the report.

## On the reported Strata machine

1. Install v0.1.9 over Lemma, keeping the shared home. Select the reported Qwen IQ3_S model and effort none, workspace-write/on-request.
2. Open a fresh chat. Send the same short no-tools prompt used for the previous baseline. Record **each request's** input/cached usage and the task's `last_token_usage`, separately from cumulative totals and synthetic compatibility probes. Inspect the actual upstream tools, including schema sizes and names. Full account/MCP schemas should no longer be automatically preloaded. Do not claim all schemas disappeared: core tools and previously discovered tools remain.
3. Open **+ → Tools**. Record native/compatible/selected-only mode. A successful greeting alone is insufficient.
4. Ask for a harmless command that prints a unique marker. Confirm a real CLI command item, exit code and output, not just the model's answer.
5. Ask it to discover a connected tool absent from the first request, call it and read its actual result. Confirm search → returned definition → execution/result. Normal approvals must still be presented. If discovery is unavailable, select a harmless fallback tool and verify it is actually exposed/called; a hidden tool cannot count as a successful task.
6. Repeat a request and inspect prefix-cache reuse. Added tool definitions can change the prefix; report per-request input/cached rather than inferring compute from cumulative input.
7. Cancel during discovery and generation; confirm it stops and a later turn works. Test multi-tool output and a provider error. A streamed task must not silently replay after failure.
8. Switch models and providers in an idle chat, resume an older Desktop/CLI chat, open a new chat and run a child task where supported. Check actual upstream model/provider as well as the picker. The selected tools and child history must not leak across chats.
9. Reopen the same history in the other Codex client. Confirm shared configuration, account plugin status, permissions and history remain intact. Fallback selections live in Lemma metadata and must not uninstall or disable account tools.

Compare v0.1.8 and v0.1.9 using the same CLI version, home, exact model, prompt and output limit. Keep no-tool, ordinary-command and discovery tasks separate. Include failures and timing limits. No fixed token reduction or throughput improvement is promised.

## Local validation scope

Local checks exercise native/function/direct discovery and runtime HTTP rejection through real CLI 0.163.0 with isolated synthetic Responses/MCP servers. They verify actual MCP marker output, on-request approval, context-versus-extra-usage accounting, provider/model switching, busy protection, cancellation, malformed streaming and authenticated forwarding/compaction. A 263-tool test checks declaration filtering, not tokenizer cost.

A local Qwen IQ3_XXS search/call test passed during development; a later repeat hit the synthetic capability-test timeout. This is not validation of the remote IQ3_S server or the user's full connector account. On this machine, workspace-write command execution is refused by the native Windows CLI's split-root sandbox even without Lemma. Ordinary command execution is checked under stricter read-only/on-request; MCP execution is checked under workspace-write/on-request. The remote acceptance should check its own workspace-write command path.
