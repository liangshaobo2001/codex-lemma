Codex Lemma v0.1.19 refreshes the desktop interface and adds an opt-in LAN phone companion.

- Refine message bubbles, typography, spacing and the composer in light and dark themes. Focus no longer adds an extra outline around the composer.
- Keep the composer usable in narrow windows: hide approval text first, then speed/cache text, then the model name and reasoning-effort badge. Icons and tooltip readings remain available.
- Keep thinking collapsed by default, with a single-line live preview and optional expansion. Manual expansion survives stream completion.
- Keep Working lists open between tool calls until the turn finishes, avoiding repeated folding during pauses. Manual expansion and folding remain available.
- Show follow-up steer messages immediately, distinguish sending from accepted/failed states, and reconcile exact message IDs after live events or history reloads. Failed messages can be retried or dismissed explicitly.
- Use a phone on the private LAN to continue existing conversations and handle approvals through the same desktop backend. The phone UI collapses tool/thinking activity, streams assistant replies, keeps Back available while scrolling, and puts Send/Stop in the bottom-right corner.
- Match phone Recents to desktop ordering, with ID-based deduplication across pagination and refreshes. Different conversations sharing a name remain separate.
- Preserve trusted-device pairing and explicitly enabled LAN access across restarts. Pairing codes remain short-lived and single-use; disabling LAN access revokes paired devices.

The LAN companion is disabled by default and remains a self-use preview. First connection requires manually trusting the desktop certificate on the phone. Pair only trusted devices; the companion controls the current desktop backend. See [LAN setup](https://github.com/liangshaobo2001/codex-lemma/blob/v0.1.19/docs/LAN.md). Users of the earlier unpublished in-memory LAN preview need to pair once after upgrading.

Validation uses synthetic browser/API fixtures and automated frontend/Rust tests. No real model or GPU inference was run. Physical-phone certificate installation is not covered by automated browser tests.

The Windows x64 installer includes Codex CLI 0.163.0, license notices, checksums and a version-bound updater signature. The executable is not Authenticode-signed. Check for updates manually in Settings → General, or download the installer below.
