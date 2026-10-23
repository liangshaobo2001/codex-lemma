# Custom model providers

Open Settings → Models → Add provider. Choose Custom, enter a unique provider ID, Base URL, optional API key, and at least one model ID. The display name may differ from the exact server model ID. Add the server's real context limit, save, and select the model in the composer.

The backend writes custom providers to the current Codex home's config.toml using `wire_api = "responses"` and `requires_openai_auth = false`. GUI keys are stored as `experimental_bearer_token` in plaintext. Existing env_key-based configurations are also supported by the backend; keep their environment variables available when launching the app.

Example only (not installed automatically):

```toml
model = "your-local-model-id"
model_provider = "local"

[model_providers.local]
name = "local"
base_url = "http://127.0.0.1:8000/v1"
wire_api = "responses"
requires_openai_auth = false

[windows]
sandbox = "unelevated"
```

An OpenAI-compatible Chat Completions API is insufficient. The endpoint needs Responses SSE events, tool/function calls, and tool-result continuation compatible with the bundled Codex. Optional capabilities such as vision and reasoning vary by model/server. Provider presets are configuration suggestions, not a compatibility certification.

Test a short reply, then a harmless command in a disposable folder. If text works but tools do not, inspect the server's Responses implementation and tool schema. A saved configuration or a model metadata fallback warning alone does not establish full agent compatibility.

## Tool discovery for custom Responses providers

Lemma does not assume an unknown model supports native tool search. On the first request that exposes connected tools, it runs a small synthetic search → call → result test. It tries native search first, then an ordinary function-search adapter. If neither succeeds, it directly loads the connected tools selected in **+ → Tools** for this chat. Core Codex tools stay available. HTTP 200 or a greeting alone does not pass detection.

The initial probe can add latency and provider usage. Results are cached for six hours within the app run, scoped to endpoint, model, reasoning and authentication. **Check again** invalidates the chat's used capability entries. Authentication, rate-limit and connection failures remain actionable errors rather than being remembered as unsupported capabilities. An incompatible initial task HTTP response can safely downgrade before streaming starts; an already streamed task is never automatically replayed.

The tool list becomes more complete after the CLI's first real request, which supplies canonical connector identities. Fallback selections affect this chat only; they do not uninstall plugins or alter the shared home. Automatic discovery can find other connected tools: this selector is not a permissions boundary. Codex performs execution and approval. Change selections while the chat is idle. Missing selected tools produce a visible error instead of silently pretending they are available.

The adapter supports ordinary custom Responses endpoints. Official OpenAI and signed AWS/Gateway OAuth transports retain CLI-managed discovery. A custom provider still needs correct Responses streaming and ordinary function-call/result support. Some providers will not support discovery, and the adapter does not certify task quality or guarantee a particular token count.

## Usage display

The composer’s tok/s is an approximate decode measurement from each observed request's stream timing, excluding tools and prompt processing where timing permits. It includes reasoning only when its stream is observed. Missing measurements keep the prior reading or remain unavailable; use server metrics for engine speed. Session cache statistics are token-weighted, including extra internal discovery requests. Context occupancy uses the final request, so discovery usage is not added twice. Synthetic probe usage is excluded from task statistics.

For reproducible checks on another machine, see the [tool discovery acceptance checklist](TOOL_DISCOVERY_VALIDATION.md).
