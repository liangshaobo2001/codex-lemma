import { useSessionTools } from '../stores/useSessionTools';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useThreadModels } from '@/components/codex/stores/useThreadModels';

const threadQueueAdd = vi.fn();
const turnSteer = vi.fn();
const turnStart = vi.fn();
vi.mock('@/services/codexService', () => ({
  codexService: {
    threadQueueAdd: (...a: unknown[]) => threadQueueAdd(...a),
    turnSteer: (...a: unknown[]) => turnSteer(...a),
    turnStart: (...a: unknown[]) => turnStart(...a),
    turnInterrupt: vi.fn(),
  },
}));

// Heavy collaborators that have nothing to do with the send path.
vi.mock('./QueuedMessages', () => ({ QueuedMessages: () => null }));
vi.mock('./ComposerMenu', () => ({ ComposerMenu: () => null }));
vi.mock('./AccessModePopover', () => ({ AccessModePopover: () => null }));
vi.mock('./DictationButton', () => ({ DictationButton: () => null }));
vi.mock('./SlashCommandDialogs', () => ({ SlashCommandDialogs: () => null }));
vi.mock('./SlashCommandsSelector', () => ({ SlashCommandPopover: () => null }));
vi.mock('./ComposerToolbarContext', () => ({
  ComposerToolbarProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/agent/AgentModelPanel', () => ({ AgentModelPanel: () => null }));
vi.mock('@/components/agent/AgentModelTrigger', () => ({ AgentModelTrigger: () => null }));
vi.mock('@/components/codex/widget', () => ({
  ContextWindowWidget: () => null,
  ThroughputWidget: () => null,
  ThreadCostWidget: () => null,
}));
vi.mock('@/components/common', () => ({ FileMentionPopover: () => null }));
vi.mock('./editor/ComposerEditor', () => ({
  ComposerEditor: forwardRef(function ComposerEditorStub(
    props: { value: string; onChange: (v: string) => void },
    ref
  ) {
    useImperativeHandle(ref, () => ({ focus: () => {} }));
    return (
      <textarea
        aria-label="Message"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    );
  }),
}));

import { useCodexStore } from '@/components/codex/stores';
import { useWriterConflictStore } from '@/components/codex/stores/useWriterConflictStore';
import { useInputStore } from '@/stores/useInputStore';
import { Composer } from './Composer';

const setThread = (active: boolean) =>
  useCodexStore.setState({
    currentThreadId: 't1',
    currentTurnId: 'turn-1',
    threadStatusMap: { t1: active ? { type: 'active', activeFlags: [] } : { type: 'idle' } },
    turnTimingMap: {},
  });

describe('Composer while a turn runs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useThreadModels.setState({ confirmed: { t1: { modelProvider: 'fixture', model: 'test-model', reasoningEffort: 'medium' } }, pending: {}, errors: {} });
    useInputStore.setState({ inputValue: 'follow up' });
  });

  it('queues the message on the server and clears the input', async () => {
    setThread(true);
    threadQueueAdd.mockResolvedValue({ id: 'q1' });
    render(<Composer />);

    fireEvent.click(screen.getByRole('button', { name: 'Queue message' }));

    await waitFor(() => expect(threadQueueAdd).toHaveBeenCalledWith('t1', 'follow up', []));
    await waitFor(() => expect(useInputStore.getState().inputValue).toBe(''));
    expect(turnSteer).not.toHaveBeenCalled();
  });

  it('keeps the draft when the server rejects the queued message', async () => {
    setThread(true);
    threadQueueAdd.mockRejectedValue(new Error('queue unavailable'));
    render(<Composer />);

    fireEvent.click(screen.getByRole('button', { name: 'Queue message' }));

    await waitFor(() => expect(threadQueueAdd).toHaveBeenCalled());
    expect(useInputStore.getState().inputValue).toBe('follow up');
  });

  it('offers no queue button while the thread is idle', () => {
    setThread(false);
    render(<Composer />);
    expect(screen.queryByRole('button', { name: 'Queue message' })).toBeNull();
  });
});

describe('Composer sending to an idle thread', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useInputStore.setState({ inputValue: 'hello' });
    useWriterConflictStore.setState({ locked: {}, handoff: null, recovering: false });
  });

  it('locks the thread and keeps the refused draft when another session owns it', async () => {
    setThread(false);
    turnStart.mockRejectedValue(
      new Error('thread-store conflict: thread t1 already has an active writer')
    );
    render(<Composer />);

    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() =>
      expect(useWriterConflictStore.getState().locked.t1).toEqual({
        draft: { text: 'hello', images: [] },
      })
    );
  });

  it('keeps the draft when the send fails for another reason', async () => {
    setThread(false);
    turnStart.mockRejectedValue(new Error('boom'));
    render(<Composer />);

    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(useInputStore.getState().inputValue).toBe('hello'));
    expect(useWriterConflictStore.getState().locked.t1).toBeUndefined();
  });
});

describe('Composer model confirmation guard',()=>{
  beforeEach(()=>{vi.clearAllMocks();setThread(false);useInputStore.setState({inputValue:'preserve draft'});useThreadModels.setState({confirmed:{t1:{modelProvider:'fixture',model:'model',reasoningEffort:'medium'}},pending:{},errors:{}});});
  it('keeps the draft and disables sending during a switch',()=>{
    useThreadModels.getState().begin('t1');render(<Composer/>);
    const send=screen.getByRole('button',{name:'Send message'});expect(send.hasAttribute('disabled')).toBe(true);
    fireEvent.submit(send.closest('form')!);expect(turnStart).not.toHaveBeenCalled();expect(useInputStore.getState().inputValue).toBe('preserve draft');
  });
  it('shows the failure and does not fall back to sending through the old model',()=>{
    useThreadModels.getState().fail('t1','Provider switch refused');render(<Composer/>);
    expect(screen.getByRole('alert').textContent).toContain('Provider switch refused');
    const send=screen.getByRole('button',{name:'Send message'});fireEvent.submit(send.closest('form')!);
    expect(turnStart).not.toHaveBeenCalled();expect(useInputStore.getState().inputValue).toBe('preserve draft');
  });
});

describe('Composer tool selection confirmation',()=>{
  beforeEach(()=>{vi.clearAllMocks();setThread(false);useInputStore.setState({inputValue:'keep this draft'});useThreadModels.setState({confirmed:{t1:{modelProvider:'fixture',model:'model',reasoningEffort:'none'}},pending:{},errors:{}});useSessionTools.setState({pending:{},errors:{},snapshots:{}});});
  it.each(['pending','failed'])('blocks a %s tool selection and preserves the draft',(kind)=>{
    if(kind==='pending')useSessionTools.getState().begin('t1');else useSessionTools.getState().fail('t1','Selection not saved');
    render(<Composer/>);const send=screen.getByRole('button',{name:'Send message'});
    expect(send.hasAttribute('disabled')).toBe(true);fireEvent.submit(send.closest('form')!);
    expect(turnStart).not.toHaveBeenCalled();expect(useInputStore.getState().inputValue).toBe('keep this draft');
  });
});
