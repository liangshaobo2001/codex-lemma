# Privacy and local data

Codex Lemma has no project-maintainer telemetry service. The upstream telemetry and hosted sign-in flows were removed from this fork.

## Data on this computer

Codex keeps settings, authentication, session history, and logs in CODEX_HOME, defaulting to `%USERPROFILE%\.codex`. Lemma stores its own metadata under `%USERPROFILE%\.codex-lemma`; WebView stores UI preferences/cache under `%LOCALAPPDATA%\app.codexlemma`. Workspaces remain in their original folders. Uninstalling the program does not promise to erase this data.

Provider keys entered in model settings are plaintext in Codex config.toml. MCP credentials and connector data may also be stored locally. Do not commit or share these files, logs, or full session transcripts without review.

## Local timing metadata

The app starts an authenticated receiver on a random 127.0.0.1 port for the Codex child process's observation events. Prompt text logging is disabled. Only event kinds, timestamps, thread/turn association, and numeric timing/token summaries are used; the receiver does not save incoming batches or forward them externally. Its lifetime is tied to the child connection. This uses process-only CLI overrides and preserves configured custom log exporters. It is separate from the removed upstream hosted telemetry.

## Network requests

Inference requests and relevant conversation/workspace content go to the provider selected for the thread. A local endpoint keeps that inference hop local, subject to what the endpoint itself does. MCP servers, web search, connectors, plugin/skill catalogs, authentication flows, and optional model/runtime downloads can contact their configured services. The bundled Codex may also request OpenAI/plugin metadata even when inference uses a custom provider. This release does not provide a verified offline mode or a network firewall.

The desktop UI uses a loopback HTTP/WebSocket backend (normally port 7419). It is intended for local use. Do not expose it through port forwarding or public tunnels. Agent file and command access follows Codex settings and the permissions you grant; review actions appropriate to the workspace.

## Custom-provider tool adapter

For eligible custom Responses chats, a private random-port loopback adapter forwards inference requests to the configured provider. Provider credentials stay in memory in transit; the adapter does not store raw requests, prompts, tool schemas or keys. The synthetic compatibility test goes to that same provider and can incur its normal usage. It uses synthetic tools and does not execute user tools. Actual tools remain under the CLI's existing sandbox and approval policy.

Chat-specific fallback tool identities are saved in `tool-policies.json` under Lemma metadata. Extra internal-request input/cache counts are saved in `tool-policies.usage.json`; these are numeric totals, not conversation content. The adapter's thread-only transport overrides do not rewrite shared Codex configuration, login or account plugin state.
