# Phone conversation regression

`node tests/browser/lan-mobile.cjs` runs the phone page against an isolated synthetic
HTTP/SSE server (same `PLAYWRIGHT_MODULE` setup below). It covers a 51-step activity
group without eagerly mounting logs, explicit expansion retained during refresh,
tool/reasoning delta filtering, assistant streaming reconciliation, approvals and
message submission against the fixture, sticky Back after long scrolling, browser
Back, plain-text safety and the JavaScript-disabled fallback. GPU is disabled;
no production sessions or model endpoints are used.

Keep this real-browser navigation check: wrapping raw inline scripts in
`new Function` changes their scope and can hide collisions with browser globals
such as `window.history`.

# Desktop visual proposal (preview only)

With the isolated Vite server on port 1441, run
`node tests/browser/desktop-design.cjs` using `PLAYWRIGHT_MODULE` and
`DESIGN_OUTPUT`. This renders the real AppLayout/sidebar/thread/composer with
synthetic store data, intercepts all API traffic and blocks turn requests and
WebSockets. It captures the same 1440×900 content before/after in light/dark mode.
The original proposal (approved 2026-11-03 and implemented in production components) is scoped by `data-lemma-design=after` in
`desktop-design.css`, imported only by this fixture. It remains a fixture reference and must not be imported into the app; approved
styles are applied directly to the real components. Production dist
assets must remain free of that selector.

# Streaming reasoning regression

With the isolated Vite server on port 1441, run
`node tests/browser/reasoning-stream.cjs` (same `PLAYWRIGHT_MODULE` setup below).
This renders the real Reasoning component with synthetic deltas and no model calls,
in a fresh headless Edge profile with GPU disabled and HTTP traffic limited to
fixture GETs. At 360/640/1000px it verifies collapsed defaults, a single-line preview
that follows the latest text, manual expansion, and stable row height/position
when reasoning completes and the next step starts. Set `REASONING_OUTPUT` to an
absolute filename prefix for screenshots and geometry evidence.

# Composer toolbar regression

`composer-toolbar.html` renders the real responsive toolbar, approval selector,
model trigger, throughput widget and context ring with synthetic store data.
The attachment, dictation and send/queue/stop buttons are inert fixture controls
with the production sizing classes. This checks layout, not message submission
or production composer integration. No accounts, model calls or GPU are needed.

Start `bun run dev --host 127.0.0.1 --port 1441`, set `PLAYWRIGHT_MODULE` to an
installed Playwright package if needed, and run
`node tests/browser/composer-toolbar.cjs`. The runner uses a fresh headless Edge
context with GPU disabled and blocks API requests, external traffic and non-fixture
WebSockets. `TOOLBAR_OUTPUT` selects the evidence directory.

Checks cover English/Chinese, long model names, 100/125/150% CSS zoom, idle/active
controls and panel width changes. Across 1,032 sampled widths, labels disappear
in order, numeric titles and accessible names survive, and controls stay inside
the toolbar whenever the final icon layout can fit. Below that irreducible width,
level 3 remains unchanged as requested. Unit tests separately check hysteresis,
control identity, dynamic content and observer cleanup.

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
