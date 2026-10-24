import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
export function updateManifest(version, filename, signature, notes) {
  if (!/^0\.1\.\d+$/.test(version) || filename !== `Codex-Lemma_${version}_x64-setup.exe`) throw Error('Unexpected Lemma release name or version');
  if (!signature.trim()) throw Error('A signed installer is required');
  return { version, notes, platforms: { 'windows-x86_64': { url: `https://github.com/liangshaobo2001/codex-lemma/releases/download/v${version}/${filename}`, signature: signature.trim() } } };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const version=JSON.parse(readFileSync(new URL('../package.json',import.meta.url))).version;
  const file=resolve('release-assets',`Codex-Lemma_${version}_x64-setup.exe`);
  const manifest=updateManifest(version,basename(file),readFileSync(file+'.sig','utf8'),readFileSync('docs/RELEASE_NOTES.md','utf8'));
  writeFileSync('release-assets/latest.json',JSON.stringify(manifest,null,2)+'\n');
}
