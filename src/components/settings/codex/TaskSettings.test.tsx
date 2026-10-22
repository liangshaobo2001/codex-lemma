import '@/lib/i18n';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSettingsStore } from '@/stores/settings/useSettingsStore';
import { shouldPlayCompletionBeep } from '@/components/codex/hooks/beepOnCompletion';
import { TaskSettings } from './TaskSettings';
beforeEach(() => useSettingsStore.setState({enableTaskCompleteBeep:'never'}));
describe('completion sound preference', () => {
  it('defaults off and migrates the previous enabled default once', async () => {
    expect(useSettingsStore.getInitialState().enableTaskCompleteBeep).toBe('never');
    const migrate = useSettingsStore.persist.getOptions().migrate!;
    const old = await migrate({enableTaskCompleteBeep:'always',showReasoning:false},13) as {enableTaskCompleteBeep:string,showReasoning:boolean};
    expect(old.enableTaskCompleteBeep).toBe('never');
    expect(old.showReasoning).toBe(false);
    const current = await migrate({enableTaskCompleteBeep:'always'},14) as {enableTaskCompleteBeep:string};
    expect(current.enableTaskCompleteBeep).toBe('always');
  });
  it('provides an accessible switch that enables and disables completion sounds', () => {
    render(<TaskSettings/>);
    const toggle=screen.getByRole('switch',{name:'Task completion sound'});
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(shouldPlayCompletionBeep(useSettingsStore.getState().enableTaskCompleteBeep,true)).toBe(false);
    fireEvent.click(toggle);
    expect(useSettingsStore.getState().enableTaskCompleteBeep).toBe('always');
    expect(shouldPlayCompletionBeep(useSettingsStore.getState().enableTaskCompleteBeep,true)).toBe(true);
    fireEvent.click(toggle);
    expect(useSettingsStore.getState().enableTaskCompleteBeep).toBe('never');
  });
});
