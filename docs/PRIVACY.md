# Privacy and local data

Codex Lemma has no project-maintainer telemetry service. The upstream telemetry and hosted sign-in flows were removed from this fork.

## Data on this computer

Codex keeps settings, authentication, session history, and logs in CODEX_HOME, defaulting to `%USERPROFILE%\.codex`. Lemma stores its own metadata under `%USERPROFILE%\.codex-lemma`; WebView stores UI preferences/cache under `%LOCALAPPDATA%\app.codexlemma`. Workspaces remain in their original folders. Uninstalling the program does not promise to erase this data.

Provider keys entered in model settings are plaintext in Codex config.toml. MCP credentials and connector data may also be stored locally. Do not commit or share these files, logs, or full session transcripts without review.

## Network requests

Inference requests and relevant conversation/workspace content go to the provider selected for the thread. A local endpoint keeps that inference hop local, subject to what the endpoint itself does. MCP servers, web search, connectors, plugin/skill catalogs, authentication flows, and optional model/runtime downloads can contact their configured services. The bundled Codex may also request OpenAI/plugin metadata even when inference uses a custom provider. This release does not provide a verified offline mode or a network firewall.

The desktop UI uses a loopback HTTP/WebSocket backend (normally port 7419). It is intended for local use. Do not expose it through port forwarding or public tunnels. Agent file and command access follows Codex settings and the permissions you grant; review actions appropriate to the workspace.
