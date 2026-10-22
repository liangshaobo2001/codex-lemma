import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { type ComposerWidget, useSettingsStore } from '@/stores/settings';

const WIDGETS: ComposerWidget[] = ['context', 'speed', 'cache', 'cost'];

/** Turns the composer's usage readouts on and off. */
export function WidgetsSettings() {
  const { t } = useTranslation('settings');
  const composerWidgets = useSettingsStore((s) => s.composerWidgets);
  const setComposerWidget = useSettingsStore((s) => s.setComposerWidget);

  return (
    <section className="space-y-3">
      <div className="px-1">
        <h3 className="text-sm font-medium">{t('widgetsPage.title')}</h3>
        <p className="text-xs text-muted-foreground">{t('widgetsPage.intro')}</p>
      </div>
      <Card>
        <CardContent className="divide-y px-4">
          {WIDGETS.map((widget) => (
            <div key={widget} className="flex items-center justify-between gap-4 py-3">
              <div className="space-y-0.5">
                <div className="text-sm font-medium">{t(`widgetsPage.${widget}`)}</div>
                <div className="text-xs text-muted-foreground">
                  {t(`widgetsPage.${widget}Hint`)}
                </div>
              </div>
              <Switch
                checked={composerWidgets[widget]}
                onCheckedChange={(enabled) => setComposerWidget(widget, enabled)}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
