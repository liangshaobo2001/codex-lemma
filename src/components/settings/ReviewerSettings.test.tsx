import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const api=vi.hoisted(() => ({ read:vi.fn(), save:vi.fn() }));
vi.mock('react-i18next', () => ({useTranslation:()=>({t:(key:string)=>key})}));
vi.mock('@/components/codex/hooks/useModels',()=>({useModels:()=>({configProviders:[{name:'main'},{name:'review'}],storedModels:{review:[{id:'cheap',name:'Cheap'}]}})}));
vi.mock('@/services/apiAdapt/reviewer',()=>({getReviewerSettings:api.read,saveReviewerSettings:api.save}));
import { ReviewerSettings } from './ReviewerSettings';
const initial={independent:true,provider:'review',model:'cheap',contextWindow:32768,effort:'low'};
beforeEach(()=>{vi.clearAllMocks();api.read.mockResolvedValue({saved:initial,active:initial,restartRequired:false,routingReady:true,error:null});});
it('does not save on mount and distinguishes saved settings from the active process',async()=>{
 render(<ReviewerSettings/>);await screen.findByLabelText('reviewer.context');expect(api.save).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('reviewer.context'),{target:{value:'65536'}});
 api.save.mockResolvedValue({saved:{...initial,contextWindow:65536},active:initial,restartRequired:true,routingReady:true,error:null});
 fireEvent.click(screen.getByRole('button',{name:'reviewer.save'}));
 await waitFor(()=>expect(api.save).toHaveBeenCalledWith({...initial,contextWindow:65536}));
 await screen.findByText('reviewer.restartRequired');
 expect(screen.getByRole('status').textContent).toContain('32,768');
});
it('does not present failed reviewer setup as an active model',async()=>{
 api.read.mockResolvedValue({saved:initial,active:initial,restartRequired:false,routingReady:false,error:'Reviewer unavailable'});
 render(<ReviewerSettings/>);await screen.findByRole('alert');
 expect(screen.getByRole('status').textContent).toContain('reviewer.unavailable');
 expect(screen.getByRole('status').textContent).not.toContain('review / cheap');
});
it('retains an actionable error and does not claim a failed save succeeded',async()=>{
 api.save.mockRejectedValue('Unsupported authentication');render(<ReviewerSettings/>);
 await screen.findByLabelText('reviewer.context');fireEvent.click(screen.getByRole('button',{name:'reviewer.save'}));
 await screen.findByRole('alert');expect(screen.queryByText('reviewer.restartRequired')).toBeNull();
});
