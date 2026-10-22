import type { McpServerConfig } from '@/components/codex/types';
import index from '../../../registry/index.json';

/**
 * Connector catalog in the MCP Linker directory format: one official MCP Registry
 * `server.json` per entry under the root `registry/servers/`, display order and categories in
 * `registry/index.json`. Codexia-only fields live in the publisher-provided metadata.
 */
const REGISTRY_META = 'io.modelcontextprotocol.registry/publisher-provided';
const CODEXIA_META = 'io.github.milisp.codexia';

type ServerJson = {
  title: string;
  description: string;
  remotes: { type: 'streamable-http' | 'sse'; url: string }[];
  _meta: Record<
    string,
    Record<
      string,
      {
        configName: string;
        category: string;
        official: boolean;
        featured?: boolean;
        access?: string;
        authorizationRequired?: boolean;
      }
    >
  >;
};

export type AppPreset = {
  name: string;
  label: string;
  description: string;
  access?: string;
  category: string;
  official: boolean;
  featured: boolean;
  authorizationRequired?: boolean;
  config: McpServerConfig;
};

const files = import.meta.glob<ServerJson>('../../../registry/servers/*.json', {
  eager: true,
  import: 'default',
});

const byId = new Map(
  Object.entries(files).map(([path, server]) => [path.replace(/^.*\/(.+)\.json$/, '$1'), server])
);

export const appCategories: string[] = index.categories;

export const appPresets: AppPreset[] = index.servers.flatMap((id) => {
  const server = byId.get(id);
  const remote = server?.remotes[0];
  if (!server || !remote) return [];
  const meta = server._meta[REGISTRY_META][CODEXIA_META];
  return [
    {
      name: meta.configName,
      label: server.title,
      description: server.description,
      access: meta.access,
      category: meta.category,
      official: meta.official,
      featured: meta.featured === true,
      authorizationRequired: meta.authorizationRequired,
      config: { type: remote.type === 'sse' ? 'sse' : 'http', url: remote.url },
    },
  ];
});
