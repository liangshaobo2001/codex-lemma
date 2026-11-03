import { act, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, expect, it, vi } from 'vitest';
import { en } from '@/locales/en';
import { zh } from '@/locales/zh';
vi.mock('@/hooks/runtime', () => ({ isDesktopTauri: () => true, buildUrl: (path: string) => path }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));
import { LanSettings } from './LanSettings';
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('follows the UI language in all enabled controls and switches live without Chinese text leaking into English', async () => {
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,status:200,json:async()=>({enabled:true,address:'https://192.168.1.10:7421'})})));
  const i18n=createInstance();
  await i18n.use(initReactI18next).init({lng:'en',fallbackLng:'en',resources:{en:{settings:en.settings},zh:{settings:zh.settings}},interpolation:{escapeValue:false}});
  const view=render(<I18nextProvider i18n={i18n}><LanSettings /></I18nextProvider>);
  await screen.findByRole('button',{name:'Download phone certificate'});
  expect(screen.getByRole('heading',{name:'Phone · LAN access'})).toBeTruthy();
  expect(screen.getByRole('button',{name:'Generate a two-minute pairing code'})).toBeTruthy();
  expect(view.container.textContent).not.toMatch(/[\u3400-\u9fff]/);
  await act(async()=>{await i18n.changeLanguage('zh');});
  expect(screen.getByRole('heading',{name:'手机 · 局域网连接'})).toBeTruthy();
  expect(screen.getByRole('button',{name:'下载手机所需证书'})).toBeTruthy();
});

it('translates the disabled panel, address field and enable button', async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,status:200,json:async()=>({enabled:false,address:null})})));
  const i18n=createInstance();
  await i18n.use(initReactI18next).init({lng:'en',fallbackLng:'en',resources:{en:{settings:en.settings}},interpolation:{escapeValue:false}});
  render(<I18nextProvider i18n={i18n}><LanSettings /></I18nextProvider>);
  expect(await screen.findByRole('button',{name:'Enable'})).toBeTruthy();
  expect(screen.getByLabelText("This computer's LAN IPv4 address")).toBeTruthy();
  expect(screen.getByText('Disabled')).toBeTruthy();
});

async function mountPanel() {
  const i18n=createInstance();
  await i18n.use(initReactI18next).init({lng:'en',fallbackLng:'en',resources:{en:{settings:en.settings}},interpolation:{escapeValue:false}});
  return render(<I18nextProvider i18n={i18n}><LanSettings /></I18nextProvider>);
}
const reply=(enabled:boolean)=>({ok:true,status:200,json:async()=>({enabled,address:enabled?'https://192.168.1.10:7421':null})});

it('keeps status unknown until a response arrives and resynchronizes an out-of-band enable on focus and disable on polling',async()=>{
  vi.useFakeTimers({toFake:['setInterval','clearInterval']});
  let resolveInitial!:(value:ReturnType<typeof reply>)=>void;
  const network=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{resolveInitial=resolve})).mockResolvedValue(reply(true));
  vi.stubGlobal('fetch',network);
  await mountPanel();
  expect(screen.getByText('Checking status…')).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Enable'})).toBeNull();
  await act(async()=>{resolveInitial(reply(false));});
  await screen.findByRole('button',{name:'Enable'});
  await act(async()=>{window.dispatchEvent(new Event('focus'));});
  await screen.findByRole('button',{name:'Generate a two-minute pairing code'});
  network.mockResolvedValue(reply(false));
  await act(async()=>{await vi.advanceTimersByTimeAsync(3000);});
  await screen.findByRole('button',{name:'Enable'});
  expect(screen.queryByRole('button',{name:'Generate a two-minute pairing code'})).toBeNull();
});

it('reconciles an already-enabled error and ignores an older in-flight Disabled response',async()=>{
  let resolveStale!:(value:ReturnType<typeof reply>)=>void;
  let reads=0;
  vi.stubGlobal('fetch',vi.fn(async(path:string)=>{
    if(path.endsWith('/start'))return {ok:false,status:409,text:async()=> 'LAN access is already enabled'};
    reads++;
    if(reads===1)return reply(false);
    if(reads===2)return new Promise(resolve=>{resolveStale=resolve});
    return reply(true);
  }));
  await mountPanel();await screen.findByRole('button',{name:'Enable'});
  await act(async()=>{window.dispatchEvent(new Event('focus'));});
  fireEvent.change(screen.getByLabelText("This computer's LAN IPv4 address"),{target:{value:'192.168.1.10'}});
  fireEvent.click(screen.getByRole('button',{name:'Enable'}));
  await screen.findByRole('button',{name:'Generate a two-minute pairing code'});
  expect(screen.queryByRole('alert')).toBeNull();
  await act(async()=>{resolveStale(reply(false));});
  expect(screen.getByText('Enabled')).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Enable'})).toBeNull();
});

it('does not report Disabled when status cannot be read',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>{throw Error('Connection unavailable')}));
  await mountPanel();
  await screen.findByText('Status unavailable');
  expect(screen.queryByText('Disabled')).toBeNull();
  expect(screen.queryByRole('button',{name:'Enable'})).toBeNull();
  expect(screen.getByRole('button',{name:'Refresh status'})).toBeTruthy();
});
