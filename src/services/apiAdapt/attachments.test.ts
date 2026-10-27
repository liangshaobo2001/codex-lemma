import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/hooks/runtime',()=>({authHeaders:()=>({}),buildUrl:(path:string)=>`http://localhost${path}`}));
import { saveAttachment, MAX_ATTACHMENT_BYTES } from './attachments';
afterEach(()=>vi.unstubAllGlobals());
describe('attachment transfer',()=>{
  it('sends binary directly, preserves filename, and returns durable path',async()=>{
    const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({path:'D:/saved/image.png',name:'截图.png',kind:'image'})});vi.stubGlobal('fetch',fetch);
    const file=new File(['binary'],'截图.png',{type:'image/png'});
    expect((await saveAttachment(file)).path).toBe('D:/saved/image.png');
    expect(fetch).toHaveBeenCalledWith('http://localhost/api/attachments?name=%E6%88%AA%E5%9B%BE.png',expect.objectContaining({body:file,method:'POST'}));
  });
  it('rejects oversized files before upload and shows structured server errors',async()=>{
    const fetch=vi.fn().mockResolvedValue({ok:false,status:400,json:async()=>({error:'Disk full'})});vi.stubGlobal('fetch',fetch);
    const file=new File(['a'],'a');Object.defineProperty(file,'size',{value:MAX_ATTACHMENT_BYTES+1});
    await expect(saveAttachment(file)).rejects.toThrow('32 MiB');expect(fetch).not.toHaveBeenCalled();
    await expect(saveAttachment(new File(['a'],'b'))).rejects.toThrow('Disk full');
  });
});
