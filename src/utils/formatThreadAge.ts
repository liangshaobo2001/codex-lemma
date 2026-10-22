import { i18n } from '@/lib/i18n';

export function formatThreadAge(timestampSeconds: number): string {
  const nowSeconds = Date.now() / 1000;
  const deltaSeconds = Math.max(0, nowSeconds - timestampSeconds);
  if (deltaSeconds < 60) {
    return i18n.t('app:age.now');
  }
  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes < 60) {
    return i18n.t('app:age.minutes', { count: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return i18n.t('app:age.hours', { count: hours });
  }
  const days = Math.floor(hours / 24);
  return i18n.t('app:age.days', { count: days });
}
