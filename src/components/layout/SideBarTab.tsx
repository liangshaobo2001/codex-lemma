import { useTranslation } from 'react-i18next';
import { ThreadList } from '@/components/codex/thread/ThreadList';
import { useServerProjectsStore } from '@/features/projects/useServerProjectsStore';
import { SideBarProjectList } from './SideBarProjectList';
import { SideBarServerProjects } from './SideBarServerProjects';

type SideBarCodexTabProps = {
  /** Starts a thread in `project`, or outside any project for `null`. */
  onCreateNewThread: (project: string | null) => void;
};

export function SideBarCodexTab({ onCreateNewThread }: SideBarCodexTabProps) {
  const { t } = useTranslation('app');
  const status = useServerProjectsStore((s) => s.status);
  // Without server projects (no state DB, or still loading) fall back to the
  // local cwd list so the sidebar keeps working.
  if (status === 'ready') return <SideBarServerProjects onNewChat={onCreateNewThread} />;
  return (
    <SideBarProjectList
      onNewAction={onCreateNewThread}
      newActionTitle={(name) => t('projects.newThreadIn', { name })}
      renderList={(project) => <ThreadList cwd={project} />}
    />
  );
}
