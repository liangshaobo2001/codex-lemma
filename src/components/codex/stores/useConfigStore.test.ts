import { describe, expect, it } from 'vitest';
import { migrateConfigStore } from './useConfigStore';

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

  it('switches a v1 install to Auto mode once', () => {
    expect(migrateConfigStore({ accessMode: 'auto', model: 'm' }, 1)).toEqual({
      accessMode: 'run',
      model: 'm',
    });
    expect(migrateConfigStore({ accessMode: 'full' }, 2)).toEqual({ accessMode: 'full' });
  });

  it('falls back to asking when v0 had no sandbox', () => {
    expect(migrateConfigStore({}, 0)).toEqual({ accessMode: 'ask' });
  });
});
