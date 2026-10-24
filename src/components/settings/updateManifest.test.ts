import { expect, it } from 'vitest';
// @ts-expect-error Release helper is executed by Node, not bundled.
import { updateManifest } from '../../../scripts/create-update-manifest.mjs';
it('pins signed update assets to the Lemma repository and release version', () => {
  const manifest=updateManifest('0.1.13','Codex-Lemma_0.1.13_x64-setup.exe','signed-fixture','notes');
  expect(manifest.platforms['windows-x86_64'].url).toBe('https://github.com/liangshaobo2001/codex-lemma/releases/download/v0.1.13/Codex-Lemma_0.1.13_x64-setup.exe');
  expect(() => updateManifest('0.1.13','upstream.exe','sig','')).toThrow();
  expect(() => updateManifest('0.1.13','Codex-Lemma_0.1.13_x64-setup.exe','','')).toThrow();
});
