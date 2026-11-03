# LAN companion (self-use preview)

The desktop must stay running. Settings → General → Phone · LAN access controls a
separate HTTPS listener on an explicitly selected private IPv4 interface, port
7421. Once enabled, it restores the same interface after app restart. If that
address is unavailable, it stays offline until enabled again in Settings.
The phone and desktop share the same
in-process Codex backend and CODEX_HOME; this does not start a second engine.

A paired device can read and control conversations and approvals in this
desktop backend. Pair only devices you trust.

## First connection

1. Enter this computer's LAN IPv4 address and enable the listener.
2. Download the certificate from the desktop settings. Transfer that file to
   the phone through a trusted local channel. Do not install a certificate
   obtained from an unknown sender.
3. On iOS, install the profile, then enable its trust under Settings → General
   → About → Certificate Trust Settings. On Android, install it from Security
   → Encryption & credentials (the exact menu depends on the device).
4. Scan the address QR code. Generate a two-minute pairing code on the desktop
   and enter its eight characters on the phone.

The OS certificate trust step is manual. No public certificate authority,
account service, relay, or external server is used. The local certificate is
stored under `~/.codex-lemma/lan/`, with a separate key per bound IPv4 address.
Do not publish the private keys. Changing the IP requires trusting its new
certificate. Do not forward this port through a public router.

If Windows asks for a firewall exception, limit it to the private network.
This feature does not change firewall rules automatically.

## Use

Select an existing conversation, view the recent history, load an older page,
send a message, stop a running turn, or respond to a pending approval. Long
items use the existing bounded history previews. History rendering uses text,
not executable HTML. The phone is a simple companion, with no model/provider
settings, terminal, filesystem browser, plugin installer, or new-workspace UI.

Tool calls and thinking appear as collapsed activity groups between messages.
Expand a group, then a step, to inspect its bounded text preview; unopened logs
are not mounted. Explicit expansion survives background refreshes. Only assistant
messages stream into the reply area, so reasoning/tool-output deltas do not flood
the conversation. A sticky top bar keeps Back available while scrolling; Android
system/browser Back returns from a chat to Recents before leaving the page.

The unified composer uses one bottom-right circular action: Send (arrow) while
idle and Stop (square) while a turn is running. An empty draft cannot send;
failed sends retain the draft. Short conversations keep the composer near the
bottom, and long conversations keep it sticky. Assistant replies are flat text
while user messages are right-aligned neutral bubbles. These phone controls share the desktop design language introduced in 0.1.19.

Command/file approvals offer allow-once and decline. Permission requests show
the requested permissions and grant only for the current turn. User questions
and MCP elicitation forms are also supported; schema-based MCP form responses
currently use a JSON field. The desktop and phone can both answer; the first
successful response wins, and later responses are rejected. Pending requests
are recovered from the engine's current pending ledger on reconnect.

The pairing code expires after 120 seconds, is single-use, and is invalidated
after eight failed attempts. Device credentials are Secure/HttpOnly/SameSite
cookies with a one-year browser lifetime. Device authorization survives app
restart; only SHA-256 token hashes are stored in `~/.codex-lemma/lan/devices.json`,
never raw device tokens or pairing codes. Writes are atomic and an unreadable or
invalid ledger fails closed. Initializing from the earlier in-memory preview
requires pairing once more. Clearing browser cookies also requires pairing again.
Closing LAN access invalidates all saved device credentials, disables restoration and
closes active streams. Enabling it again requires re-pairing. It does not
remove the certificate trust previously granted on the phone.

Recents uses the desktop's updated-at ordering and state database across projects
and providers. Identical IDs appear once, using the newest metadata; different
IDs with the same name remain separate. Pagination and lifecycle refreshes retain
this distinction. Archived chats stay outside this list.

## Validation

- `LIBCLANG_PATH` must point to the installed libclang directory when building
  the Windows whisper dependency; see CONTRIBUTING.md.
- Workspace clippy and Rust tests; full frontend tests and TypeScript checks.
- `lan::tests`: authentication, one-time pairing, revocation, Host/Origin
  boundaries, absent broad APIs, and an actual HTTPS socket with certificate
  validation. The TLS test simulates only private peer metadata.
- `src/components/settings/LanMobile.test.ts`: bounded history rendering,
  safe text handling, message submission, and request-specific approval.
- `tests/browser/lan-mobile.cjs`: Edge at 390×844 using an isolated synthetic
  backend; pairing, conversation history, message submission, approvals,
  no horizontal overflow. Set `PLAYWRIGHT_MODULE` to a Playwright installation.

These checks use synthetic conversation/provider data and do not require real
model or GPU inference. They do not substitute for installing and trusting the
certificate on a physical iOS/Android device.
