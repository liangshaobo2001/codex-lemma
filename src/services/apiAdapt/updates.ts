import { invokeTauri } from './shared';
export interface LemmaRelease {
  version: string;
  notes: string | null;
}
// Never called by startup, effects, timers, or focus handlers.
export const checkLemmaUpdate = () => invokeTauri<LemmaRelease | null>('check_lemma_update');
export const downloadLemmaUpdate = () => invokeTauri<void>('download_lemma_update');
export const installLemmaUpdate = () => invokeTauri<void>('install_lemma_update');
