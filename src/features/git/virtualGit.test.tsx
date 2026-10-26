import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { VirtualGitList } from './VirtualGitList';
import { buildFileTree, flattenFileTree } from './utils';
import { boundedDiff } from './boundedDiff';
import { readGitScroll } from './virtualState';
const itemKey = (item: {path:string}) => item.path;
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800);
  HTMLElement.prototype.scrollTo = function(options?: ScrollToOptions | number) {
    if(typeof options === 'object') { this.scrollTop = options.top ?? 0; this.dispatchEvent(new Event('scroll')); }
  };
});
afterEach(() => vi.restoreAllMocks());
describe('Git viewport', () => {
  it.each([0, 1000, 41569])('bounds mounted rows for %i files without truncating the data', n => {
    const items=Array.from({length:n},(_,i)=>({path:`file-${i}`}));
    const {container}=render(<VirtualGitList items={items} itemKey={itemKey} stateKey={`size-${n}`} rowHeight={30} label="files" renderItem={x=><button>{x.path}</button>}/>);
    expect(container.querySelectorAll('[data-git-row]').length).toBeLessThan(40);
    if(n) expect(screen.getByText('file-0')).toBeTruthy();
    if(n>1000) {
      const list=screen.getByRole('region');
      act(()=>{list.scrollTop=(n-20)*30;fireEvent.scroll(list);});
      expect(screen.getByText(`file-${n-1}`)).toBeTruthy();
      expect(container.querySelectorAll('[data-git-row]').length).toBeLessThan(40);
    }
  });
  it('binds actions to file identity after filtering and reordering',()=>{
    const hit=vi.fn(); const all=Array.from({length:40000},(_,i)=>({path:`file-${i}`}));
    const renderItem=(x:{path:string})=><button onClick={()=>hit(x.path)}>{x.path}</button>;
    const view=render(<VirtualGitList items={all} itemKey={itemKey} stateKey="identity" rowHeight={30} label="files" renderItem={renderItem}/>);
    view.rerender(<VirtualGitList items={[all[39999],all[5]]} itemKey={itemKey} stateKey="identity" rowHeight={30} label="files" renderItem={renderItem}/>);
    fireEvent.click(screen.getByText('file-39999'));expect(hit).toHaveBeenCalledWith('file-39999');
  });
  it('remembers scroll across unmount, without retaining components',()=>{
    const props={items:Array.from({length:1000},(_,i)=>({path:`f${i}`})),itemKey,stateKey:'restore',rowHeight:30,label:'files',renderItem:(x:{path:string})=><span>{x.path}</span>};
    const view=render(<VirtualGitList {...props}/>);
    act(()=>{const el=screen.getByRole('region');el.scrollTop=9000;fireEvent.scroll(el);});
    view.unmount();expect(readGitScroll('restore')).toBe(9000);
    render(<VirtualGitList {...props}/>);expect(screen.getByText('f300')).toBeTruthy();
  });
  it('flattens only expanded tree branches while retaining all file paths',()=>{
    const entries=Array.from({length:41569},(_,i)=>({path:`work/group-${Math.floor(i/100)}/file-${i}.txt`,index_status:'?',worktree_status:'?'}));
    const tree=buildFileTree(entries);
    expect(flattenFileTree(tree,new Set(['work']))).toHaveLength(1);
    expect(flattenFileTree(tree,new Set()).filter(r=>r.node.type==='file')).toHaveLength(41569);
  });
});
describe('bounded Git diff',()=>{
  it('retains exact small patches',()=>expect(boundedDiff('x','a\n','b\n')).toContain('-a\n+b'));
  it('refuses enormous sources and very long rendered patches',()=>{
    expect(boundedDiff('x','','a'.repeat(1100000))).toBeNull();
    expect(boundedDiff('x','','a\n'.repeat(20000))).toBeNull();
  });
});
