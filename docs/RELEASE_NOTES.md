Codex Lemma v0.1.18 raises the local Responses request-body limit from 16 MiB to 1 GiB.

- Fix local HTTP 413 errors when retained conversation images make the encoded request larger than 16 MiB. Both ordinary Responses requests and history-compaction requests use the larger limit.
- Keep a bounded 1 GiB limit rather than allowing unlimited request buffering. Regression tests cover JSON above the old limit and enforcement of the new boundary without allocating a gigabyte.
- This change expands the local adapter request limit; it does not add native video understanding or change the separate attachment-staging limit.

Validation uses synthetic request bodies and local test services. No real model or GPU inference was run for this release.

The Windows x64 installer includes Codex CLI 0.163.0, license notices, checksums, and a version-bound updater signature. The executable is not Authenticode-signed. Check for updates manually in Settings → General, or download the installer below.
