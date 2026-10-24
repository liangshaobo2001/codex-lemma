Codex Lemma v0.1.13 adds manual signed updates and separate approval-model settings.

- Settings → General: check for updates only when clicked. Download and install are separate actions; downloads verify the package signature and its version. Installation refuses running or queued chats.
- Settings → Models: optionally choose a different custom Responses provider/model for approval review, with its own context budget and effort. The main model stays a per-chat choice. Reviewer changes take effect after restart, and the page distinguishes saved settings from the running configuration.
- Reviewer requests use their own provider credentials and session identity. Unsupported subscription/signed-auth main providers require manual approval or the default review configuration; no silent main-model fallback is added.
- Shared Codex home, logins, installed plugins and model services are preserved. Real-model/GPU acceptance is deferred; validation for this release uses synthetic localhost endpoints, actual CLI approval execution/denial, budget/error handling, and signature verification tests.

The Windows x64 installer includes Codex CLI 0.163.0, license notices and a version-bound updater signature. The executable is not Authenticode-signed: Unknown Publisher/SmartScreen prompts may still appear. The updater makes no background checks; selected providers, plugins and other optional features retain their own network behavior. Verify SHA256SUMS.txt for a manual installation.
