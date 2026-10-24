import { Monitor, Moon, Sun, X } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { type Accent, type Theme, useThemeStore } from '@/stores/settings';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { LanguageSelector } from './LanguageSelector';
import { UpdateSettings } from './UpdateSettings';

// label is a key under app:accent, translated where it renders.
const ACCENT_OPTIONS: Array<{ value: Accent; label: string; colorClass: string }> = [
  { value: 'default', label: 'default', colorClass: 'bg-neutral-500' },
  { value: 'ghibli', label: 'ghibli', colorClass: 'bg-emerald-700' },
  { value: 'black', label: 'noir', colorClass: 'bg-slate-800' },
  { value: 'pink', label: 'pink', colorClass: 'bg-pink-500' },
  { value: 'blue', label: 'blue', colorClass: 'bg-blue-500' },
  { value: 'green', label: 'green', colorClass: 'bg-emerald-500' },
  { value: 'purple', label: 'purple', colorClass: 'bg-purple-500' },
  { value: 'orange', label: 'orange', colorClass: 'bg-orange-500' },
];

export function GeneralSettings() {
  const {
    theme,
    setTheme,
    accent,
    setAccent,
    starfield,
    setStarfield,
    backgroundImage,
    setBackgroundImage,
  } = useThemeStore();
  const handleThemeChange = (value: string) => setTheme(value as Theme);
  const { t } = useTranslation('settings');
  const { t: ta } = useTranslation('app');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAccentSelect = (value: Accent) => {
    setAccent(value);
    // Noir looks flat without it, so switch the starfield on by default.
    if (value === 'black' && !starfield) setStarfield(true);
  };

  const handleBackgroundFile = (file: File | null | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setBackgroundImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-medium px-1">{t('preferences')}</h3>
        <Card>
          <CardContent className="px-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="text-sm font-medium">{t('appearance')}</div>
                <div className="text-xs text-muted-foreground">{t('appearanceDescription')}</div>
              </div>
              <Tabs value={theme} onValueChange={handleThemeChange}>
                <TabsList className="h-8">
                  <TabsTrigger value="light" className="px-3 gap-2 text-xs">
                    <Sun className="h-3.5 w-3.5" />
                    {t('light')}
                  </TabsTrigger>
                  <TabsTrigger value="dark" className="px-3 gap-2 text-xs">
                    <Moon className="h-3.5 w-3.5" />
                    {t('dark')}
                  </TabsTrigger>
                  <TabsTrigger value="system" className="px-3 gap-2 text-xs">
                    <Monitor className="h-3.5 w-3.5" />
                    {t('system')}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="h-px bg-border" />
            <div className="space-y-2">
              <div className="space-y-0.5">
                <div className="text-sm font-medium">{t('accentColor')}</div>
                <div className="text-xs text-muted-foreground">{t('accentColorDescription')}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {ACCENT_OPTIONS.map(({ value, label: labelKey, colorClass }) => {
                  const selected = accent === value;
                  const label = ta(`accent.${labelKey}`);
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => handleAccentSelect(value)}
                      className={cn(
                        'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors',
                        'hover:bg-accent/60 hover:text-accent-foreground',
                        selected
                          ? 'border-primary bg-accent text-accent-foreground'
                          : 'border-border text-foreground'
                      )}
                      aria-pressed={selected}
                      aria-label={ta('accent.use', { name: label })}
                    >
                      <span className={cn('size-2.5 rounded-full', colorClass)} />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="h-px bg-border" />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="text-sm font-medium">{t('starfield')}</div>
                <div className="text-xs text-muted-foreground">{t('starfieldDescription')}</div>
              </div>
              <Switch checked={starfield} onCheckedChange={setStarfield} />
            </div>
            <div className="space-y-2">
              <div className="space-y-0.5">
                <div className="text-sm font-medium">{t('backgroundImage')}</div>
                <div className="text-xs text-muted-foreground">
                  {t('backgroundImageDescription')}
                </div>
              </div>
              <div className="flex gap-2">
                <Input
                  type="url"
                  placeholder="https://..."
                  value={backgroundImage?.startsWith('data:') ? '' : (backgroundImage ?? '')}
                  onChange={(e) => setBackgroundImage(e.target.value || null)}
                  className="h-8 text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {t('uploadImage')}
                </Button>
                {backgroundImage && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setBackgroundImage(null)}
                    aria-label={t('clearBackgroundImage')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleBackgroundFile(e.target.files?.[0])}
                />
              </div>
            </div>
            <div className="h-px bg-border" />
            <LanguageSelector />
          </CardContent>
        </Card>
      </section>
      <UpdateSettings />
      <KeyboardShortcuts />
    </div>
  );
}
