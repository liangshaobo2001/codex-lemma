import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CodeEditor } from '@/features/files';
import { getCodexHome, readTextFile, writeFile } from '@/services/apiAdapt';
import { getErrorMessage } from '@/utils/errorUtils';

const CONFIG_FILE_NAME = 'config.toml';

export function ConfigSettings() {
  const { t } = useTranslation('app');
  const [configPath, setConfigPath] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadConfig = async () => {
      setLoading(true);
      setError(null);
      setStatusMessage(null);

      try {
        const home = await getCodexHome();
        const normalizedHome = home.replace(/\/$/, '');
        const filePath = `${normalizedHome}/${CONFIG_FILE_NAME}`;
        setConfigPath(filePath);

        const fileContent = await readTextFile(filePath);
        if (!active) {
          return;
        }

        setContent(fileContent);
      } catch (err) {
        if (!active) {
          return;
        }

        const errorMessage = getErrorMessage(err);
        if (errorMessage.includes('does not exist')) {
          setContent('');
          setStatusMessage(t('config.missing', { file: CONFIG_FILE_NAME }));
          return;
        }

        setError(errorMessage);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadConfig();

    return () => {
      active = false;
    };
  }, [t]);

  const handleSave = async (newContent: string) => {
    if (!configPath) {
      throw new Error(t('config.pathNotReady'));
    }

    setError(null);
    setStatusMessage(null);

    try {
      await writeFile(configPath, newContent);
      setContent(newContent);
      setStatusMessage(t('config.saved'));
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      throw err;
    }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3>{t('config.title')}</h3>
        <p className="text-xs font-semibold tracking-wider text-muted-foreground">
          {configPath || t('config.loadingFile', { file: CONFIG_FILE_NAME })}
        </p>
        {loading ? (
          <div className="text-sm text-muted-foreground">{t('config.loading')}</div>
        ) : null}
        {error ? (
          <div className="rounded border border-destructive/70 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {statusMessage ? (
          <div className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">
            {statusMessage}
          </div>
        ) : null}
        <div className="h-[640px] min-h-[420px] overflow-hidden rounded-md border">
          <CodeEditor
            content={content}
            filePath={configPath || CONFIG_FILE_NAME}
            isReadOnly={loading || !configPath}
            onContentChange={setContent}
            onSave={handleSave}
          />
        </div>
      </section>
    </div>
  );
}
