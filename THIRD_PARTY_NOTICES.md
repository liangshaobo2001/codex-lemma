# Third-party notices

## Codexia

Codex Lemma is derived from Codexia v0.58.0 by milisp and contributors.
Source: https://github.com/milisp/codexia/tree/v0.58.0
License: MIT. The original copyright and complete terms are retained in LICENSE.
Upstream release history is retained in docs/upstream/CHANGELOG.md and changelogs/.

## Bundled Codex CLI

Windows packages include Codex CLI 0.163.0 from the official @openai/codex Windows x64 npm distribution.
Source: https://github.com/openai/codex
License: Apache-2.0. Its LICENSE.txt, NOTICE.txt, and VERSION.txt are installed in codex/.
The vendor helper layout is preserved; the optional voice-host payload is excluded.

## Other dependencies

React, Tauri, Rust crates, npm packages, and their transitive dependencies retain their respective licenses. Exact dependencies are recorded in Cargo.lock and bun.lock. The application MIT license does not replace dependency licenses.

## codex-finder

Version 0.1.2, original commit `fbfa841e465af96ec681704531766fe88cc895fc`, is included unchanged in vendor/codex-finder to keep builds independent of the unavailable upstream Git repository.
Source: https://github.com/milisp/codex-finder

MIT License

Copyright (c) 2026 milisp

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Codex model metadata and fallback prompt

`crates/codex/assets/codex-0.163.0/` contains unchanged model metadata and the
fallback prompt from openai/codex tag `rust-v0.163.0` (Apache-2.0).
The directory includes the upstream LICENSE and NOTICE. These assets supply
an offline baseline only when independent approval review is configured and
no user model catalog or cached catalog is available.

Source: https://github.com/openai/codex/tree/rust-v0.163.0/codex-rs/models-manager
Git blob hashes: models.json `72a78e0eacf94103f4babda2a5245aba4ce848c1`;
prompt.md `907ff8b877026871b088f01f4366cea36e1f02cd`.
