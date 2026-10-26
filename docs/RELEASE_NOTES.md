Codex Lemma v0.1.15 fixes severe Git Review slowdowns in repositories with large numbers of changed or untracked files.

- The file tree and diff list render only rows near the viewport while keeping every file available for search, navigation, and Git actions.
- Hidden Review panels stop rendering the heavy Git view. Returning restores selection, expansion, and remembered scroll position without rebuilding thousands of cards.
- Status refreshes are coalesced and protected against stale workspace responses. Large diff previews have bounded calculation and rendering, with an Open file action when a preview exceeds the limit.
- Validated with 0, 1,000 and 41,569 synthetic changes, 287 frontend tests, and a disposable repository containing mixed staged, modified and untracked files. Browser-fixture results are not a benchmark of every machine. No real-model or GPU tests were needed.

The Windows x64 installer includes Codex CLI 0.163.0, license notices, checksums, and a version-bound updater signature. The executable is not Authenticode-signed. Check for updates manually in Settings → General, or download the installer below.
