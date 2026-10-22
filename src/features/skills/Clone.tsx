import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { cloneSkillsRepo } from '@/services';

const RECOMMENDED_URLS = [
  'https://github.com/anthropics/skills.git',
  'https://github.com/openai/skills.git',
];

export function Clone() {
  const { t } = useTranslation('tools');
  const [url, setUrl] = useState(RECOMMENDED_URLS[0]);
  const [cloningUrl, setCloningUrl] = useState<string | null>(null);
  const [clonedTargets, setClonedTargets] = useState<Array<{ url: string; path: string }>>([]);

  const handleClone = async (rawUrl: string) => {
    const trimmedUrl = rawUrl.trim();
    if (!trimmedUrl || cloningUrl) {
      if (!trimmedUrl) {
        toast.error(t('skills.clone.enterUrl'));
      }
      return;
    }

    setCloningUrl(trimmedUrl);
    try {
      const path = await cloneSkillsRepo(trimmedUrl);
      setClonedTargets((prev) => {
        const next = prev.filter((item) => item.url !== trimmedUrl);
        return [...next, { url: trimmedUrl, path }];
      });
      toast.success(t('skills.clone.cloned'));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('skills.clone.cloneFailed');
      toast.error(t('skills.clone.cloneRepoFailed'), {
        description: message,
      });
    } finally {
      setCloningUrl(null);
    }
  };

  const handleCloneCustom = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      toast.error(t('skills.clone.enterUrl'));
      return;
    }

    await handleClone(trimmedUrl);
  };

  return (
    <div>
      <div className="mx-auto flex max-w-2xl flex-col gap-4 rounded-lg border bg-card p-4">
        <h2 className="text-lg font-semibold">{t('skills.clone.title')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('skills.clone.intoPrefix')}{' '}
          <code>
            ~/.agents/plugins/{'{user}'}/{'{repo}'}
          </code>
          {t('skills.clone.intoSuffix')}
        </p>
        <div className="flex gap-2">
          <Input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://github.com/anthropics/skills.git"
          />
          <Button onClick={handleCloneCustom} disabled={Boolean(cloningUrl)}>
            {cloningUrl === url.trim() ? t('skills.clone.cloning') : t('skills.clone.clone')}
          </Button>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">{t('skills.clone.recommended')}</p>
          <div className="space-y-2">
            {RECOMMENDED_URLS.map((recommendedUrl) => (
              <div
                key={recommendedUrl}
                className="flex items-center justify-between gap-2 rounded-md border p-2"
              >
                <a
                  href={recommendedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-sm text-primary underline"
                >
                  {recommendedUrl}
                </a>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleClone(recommendedUrl)}
                  disabled={Boolean(cloningUrl)}
                >
                  {cloningUrl === recommendedUrl
                    ? t('skills.clone.cloning')
                    : t('skills.clone.clone')}
                </Button>
              </div>
            ))}
          </div>
        </div>
        {clonedTargets.length > 0 ? (
          <div className="space-y-1 text-sm text-muted-foreground">
            {clonedTargets.map((item) => (
              <p key={item.url}>
                <span>{t('skills.clone.clonedPrefix')}</span>
                <code>{item.url}</code>
                <span>{t('skills.clone.clonedTo')}</span>
                <code>{item.path}</code>
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
