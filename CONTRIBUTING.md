# Contributing to Codex Lemma

The supported release target is Windows x64. Keep changes focused and preserve upstream attribution. Read [AGENTS.md](AGENTS.md) before changing code.

## Windows prerequisites

- Git, Bun, and Node.js (the build scripts use Node; installed users do not need it).
- Rust stable with the MSVC x64 target, Visual Studio C++ Build Tools, and a Windows SDK.
- Microsoft Edge WebView2.
- libclang: the speech dependency currently compiles even when dictation is unused. One option is `python -m pip install libclang==18.1.1 --target .build-tools/libclang`, then set `LIBCLANG_PATH` to that directory's `clang/native` folder.

## Set up and run

```powershell
git clone https://github.com/liangshaobo2001/codex-lemma.git
cd codex-lemma
bun install --frozen-lockfile
node scripts/prepare-codex.mjs
$env:LIBCLANG_PATH = (Resolve-Path .build-tools/libclang/clang/native).Path
bun tauri dev
```

The CLI staging script downloads the pinned Windows npm package. An existing package directory can be passed as its argument. Bundled resources are ignored by Git. The development server needs the same Responses-compatible model provider as the installed app.

## Validate

```powershell
bunx tsc --noEmit
bun run test
bun run validate-registry
bun run build
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
```

For frontend changes also run `bunx react-doctor@latest --no-telemetry --scope changed` and review its findings. Run targeted Biome checks on edited frontend files. Do not run broad automated formatting over unrelated files. Rust checks require a built `dist` directory and staged resources. Preserve regression tests and report environmental limitations.

## Build a release

Run `pwsh -File scripts/package-release.ps1` after validation. See [RELEASING.md](docs/RELEASING.md) for artifacts, checksums, and publishing. The source snapshot excludes dependencies, compiled binaries, model weights, credentials, and user data.

## Architecture

`src/` is the React UI; `src-tauri/` is the desktop shell. Shared Rust crates implement Codex app-server integration, storage, Git, and automation. `web/` supplies the loopback HTTP/WebSocket API used by the desktop UI. Keep shared backend features in those crates and routes; reserve Tauri commands for native capabilities. Internal `codexia-*` crate names are retained deliberately.
