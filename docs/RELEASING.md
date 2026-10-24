# Releasing Codex Lemma

## Prepare

1. Start from a clean working tree on main. Update package.json, the workspace package version in Cargo.toml, and workspace package entries in Cargo.lock together. Update CHANGELOG.md and docs/RELEASE_NOTES.md. The Tauri version is read from package.json.
2. Follow CONTRIBUTING.md to install build dependencies and stage the pinned Codex CLI.
3. Run frontend typecheck/build/tests, connector registry validation, Rust workspace clippy and tests, and review React Doctor for UI changes. Do not publish private configuration, model weights, credentials, user histories, or local paths.
4. Run `pwsh -File scripts/package-release.ps1`. It creates `release-assets/Codex-Lemma_<version>_x64-setup.exe` and SHA256SUMS.txt. The installer includes the CLI, app license, and third-party notices. These generated binaries are not tracked by Git.
5. Rehearse installation, bundled CLI startup, a harmless tool call through a disposable Responses endpoint, and uninstallation when runtime or packaging changes. Use separate temporary CLI/WebView data and preserve any existing app data/protocol association.

## Publish automatically

Commit the reviewed source, then create and push the matching tag:

```powershell
git push origin main
git tag -a v0.1.0 -m 'Codex Lemma 0.1.0'
git push origin v0.1.0
```

Use the next version on later releases. The **Release Windows** GitHub Actions workflow builds and validates on Windows, creates a draft, uploads the installer/checksum, and publishes it. It uses the repository's GITHUB_TOKEN and the repository Actions secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. The public verification key is tracked in `src-tauri/updater.pub` and the Tauri configuration; the private key must never be committed. View its run before announcing the release. The workflow can also be started from Actions → Release Windows → Run workflow with an existing tag.

If a release already exists, the create step stops rather than replacing assets. Inspect it and resume manually; do not retag a published version. The executable is not Authenticode-signed. Its updater package is signed separately and is not promised to be bit-for-bit reproducible across toolchain changes.

## Publish an already tested local installer

With GitHub CLI signed into the correct account and the tag pushed:

```powershell
gh release create v0.1.0 --verify-tag --draft --title 'Codex Lemma v0.1.0' --notes-file docs/RELEASE_NOTES.md release-assets/*.exe release-assets/*.sig release-assets/latest.json release-assets/SHA256SUMS.txt
gh release edit v0.1.0 --draft=false
```

When publishing local assets, GitHub may create the tag when the draft becomes public and trigger the tag-based Release Windows workflow. Cancel that duplicate run for the same tag from Actions after publishing; the local assets are already uploaded and verified. Otherwise its create step will stop because the release exists. The automatic tag-push route needs no manual upload or cancellation.

Choose one publishing route. Verify the release page, asset sizes, checksum, and tag-to-commit relationship afterward. GitHub automatically adds source archives; do not upload the development workspace as an archive.

## Update signing

Official releases require a password-encrypted Tauri updater key. Store the key
and password separately in repository Actions secrets; local backups should be
access-controlled and the password protected by the OS credential store. Public
forks must generate their own key and change the hardcoded repository endpoint.
Never reuse the Lemma release key for a fork or publish a private key in build logs.

With `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` set,
`scripts/package-release.ps1` produces the installer, its `.sig`, `latest.json` and
SHA256SUMS.txt. Without a key it can build a development installer, but the release
workflow refuses to publish it. The signature binds the installer version; the
updater requires a valid signature and newer version before installation. Keep
installer assets and signatures immutable after publication. The workflow uploads
all assets to a draft before making the release visible to the manual updater.

A cold installation still requires the normal Windows installer. Update signatures
are not Windows Authenticode certificates and do not remove SmartScreen or Unknown
Publisher prompts. Do not claim that real model or GPU tests passed when only the
offline protocol fixtures ran.
