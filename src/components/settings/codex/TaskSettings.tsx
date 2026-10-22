import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { type TaskDetail, useSettingsStore } from '@/stores/settings';

export function TaskSettings() {
  const { t } = useTranslation('app');
  const {
    enableTaskCompleteBeep,
    setEnableTaskCompleteBeep,
    preventSleepDuringTasks,
    setPreventSleepDuringTasks,
    showReasoning,
    setShowReasoning,
    taskDetail,
    setTaskDetail,
  } = useSettingsStore();
  const handleTaskDetailChange = (value: string) => setTaskDetail(value as TaskDetail);

  return (
    <div className="w-full px-2 sm:px-4 space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm sm:text-base font-medium">{t('task.title')}</h3>
        <div className="flex flex-col gap-3 sm:gap-4 text-balance">
          <div className="flex items-center justify-between gap-3 rounded-md border p-3 sm:p-4">
            <div className="space-y-0.5">
              <p className="text-xs sm:text-sm font-medium">{t('task.detail')}</p>
              <p className="text-xs text-muted-foreground">{t('task.detailDescription')}</p>
            </div>
            <Select defaultValue={taskDetail} onValueChange={handleTaskDetailChange}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="steps">{t('task.steps')}</SelectItem>
                <SelectItem value="stepsWithCommand">{t('task.stepsWithCommand')}</SelectItem>
                <SelectItem value="stepsWithOutput">{t('task.stepsWithOutput')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-start justify-between gap-2 sm:gap-4 rounded-md border p-3 sm:p-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm font-medium">{t('task.beep')}</p>
              <p className="text-xs text-muted-foreground">{t('task.beepDescription')}</p>
            </div>
            <Switch
              checked={enableTaskCompleteBeep !== 'never'}
              onCheckedChange={(enabled) => setEnableTaskCompleteBeep(enabled ? 'always' : 'never')}
              aria-label={t('task.beep')}
              className="flex-shrink-0"
            />
          </div>
          <div className="flex items-start justify-between gap-2 sm:gap-4 rounded-md border p-3 sm:p-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm font-medium">{t('task.keepAwake')}</p>
              <p className="text-xs text-muted-foreground">{t('task.keepAwakeDescription')}</p>
            </div>
            <Switch
              checked={preventSleepDuringTasks}
              onCheckedChange={setPreventSleepDuringTasks}
              className="flex-shrink-0"
            />
          </div>
          <div className="flex items-start justify-between gap-2 sm:gap-4 rounded-md border p-3 sm:p-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm font-medium">{t('task.showReasoning')}</p>
              <p className="text-xs text-muted-foreground">{t('task.showReasoningDescription')}</p>
            </div>
            <Switch
              checked={showReasoning}
              onCheckedChange={setShowReasoning}
              className="flex-shrink-0"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
