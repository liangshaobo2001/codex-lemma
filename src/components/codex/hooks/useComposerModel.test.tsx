import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { AgentModelTrigger } from '@/components/agent/AgentModelTrigger';
import { useCodexStore, useConfigStore } from '../stores';
import { useThreadModels } from '../stores/useThreadModels';
import '@/lib/i18n';

describe('composer model display',()=>{
 beforeEach(()=>{
  useConfigStore.getState().setModelSelection('openai','gpt-6-astra','medium');
  useCodexStore.setState({currentThreadId:'a'});
  useThreadModels.setState({confirmed:{a:{modelProvider:'openai',model:'gpt-6.1-sol',reasoningEffort:'low'},b:{modelProvider:'local',model:'qwen',reasoningEffort:'medium'}},pending:{},errors:{}});
 });
 it('shows the addressed session, independently of the global draft default',()=>{
  render(<AgentModelTrigger/>);expect(screen.getByRole('button').textContent).toContain('gpt-6.1-sol');
  expect(screen.queryByText('gpt-6-astra')).toBeNull();
 });
 it('switches between cached chats without carrying their model labels across',()=>{
  render(<AgentModelTrigger/>);
  act(()=>useCodexStore.setState({currentThreadId:'b'}));expect(screen.getByRole('button').textContent).toContain('qwen');
  act(()=>useCodexStore.setState({currentThreadId:'a'}));expect(screen.getByRole('button').textContent).toContain('gpt-6.1-sol');
 });
 it('does not present Astra as an unknown session model',()=>{
  useCodexStore.setState({currentThreadId:'unknown'});render(<AgentModelTrigger/>);
  expect(screen.queryByText('gpt-6-astra')).toBeNull();
 });
 it('shows pending state while a model switch is being verified',()=>{
  useThreadModels.getState().begin('a');render(<AgentModelTrigger/>);
  expect(screen.getByRole('button').getAttribute('aria-busy')).toBe('true');
  expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
 });
 it('uses the saved draft selection only for a new chat',()=>{
  useCodexStore.setState({currentThreadId:null});render(<AgentModelTrigger/>);
  expect(screen.getByRole('button').textContent).toContain('gpt-6-astra');
 });
});

it('labels an unset effort as Default instead of claiming reasoning is disabled',()=>{
 useCodexStore.setState({currentThreadId:'a'});useThreadModels.setState({confirmed:{a:{modelProvider:'openai',model:'gpt-6.1-sol',reasoningEffort:null}},pending:{},errors:{}});
 render(<AgentModelTrigger/>);expect(screen.getByRole('button').textContent).toContain('Default');
});
