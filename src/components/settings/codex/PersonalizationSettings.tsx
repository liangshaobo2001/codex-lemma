import MarkdownIt from 'markdown-it';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import MdEditor from 'react-markdown-editor-lite';
import { type Personality, useConfigStore } from '@/components/codex/stores';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import 'react-markdown-editor-lite/lib/index.css';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useThemeContext } from '@/contexts/ThemeContext';
import { loadInstructionFile, saveInstructionFile } from '@/utils/instructionFile';

const CUSTOM_INSTRUCTIONS_PATH = '~/.codex/AGENTS.md';

export function PersonalizationSettings() {
  const { t } = useTranslation('app');
  const { personality, setPersonality } = useConfigStore();
  const selectValue = personality ?? 'friendly';
  const { resolvedTheme } = useThemeContext();
  const mdParser = useRef(new MarkdownIt());
  const [instructions, setInstructions] = useState<string>('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isActive = true;

    const loadInstructions = async () => {
      setLoadError(null);
      try {
        const result = await loadInstructionFile({
          path: CUSTOM_INSTRUCTIONS_PATH,
        });
        if (isActive) {
          setInstructions(result.content);
        }
      } catch (err) {
        if (isActive) {
          setInstructions('');
          const message = err instanceof Error ? err.message : String(err);
          setLoadError(message || t('personalization.loadFailed'));
        }
      }
    };

    void loadInstructions();

    return () => {
      isActive = false;
    };
  }, [t]);

  const handleSave = async () => {
    setSaveError(null);
    setIsSaving(true);
    try {
      await saveInstructionFile({
        path: CUSTOM_INSTRUCTIONS_PATH,
        content: instructions,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSaveError(message || t('personalization.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold tracking-tight">{t('personalization.title')}</h3>
        <Card className="p-0">
          <CardContent className="p-0 divide-y divide-border/40">
            <div className="p-4 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="text-sm font-semibold tracking-tight">
                  {t('personalization.personality')}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t('personalization.personalityDescription')}
                </p>
              </div>
              <Select
                value={selectValue}
                onValueChange={(value) => setPersonality(value as Personality)}
              >
                <SelectTrigger className="min-w-[160px]">
                  <SelectValue placeholder={t('personalization.friendly')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="friendly">{t('personalization.friendly')}</SelectItem>
                  <SelectItem value="pragmatic">{t('personalization.pragmatic')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
        <h4>{t('personalization.customInstructions')}</h4>
        <p className="text-xs text-muted-foreground gap-2 flex items-center">
          {t('personalization.customInstructionsDescription')}{' '}
          <a href="https://developers.openai.com/codex/guides/agents-md/#create-global-guidance">
            {t('common.learnMore')}
          </a>
          <ExternalLink className="inline w-4 h-4" />
        </p>
        {loadError ? <p className="text-xs text-muted-foreground">{loadError}</p> : null}
        <div className={resolvedTheme === 'dark' ? 'rc-md-editor-dark' : ''}>
          <MdEditor
            value={instructions}
            view={{ menu: true, md: true, html: false }}
            renderHTML={(text) => mdParser.current.render(text)}
            onChange={({ text }) => setInstructions(text)}
          />
        </div>
        {saveError ? <p className="text-xs text-destructive">{saveError}</p> : null}
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? t('common.saving') : t('common.save')}
        </Button>
      </section>
    </div>
  );
}
