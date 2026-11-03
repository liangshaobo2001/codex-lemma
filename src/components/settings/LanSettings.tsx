import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { buildUrl, isDesktopTauri } from '@/hooks/runtime';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

export function LanSettings() {
  const { t } = useTranslation('settings');
  const [server, setServer] = useState<{ enabled: boolean; address: string | null } | null>(null);
  const enabled = server?.enabled === true;
  const address = server?.address || '';
  const [ip, setIp] = useState('');
  const [code, setCode] = useState('');
  const [expires, setExpires] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusError, setStatusError] = useState('');
  const revision = useRef(0);
  const mutating = useRef(false);
  async function request(action: string, body?: object) {
    const response = await fetch(buildUrl(`/api/lan/${action}`), {
      cache: 'no-store',
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.status === 204 ? null : response.json();
  }
  const refresh = useCallback(async () => {
    const current = ++revision.current;
    try {
      const response = await fetch(buildUrl('/api/lan/status'), { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();
      if (typeof result.enabled !== 'boolean' || (result.enabled && typeof result.address !== 'string')) throw new Error('Invalid LAN status response');
      if (current === revision.current) { setServer(result); setStatusError(''); }
      return result as { enabled: boolean; address: string | null };
    } catch (e) {
      if (current === revision.current) { setServer(null); setStatusError(String(e)); }
      throw e;
    }
  }, []);
  useEffect(() => {
    if (!isDesktopTauri()) return;
    const sync = () => { if (!mutating.current && document.visibilityState !== 'hidden') void refresh().catch(() => {}); };
    sync();
    const timer = setInterval(sync, 3000);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => { clearInterval(timer); window.removeEventListener('focus', sync); document.removeEventListener('visibilitychange', sync); revision.current++; };
  }, [refresh]);
  useEffect(() => { setCode(''); }, [server?.enabled, server?.address]);
  useEffect(() => { if (!code) return; const timer = setTimeout(() => setCode(''), Math.max(0, expires - Date.now())); return () => clearTimeout(timer); }, [code, expires]);
  async function run(fn: () => Promise<void>, expected?: { enabled: boolean; address?: string }) {
    mutating.current = true; revision.current++; setBusy(true); setError('');
    let failure = '';
    try { await fn(); } catch (e) { failure = String(e); }
    try {
      const actual = await refresh();
      if (failure && !(expected && actual.enabled === expected.enabled && (expected.address === undefined || actual.address === expected.address))) setError(failure);
    } catch { if (failure) setError(failure); }
    finally { mutating.current = false; setBusy(false); }
  }
  if (!isDesktopTauri()) return null;
  return <section className="space-y-3"><h3 className="text-sm font-medium px-1">{t('lan.title')}</h3>
    <Card><CardContent className="space-y-3 px-4">
      <div className="flex items-center justify-between gap-3"><span>{t(server === null ? (statusError ? 'lan.statusUnavailable' : 'lan.checking') : enabled ? 'lan.enabled' : 'lan.disabled')}</span>
        {server === null ? <Button variant="outline" disabled={busy} onClick={() => void refresh().catch(() => {})}>{t('lan.refresh')}</Button> : enabled ? <Button variant="outline" disabled={busy} onClick={() => void run(async () => { await request('stop', {}); setCode(''); }, { enabled: false })}>{t('lan.stop')}</Button> :
          <div className="flex gap-2"><Input aria-label={t('lan.addressLabel')} placeholder={t('lan.addressPlaceholder')} value={ip} onChange={e => setIp(e.target.value)} /><Button disabled={busy || !ip.trim()} onClick={() => void run(async () => { await request('start', { address: ip.trim() }); }, { enabled: true, address: `https://${ip.trim()}:7421` })}>{t('lan.start')}</Button></div>}
      </div>
      {enabled && <><p className="text-sm break-all">{address}</p><QRCodeSVG value={address} size={144} />
        <p className="text-xs text-muted-foreground">{t('lan.description')}</p>
        <Button variant="outline" onClick={() => void run(async () => { await openUrl(buildUrl('/api/lan/certificate')); })}>{t('lan.certificate')}</Button>
        <Button variant="outline" disabled={busy} onClick={() => void run(async () => { const result = await request('code', {}); setCode(result.code); setExpires(Date.now() + result.expiresIn * 1000); })}>{t('lan.generateCode')}</Button>
        {code && <div className="space-y-2"><Input aria-label={t('lan.codeLabel')} value={code} readOnly /><Button variant="outline" onClick={() => void navigator.clipboard.writeText(code)}>{t('lan.copyCode')}</Button></div>}
        <details className="text-xs text-muted-foreground"><summary>{t('lan.help')}</summary><p>{t('lan.helpText')}</p></details></>}
      {error && <p role="alert" className="text-sm">{error}</p>}
      {statusError && <p role="alert" className="text-sm">{statusError}</p>}
    </CardContent></Card></section>;
}
