import type { ServerNotification } from '@/bindings';

const LONG_THREAD_ADVISORY =
  'Heads up: Long threads and multiple compactions can cause the model to be less accurate. Start a new thread when possible to keep threads small and targeted.';

// Hide only this informational CLI advisory; actionable warnings remain visible.
export function isHiddenWarning(event: ServerNotification): boolean {
  return (
    event.method === 'warning' &&
    event.params.message.replace(/\s+/g, ' ').trim() === LONG_THREAD_ADVISORY
  );
}
