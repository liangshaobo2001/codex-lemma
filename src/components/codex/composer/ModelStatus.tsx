import { useTranslation } from 'react-i18next';
import { useComposerModel } from '../hooks/useComposerModel';
export function ModelStatus() {
  const { t } = useTranslation('chat');
  const { pending, error } = useComposerModel();
  if (!pending && !error) return null;
  return (
    <div role={error ? 'alert' : 'status'} className="px-3 py-1 text-xs text-muted-foreground">
      {pending ? t('composer.switchingModel') : t('composer.modelSwitchFailed', { reason: error })}
    </div>
  );
}
