# Git scale regression

These fixtures render the real RightPanel, Git lists, stores and diff viewer in a
fresh browser context. All `/api/` requests are intercepted; no Codex/model
requests, account data or existing workspace contents are needed. The settings
button reproduces the layout unmount/remount boundary; it is not a measurement
of the complete settings screen or the native WebView process.

Start `bun run dev --host 127.0.0.1 --port 1438`. Install Playwright separately or
set `PLAYWRIGHT_MODULE` to an existing Playwright package directory. Edge is the
default browser; `BROWSER_EXECUTABLE` may point at another Chromium executable.

- `node tests/browser/git-scale.cjs after`: samples 0, 1,000 and 41,569 entries,
  including collapsed/open Review and entering/leaving settings. Reports live
  elements, DOM counters, JS heap, requests and automation-to-paint timings.
- `node tests/browser/git-interactions.cjs`: asserts bounded rows, searching for
  the final file, selecting an unmounted diff, scrolling, hide/show, inactive
  tabs, settings remounts, file refresh and workspace changes.
- `LEMMA_TEST_API_URL=http://127.0.0.1:<port>` plus
  `node tests/browser/git-real-repository.cjs`: creates a disposable Git repo
  with 303 mixed changes, forwards only the allowlisted Git endpoints to that
  backend and verifies stage/unstage/revert against actual Git index/content.
  All forwarded requests are forced to the disposable repo. This needs a
  running Lemma backend, but does not invoke models. In PowerShell set the
  variable with `$env:LEMMA_TEST_API_URL=...` first.

Evidence and disposable repositories go into a new OS temporary directory by
default; set `GIT_SCALE_OUTPUT` to choose one. Override the fixture URL with
`GIT_FIXTURE_URL`. Do not compare absolute timings across different browser
builds or machines. DOM counters can include detached nodes awaiting GC, and
JS heap is not total renderer private memory.
