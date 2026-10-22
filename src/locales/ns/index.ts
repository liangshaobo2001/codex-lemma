import { app } from './app';
import { chat } from './chat';
import { features } from './features';
import { tools } from './tools';

const namespaces = { app, chat, features, tools };

/** The per-namespace string tables for one locale; locales without a table fall back to en. */
export function namespaceResources(locale: 'en' | 'zh') {
  return Object.fromEntries(
    Object.entries(namespaces).map(([name, table]) => [name, table[locale]])
  ) as { [K in keyof typeof namespaces]: (typeof namespaces)[K]['en'] };
}
