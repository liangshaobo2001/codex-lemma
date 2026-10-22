import { describe, expect, it } from 'vitest';
import { ACCESS_MODES, migrateConfigStore, useConfigStore } from './useConfigStore';

describe('codex config store migration', () => {
  it('maps each v0 sandbox to the access mode its menu entry stood for', () => {
    expect(migrateConfigStore({ sandbox: 'read-only', approvalPolicy: 'untrusted' }, 0)).toEqual({
      accessMode: 'ask',
    });
    expect(
      migrateConfigStore({ sandbox: 'workspace-write', approvalPolicy: 'on-request', model: 'm' }, 0)
    ).toEqual({ accessMode: 'auto', model: 'm' });
    expect(
      migrateConfigStore({ sandbox: 'danger-full-access', approvalPolicy: 'never' }, 0)
    ).toEqual({ accessMode: 'full' });
  });

  it.each([1, 2])('migrates the removed mode from v%s to asking without losing model settings', (version) => {
    expect(migrateConfigStore({ accessMode: 'run', model: 'm', providerModels: { local: 'm' } }, version)).toEqual({
      accessMode: 'ask', model: 'm', providerModels: { local: 'm' },
    });
  });

  it.each(['ask', 'auto', 'full'])('preserves the supported %s choice instead of forcing a new default', (accessMode) => {
    expect(migrateConfigStore({ accessMode, model: 'm' }, 1)).toEqual({ accessMode, model: 'm' });
    expect(migrateConfigStore({ accessMode }, 2)).toEqual({ accessMode });
  });

  it('defaults to asking for a fresh install or an invalid legacy mode', () => {
    expect(useConfigStore.getInitialState().accessMode).toBe('ask');
    expect(migrateConfigStore({ accessMode: 'unknown', model: 'm' }, 2)).toEqual({ accessMode: 'ask', model: 'm' });
  });

  it('keeps the sandbox and user reviewer in the default mode', () => {
    expect(Object.keys(ACCESS_MODES).sort()).toEqual(['ask', 'auto', 'full']);
    expect(ACCESS_MODES.ask).toEqual({ sandbox: 'workspace-write', approvalPolicy: 'on-request', approvalsReviewer: 'user' });
    expect(ACCESS_MODES.auto.approvalsReviewer).toBe('auto_review');
  });

  it('falls back to asking when v0 had no sandbox', () => {
    expect(migrateConfigStore({}, 0)).toEqual({ accessMode: 'ask' });
  });
});
