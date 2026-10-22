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

The composer’s ≈ tok/s is output tokens over the complete observed turn, including waiting, prompt processing, and tools. It is an end-to-end average, not the inference engine’s decode rate. Use your server’s metrics for engine speed. Missing timing/usage is shown as unavailable.
