import { listen } from '@tauri-apps/api/event';
import { Edit, KeyRound, Loader2, Trash2 } from 'lucide-react';
import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ServerNotification } from '@/bindings/ServerNotification';
import type { McpAuthStatus, McpServerOauthLoginCompletedNotification } from '@/bindings/v2';
import type { McpServerConfig } from '@/components/codex/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useExternalUrl } from '@/features/plugins/hooks/useExternalUrl';
import { isTauri } from '@/hooks/runtime';
import {
  mcpServerOauthLogin,
  unifiedDisableMcpServer,
  unifiedEnableMcpServer,
  unifiedRemoveMcpServer,
} from '@/services';

const AUTH_STATUS_LABEL_KEY: Record<McpAuthStatus, string> = {
  unsupported: 'mcp.authStatus.unsupported',
  notLoggedIn: 'mcp.authStatus.notLoggedIn',
  bearerToken: 'mcp.authStatus.bearerToken',
  oAuth: 'mcp.authStatus.oAuth',
  unknown: 'mcp.authStatus.unknown',
};

export const getServerProtocol = (config: McpServerConfig): 'stdio' | 'http' | 'sse' =>
  config.type ?? 'stdio';

interface McpServerCardProps {
  name: string;
  config: McpServerConfig;
  loadServers: () => Promise<void>;
  setServers: Dispatch<SetStateAction<Record<string, McpServerConfig>>>;
  onEdit: (name: string, config: McpServerConfig) => void;
  authStatus?: McpAuthStatus;
  onAuthChanged?: () => void;
}

export function McpServerCard({
  name,
  config,
  loadServers,
  setServers,
  onEdit,
  authStatus,
  onAuthChanged,
}: McpServerCardProps) {
  const { t } = useTranslation('tools');
  const serverType = getServerProtocol(config);
  const isEnabled = config.enabled ?? true;
  const { openExternalUrl } = useExternalUrl();
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  // stdio servers run locally and never go through OAuth.
  const supportsAuth = serverType !== 'stdio';
  const needsAuth = supportsAuth && authStatus === 'notLoggedIn';

  useEffect(() => {
    if (!isAuthorizing || !isTauri()) {
      return;
    }

    const unlistenPromise = listen<ServerNotification>('codex:notification', (event) => {
      const { method, params } = event.payload;
      if (method !== 'mcpServer/oauthLogin/completed') {
        return;
      }
      const payload = params as McpServerOauthLoginCompletedNotification;
      if (payload.name !== name) {
        return;
      }
      setIsAuthorizing(false);
      if (payload.success) {
        toast.success(t('mcp.authorized', { name }));
      } else {
        toast.error(
          t('mcp.authorizationFailed', { error: payload.error ?? t('mcp.unknownError') })
        );
      }
      onAuthChanged?.();
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [isAuthorizing, name, onAuthChanged, t]);

  const handleAuthorize = async () => {
    setIsAuthorizing(true);
    try {
      const response = await mcpServerOauthLogin({
        name,
        threadId: null,
        scopes: null,
        timeoutSecs: null,
      });
      await openExternalUrl(response.authorizationUrl);
      toast.info(t('mcp.completeInBrowser'));
    } catch (error) {
      setIsAuthorizing(false);
      toast.error(t('mcp.authorizationStartFailed', { error: String(error) }));
    }
  };

  const handleDeleteServer = async () => {
    try {
      await unifiedRemoveMcpServer({ clientName: 'codex', serverName: name });
      await loadServers();
    } catch (error) {
      console.error('Failed to delete MCP server:', error);
      toast.error(t('mcp.deleteFailed', { error: String(error) }));
    }
  };

  const handleToggleServerEnabled = async (enabled: boolean) => {
    try {
      if (enabled) {
        await unifiedEnableMcpServer({ clientName: 'codex', serverName: name });
      } else {
        await unifiedDisableMcpServer({ clientName: 'codex', serverName: name });
      }
      setServers((prev) => {
        const server = prev[name];
        if (!server) {
          return prev;
        }
        return {
          ...prev,
          [name]: {
            ...server,
            enabled,
          },
        };
      });
    } catch (error) {
      console.error('Failed to update MCP server enabled flag:', error);
      toast.error(t('mcp.toggleFailed', { error: String(error) }));
    }
  };

  return (
    <Card className="gap-0">
      <CardHeader>
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            {name}
            {supportsAuth && authStatus && (
              <Badge
                variant="outline"
                className={`text-[10px] font-normal px-1.5 h-4 uppercase ${
                  authStatus === 'notLoggedIn'
                    ? 'bg-red-500/10 text-red-500'
                    : authStatus === 'unsupported'
                      ? 'text-muted-foreground'
                      : 'bg-green-500/10 text-green-500'
                }`}
              >
                {t(AUTH_STATUS_LABEL_KEY[authStatus])}
              </Badge>
            )}
          </span>
          <div className="flex gap-1 items-center">
            {needsAuth && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleAuthorize}
                disabled={isAuthorizing}
                className="h-7 text-xs"
              >
                {isAuthorizing ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <KeyRound className="h-3.5 w-3.5 mr-1" />
                )}
                {t('mcp.authorize')}
              </Button>
            )}
            <Switch
              checked={isEnabled}
              onCheckedChange={(checked) => handleToggleServerEnabled(checked)}
              aria-label={t('mcp.toggleServer', { name })}
            />
            <Button size="sm" variant="ghost" onClick={() => onEdit(name, config)}>
              <Edit className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDeleteServer}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-xs text-gray-600">
          {serverType === 'stdio' && (
            <div>
              <strong>{t('mcp.card.command')}</strong> {'command' in config ? config.command : ''}
              {'args' in config && config.args && config.args.length > 0 && (
                <div>
                  <strong>{t('mcp.card.args')}</strong> {config.args.join(' ')}
                </div>
              )}
              {'env' in config && config.env && (
                <div>
                  <strong>{t('mcp.card.env')}</strong> {Object.keys(config.env).join(', ')}
                </div>
              )}
            </div>
          )}
          {serverType === 'http' && 'url' in config && (
            <div>
              <strong>url:</strong> {config.url}
            </div>
          )}
          {serverType === 'sse' && 'url' in config && (
            <div>
              <strong>url:</strong> {config.url}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
