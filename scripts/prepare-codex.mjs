#!/usr/bin/env node
// Stages the Codex CLI that the Windows installer ships, in src-tauri/resources/codex/.
//
//   node scripts/prepare-codex.mjs                      # downloads @openai/codex@<CODEX_VERSION>-win32-x64 from npm
//   node scripts/prepare-codex.mjs <codex-win32-x64>    # or copies from an installed package directory
//
// The npm package's vendor layout is kept (bin/, codex-path/, codex-resources/), because codex.exe finds its
// helpers relative to itself. The voice host is left out: dictation is not part of this build.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CODEX_VERSION = '0.163.0';
const TRIPLE = 'x86_64-pc-windows-msvc';
const root = path.resolve(import.meta.dirname, '..');
const dest = path.join(root, 'src-tauri', 'resources', 'codex');

let pkgDir = process.argv[2];
let scratch;
if (!pkgDir) {
  scratch = mkdtempSync(path.join(tmpdir(), 'lemma-codex-'));
  const url = `https://registry.npmjs.org/@openai/codex/-/codex-${CODEX_VERSION}-win32-x64.tgz`;
  const tgz = path.join(scratch, 'codex.tgz');
  console.log(`Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`npm download failed: ${res.status}`);
  writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));
  execFileSync('tar', ['-xzf', tgz, '-C', scratch]);
  pkgDir = path.join(scratch, 'package');
}

const vendor = path.join(pkgDir, 'vendor', TRIPLE);
if (!existsSync(path.join(vendor, 'bin', 'codex.exe'))) {
  throw new Error(`No codex.exe under ${vendor}`);
}

rmSync(dest, { recursive: true, force: true });
cpSync(vendor, dest, {
  recursive: true,
  filter: (src) => !src.startsWith(path.join(vendor, 'codex-resources', 'voice')),
});

// Codex is Apache-2.0; its licence and NOTICE travel with the binary.
cpSync(path.join(root, 'scripts', 'codex-LICENSE.txt'), path.join(dest, 'LICENSE.txt'));
cpSync(path.join(root, 'scripts', 'codex-NOTICE.txt'), path.join(dest, 'NOTICE.txt'));
writeFileSync(
  path.join(dest, 'VERSION.txt'),
  `Codex CLI ${CODEX_VERSION} (${TRIPLE}), from the npm package @openai/codex.\nSource: https://github.com/openai/codex\n`
);

if (scratch) rmSync(scratch, { recursive: true, force: true });

let bytes = 0;
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else bytes += s.size;
  }
};
walk(dest);
console.log(`Staged Codex ${CODEX_VERSION} in ${path.relative(root, dest)} (${(bytes / 1e6).toFixed(0)} MB)`);
