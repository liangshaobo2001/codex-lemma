import { open } from '@tauri-apps/plugin-shell';
import { useTranslation } from 'react-i18next';
import { version } from '../../package.json';

const UPSTREAM_URL = 'https://github.com/milisp/codexia';

export default function AboutView() {
  const { t } = useTranslation('app');
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-background text-foreground p-8 select-none">
      <img src="/icons/128x128.png" alt="Codex Lemma" className="w-16 h-16 rounded-xl" />
      <div className="text-center">
        <h1 className="text-xl font-semibold">Codex Lemma</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('about.version', { version })}</p>
      </div>
      <p className="text-sm text-center text-muted-foreground max-w-xs">{t('about.tagline')}</p>
      <p className="text-xs text-center text-muted-foreground max-w-xs">
        Based on Codexia v0.58.0 by milisp (MIT).{' '}
        <button
          type="button"
          className="text-blue-500 hover:underline cursor-pointer"
          onClick={() => open(UPSTREAM_URL)}
        >
          github.com/milisp/codexia
        </button>
      </p>
    </div>
  );
}
