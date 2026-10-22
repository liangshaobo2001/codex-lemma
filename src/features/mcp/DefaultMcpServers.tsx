import { Check, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { type UnifiedMcpClientName, unifiedAddMcpServer } from '@/services';
import { appCategories, appPresets } from './appPresets';
import { ConnectorIcon } from './ConnectorIcon';

interface DefaultMcpServersProps {
  agent: UnifiedMcpClientName;
  cwd?: string;
  servers: Record<string, unknown>;
  onServerAdded: () => void;
}

const sections = [
  { title: 'Featured', featured: true, presets: appPresets.filter((preset) => preset.featured) },
  ...appCategories.map((title) => ({
    title,
    featured: false,
    presets: appPresets.filter((preset) => !preset.featured && preset.category === title),
  })),
].filter((section) => section.presets.length > 0);

export function DefaultMcpServers({ agent, cwd, servers, onServerAdded }: DefaultMcpServersProps) {
  const { t } = useTranslation('tools');
  const [adding, setAdding] = useState<string | null>(null);
  const catalogKey = `${agent}:${cwd ?? ''}`;
  const [additions, setAdditions] = useState<{
    key: string;
    servers: Record<string, unknown>;
  }>({ key: '', servers: {} });
  const justAdded = additions.key === catalogKey ? additions.servers : {};
  const add = async (preset: (typeof appPresets)[number]) => {
    setAdding(preset.name);
    try {
      await unifiedAddMcpServer({
        clientName: agent,
        path: cwd,
        serverName: preset.name,
        serverConfig: preset.config,
      });
      toast.success(
        `${t('mcp.presetConfigured', { label: preset.label })}${preset.access ? ` ${preset.access}.` : ''}`
      );
      onServerAdded();
      setAdditions((previous) => ({
        key: catalogKey,
        servers: {
          ...(previous.key === catalogKey ? previous.servers : {}),
          [preset.name]: preset.config,
        },
      }));
    } catch (error) {
      toast.error(t('mcp.presetAddFailed', { label: preset.label, error: String(error) }));
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-semibold">{t('mcp.connectors')}</h3>
        <p className="text-sm text-muted-foreground">{t('mcp.connectorsDescription')}</p>
      </div>
      {sections.map((section) => {
        const sectionTitle = section.featured ? t('mcp.featured') : section.title;
        return (
          <section key={section.title} className="flex flex-col gap-3" aria-label={sectionTitle}>
            <h4 className="text-sm font-medium text-muted-foreground">{sectionTitle}</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {section.presets.map((preset) => {
                const added = preset.name in servers || preset.name in justAdded;
                return (
                  <div key={preset.name} className="flex items-start gap-3 rounded-lg border p-4">
                    <ConnectorIcon name={preset.name} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-sm font-medium">{preset.label}</span>
                      <p className="text-xs text-muted-foreground">{preset.description}</p>
                      {preset.access ? (
                        <span className="text-xs text-muted-foreground">{preset.access}</span>
                      ) : null}
                    </div>
                    {added ? (
                      <Check
                        aria-label={t('mcp.presetConfiguredAria', { label: preset.label })}
                        className="size-4 shrink-0 text-muted-foreground"
                      />
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={t('mcp.addPreset', { label: preset.label })}
                        disabled={adding !== null}
                        onClick={() => add(preset)}
                      >
                        <Plus data-icon="inline-start" />
                        {adding === preset.name ? t('mcp.adding') : t('mcp.add')}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
