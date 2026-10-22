import initPrompt from '@/prompts/init.md?raw';
import { startReview } from '@/services';
import { codexService } from '@/services/codexService';

/** What a slash command can do once the composer text has been cleared. */
export interface SlashCommandContext {
  /** Thread the command runs against, started on demand. */
  ensureThread: () => Promise<string>;
  /** Current thread, or null when none is open yet. */
  currentThreadId: string | null;
  /** Opens one of the composer's command dialogs. */
  openDialog: (dialog: SlashDialog) => void;
}

export type SlashDialog = 'hooks' | 'memories' | 'import';

export interface SlashCommand {
  id: string;
  /** i18n key (chat namespace) of the description shown in the popup. */
  descriptionKey: string;
  run: (ctx: SlashCommandContext) => Promise<void> | void;
}

/**
 * Commands available in the composer, ordered by expected frequency the way
 * codex-rs orders its own popup (see `tui/src/slash_command.rs`, which notes
 * the enum order is the presentation order). Only commands Codexia can
 * actually carry out are listed.
 */
export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'review',
    descriptionKey: 'slash.review',
    run: async ({ ensureThread }) => {
      await startReview({
        threadId: await ensureThread(),
        target: { type: 'uncommittedChanges' },
        delivery: null,
      });
    },
  },
  {
    id: 'compact',
    descriptionKey: 'slash.compact',
    run: async ({ currentThreadId }) => {
      if (!currentThreadId) {
        return;
      }
      await codexService.threadCompact(currentThreadId);
    },
  },
  {
    id: 'init',
    descriptionKey: 'slash.init',
    run: async ({ ensureThread }) => {
      await codexService.turnStart(await ensureThread(), initPrompt);
    },
  },
  {
    id: 'memories',
    descriptionKey: 'slash.memories',
    run: ({ openDialog }) => openDialog('memories'),
  },
  {
    id: 'hooks',
    descriptionKey: 'slash.hooks',
    run: ({ openDialog }) => openDialog('hooks'),
  },
  {
    id: 'import',
    descriptionKey: 'slash.import',
    run: ({ openDialog }) => openDialog('import'),
  },
  {
    id: 'new',
    descriptionKey: 'slash.new',
    run: async () => {
      await codexService.setCurrentThread(null);
    },
  },
];

export function filterSlashCommands(query: string): SlashCommand[] {
  const needle = query.toLowerCase();
  return SLASH_COMMANDS.filter((cmd) => cmd.id.startsWith(needle));
}
