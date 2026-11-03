const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const output = process.env.TOOLBAR_OUTPUT || require('node:os').tmpdir() + '/lemma-toolbar';
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--disable-gpu'] });
  const results = [];
  try {
    for (const lang of ['en', 'zh']) for (const long of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 1200, height: 600 } });
      const blocked = [], errors = [];
      await context.route('**/*', route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin === 'http://127.0.0.1:1441' && !url.pathname.startsWith('/api') && req.method() === 'GET') return route.continue();
        blocked.push(url.pathname); return route.abort();
      });
      await context.addInitScript(() => {
        const NativeWebSocket = window.WebSocket;
        window.WebSocket = class extends NativeWebSocket {
          constructor(url, protocols) {
            if (!String(url).includes('127.0.0.1:1441')) throw new Error('Fixture blocks production WebSocket');
            super(url, protocols);
          }
        };
      });
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`http://127.0.0.1:1441/tests/browser/composer-toolbar.html?lang=${lang}&long=${long ? 1 : ''}`, { waitUntil: 'networkidle' });
      await page.locator('[data-composer-toolbar]').waitFor();
      const settle = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const snapshot = () => page.evaluate(() => {
        const root = document.querySelector('[data-composer-toolbar]'), box = root.getBoundingClientRect();
        const visible = selector => [...root.querySelectorAll(selector)].every(el => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0);
        return {
          level: Number(root.dataset.toolbarLevel), width: box.width,
          required: [...root.children].reduce((sum, el) => sum + el.getBoundingClientRect().width, 0) + parseFloat(getComputedStyle(root).columnGap) * Number(getComputedStyle(document.body).zoom || 1),
          approval: visible('[data-toolbar-approval-label]'), metrics: visible('[data-toolbar-metric-label]'),
          model: visible('[data-toolbar-model-details]'), icon: visible('[data-toolbar-model-icon]'),
          buttonsFit: [...root.querySelectorAll('button')].every(el => {
            const b = el.getBoundingClientRect(); return b.left >= box.left - 1 && b.right <= box.right + 1 && b.height > 0;
          }),
          tooltips: [...root.querySelectorAll('[role=img][title]')].map(el => ({ title: el.title, aria: el.getAttribute('aria-label') })),
        };
      });
      for (const active of [false, true]) for (const zoom of [1, 1.25, 1.5]) {
        await page.evaluate(z => { document.body.style.zoom = z; }, zoom);
        if (active && zoom === 1) await page.getByRole('button', { name: 'Toggle active', exact: true }).click();
        const levels = new Set();
        for (const width of Array.from({ length: 43 }, (_, i) => 1200 - i * 20)) {
          await page.setViewportSize({ width, height: 600 }); await settle();
          const state = await snapshot(); levels.add(state.level);
          assert.equal(state.approval, state.level === 0);
          assert.equal(state.metrics, state.level < 2);
          assert.equal(state.model, state.level < 3);
          assert.equal(state.icon, state.level === 3);
          assert.ok(state.buttonsFit || (state.level === 3 && state.width < state.required), JSON.stringify({ lang, active, zoom, width, state }));
          assert.ok(state.tooltips.some(x => x.title.includes('80 tok/s') && x.aria === x.title));
          assert.ok(state.tooltips.some(x => x.title.includes('80.0%') && x.aria === x.title));
          results.push({ lang, long, active, zoom, viewport: width, ...state });
        }
        assert.deepEqual([...levels].sort(), [0, 1, 2, 3]);
        await page.getByRole('button', { name: active ? 'Stop' : 'Send', exact: true }).click();
        if (active) await page.getByRole('button', { name: 'Queue', exact: true }).click();
        await page.setViewportSize({ width: 1200, height: 600 }); await settle();
        assert.equal((await snapshot()).level, 0);
        await page.getByRole('button', { name: 'Toggle panels', exact: true }).click(); await settle();
        assert.ok((await snapshot()).buttonsFit);
        await page.getByRole('button', { name: 'Toggle panels', exact: true }).click(); await settle();
      }
      await page.evaluate(() => { document.body.style.zoom = '1'; });
      await page.setViewportSize({ width: 410, height: 600 }); await settle();
      await page.screenshot({ path: `${output}/${lang}-${long ? 'long' : 'normal'}-compact.png` });
      assert.deepEqual(errors, []);
      assert.deepEqual(blocked, []);
      await context.close();
    }
    fs.writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
    console.log(`${results.length} layout cases passed; ${output}`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
