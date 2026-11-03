const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--disable-gpu'] });
  const evidence = [];
  try {
    for (const width of [360, 640, 1000]) {
      const context = await browser.newContext({ viewport: { width, height: 600 } });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        return url.origin === 'http://127.0.0.1:1441' && !url.pathname.startsWith('/api') && route.request().method() === 'GET'
          ? route.continue() : route.abort();
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto('http://127.0.0.1:1441/tests/browser/reasoning-stream.html', { waitUntil: 'networkidle' });
      const row = page.getByRole('button', { name: 'Thinking', exact: true });
      const before = await row.boundingBox();
      for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Delta', exact: true }).click();
      assert.equal(await row.getAttribute('aria-expanded'), 'false');
      const during = await row.boundingBox();
      assert.equal(during.height, before.height);
      const tail = await page.locator('[data-reasoning-preview]').evaluate(el => ({
        text: el.textContent, height: el.getBoundingClientRect().height,
        lineHeight: parseFloat(getComputedStyle(el).lineHeight), end: Math.abs(el.scrollWidth - el.clientWidth - el.scrollLeft) < 2,
      }));
      assert.ok(tail.text.endsWith('LATEST_TOKEN'));
      assert.ok(tail.height <= tail.lineHeight + 1);
      assert.ok(tail.end);
      await row.click();
      assert.equal(await row.getAttribute('aria-expanded'), 'true');
      await row.click();
      await page.getByRole('button', { name: 'Next step', exact: true }).click();
      const finished = page.getByRole('button', { name: 'Thought for 3s', exact: true });
      assert.equal(await finished.getAttribute('aria-expanded'), 'false');
      const after = await finished.boundingBox();
      assert.equal(after.height, before.height);
      assert.equal(after.y, before.y);
      assert.deepEqual(errors, []);
      evidence.push({ width, before, during, after, tail });
      if (process.env.REASONING_OUTPUT) await page.screenshot({ path: `${process.env.REASONING_OUTPUT}-${width}.png` });
      await context.close();
    }
    if (process.env.REASONING_OUTPUT) fs.writeFileSync(process.env.REASONING_OUTPUT + '.json', JSON.stringify(evidence, null, 2));
    console.log('Streaming reasoning stays single-line and collapsed at 360/640/1000px; tail follows updates and next-step transition preserves row height.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
