import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({save:vi.fn(),read:vi.fn(),native:vi.fn(),error:vi.fn()}));
vi.mock('@/services/apiAdapt/attachments',()=>({saveAttachment:mocks.save,MAX_ATTACHMENT_BYTES:32*1024*1024}));
vi.mock('@/services/apiAdapt/clipboard',()=>({hasNativeFileClipboard:mocks.native,readClipboardFiles:mocks.read}));
vi.mock('sonner',()=>({toast:{error:mocks.error}}));
import { useComposerPaste, clipboardFiles } from './useComposerPaste';
function Harness({scope='one'}:{scope?:string}) {
  const [images,setImages]=useState<string[]>([]);const [files,setFiles]=useState<string[]>([]);const [text,setText]=useState('draft');
  const paste=useComposerPaste(scope,p=>setImages(a=>a.concat(p)),p=>setFiles(a=>a.concat(p)),p=>setText(t=>t+p));
  return <div onPasteCapture={paste.onPasteCapture} onKeyDownCapture={paste.onKeyDownCapture}>
    <textarea aria-label="Draft" value={text} onChange={e=>setText(e.target.value)}/>
    <button type="button" disabled={paste.pending}>Send</button>
    <output data-testid="images">{images.join('|')}</output><output data-testid="files">{files.join('|')}</output>
  </div>;
}
const data=(files:File[]=[],text='')=>({files,items:[],getData:(format:string)=>format==='text/plain'?text:''});
describe('composer clipboard',()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.native.mockReturnValue(false);});
  it('attaches screenshot and binary file without consuming mixed text',async()=>{
    mocks.save.mockImplementation(async (file:File)=>({path:`saved/${file.name}`,kind:file.type.startsWith('image/')?'image':'file'}));
    render(<Harness/>);
    fireEvent.paste(screen.getByLabelText('Draft'),{clipboardData:data([new File(['png'],'capture.png',{type:'image/png'}),new File(['pdf'],'report.pdf')],' extra')});
    await waitFor(()=>expect(screen.getByTestId('files').textContent).toBe('saved/report.pdf'));
    expect(screen.getByTestId('images').textContent).toBe('saved/capture.png');
    expect((screen.getByLabelText('Draft') as HTMLTextAreaElement).value).toBe('draft extra');
  });
  it('does not prevent plain text paste',()=>{
    render(<Harness/>);
    const event=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:data([],'text')});
    fireEvent(screen.getByLabelText('Draft'),event);
    expect(event.defaultPrevented).toBe(false);expect(mocks.save).not.toHaveBeenCalled();
  });
  it('blocks sending while saving, and does not attach to a different chat',async()=>{
    let resolve!:(value:unknown)=>void;mocks.save.mockReturnValue(new Promise(r=>resolve=r));
    const view=render(<Harness/>);fireEvent.paste(screen.getByLabelText('Draft'),{clipboardData:data([new File(['a'],'capture.png')])});
    expect(screen.getByRole('button',{name:'Send'}).hasAttribute('disabled')).toBe(true);
    view.rerender(<Harness scope="two"/>);
    await act(async()=>resolve({path:'saved/capture.png',kind:'image'}));
    expect(screen.getByTestId('images').textContent).toBe('');expect(screen.getByRole('button',{name:'Send'}).hasAttribute('disabled')).toBe(false);
  });
  it('uses Windows file clipboard for Explorer copy, without reading it on other keys',async()=>{
    mocks.native.mockReturnValue(true);mocks.read.mockResolvedValue(['D:/picture.PNG','D:/report.pdf']);render(<Harness/>);
    fireEvent.keyDown(screen.getByLabelText('Draft'),{key:'x',ctrlKey:true});expect(mocks.read).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText('Draft'),{key:'v',ctrlKey:true});
    await waitFor(()=>expect(screen.getByTestId('files').textContent).toBe('D:/report.pdf'));
    expect(screen.getByTestId('images').textContent).toBe('D:/picture.PNG');expect(mocks.save).not.toHaveBeenCalled();
  });
  it('does not duplicate a browser file event with the native fallback',async()=>{
    let resolve!:(value:unknown)=>void;mocks.native.mockReturnValue(true);mocks.read.mockReturnValue(new Promise(r=>resolve=r));
    mocks.save.mockResolvedValue({path:'saved/photo.png',kind:'image'});render(<Harness/>);
    fireEvent.keyDown(screen.getByLabelText('Draft'),{key:'v',ctrlKey:true});
    fireEvent.paste(screen.getByLabelText('Draft'),{clipboardData:data([new File(['a'],'photo.png')])});
    await act(async()=>resolve(['D:/photo.png']));
    expect(screen.getByTestId('images').textContent).toBe('saved/photo.png');
  });
  it('rejects oversized batches and reports upload failures without losing draft text',async()=>{
    render(<Harness/>);fireEvent.paste(screen.getByLabelText('Draft'),{clipboardData:data(Array.from({length:21},()=>new File(['a'],'a')))});
    expect(mocks.save).not.toHaveBeenCalled();expect(mocks.error).toHaveBeenCalled();
    mocks.save.mockRejectedValue(new Error('Disk full'));fireEvent.paste(screen.getByLabelText('Draft'),{clipboardData:data([new File(['a'],'a')])});
    await waitFor(()=>expect(mocks.error).toHaveBeenCalledWith('Disk full'));
    expect((screen.getByLabelText('Draft') as HTMLTextAreaElement).value).toBe('draft');
  });
  it('accepts clipboard items fallback and never duplicates files/items',()=>{
    const file=new File(['a'],'a');const item={kind:'file',getAsFile:()=>file};
    expect(clipboardFiles({files:[file],items:[item]} as unknown as DataTransfer)).toEqual([file]);
    expect(clipboardFiles({files:[],items:[item]} as unknown as DataTransfer)).toEqual([file]);
  });
});
