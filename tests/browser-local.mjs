import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { startLocalGame } from '../scripts/dev-local.mjs';

const server = await startLocalGame(5186);
let browser;
try {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome' });
  const errors = [], remote = [];
  async function page() {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(e.message));
    p.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith('http://127.0.0.1:5186/')) remote.push(r.url()); });
    await p.goto('http://127.0.0.1:5186/');
    return p;
  }
  async function place(p) {
    await p.locator('#hand .card').first().waitFor();
    for (let lane = 0; lane < 3; lane++) for (const kind of ['atk', 'def']) {
      await p.locator('#hand .card.red:not(.used)').first().click();
      await p.locator('#hand .card:not(.red):not(.used)').first().click();
      await p.locator(`.pair-target[data-lane="${lane}"][data-kind="${kind}"]`).click();
    }
    assert.equal(await p.locator('#hand .card.used').count(), 12);
    await p.locator('#fightBtn').click();
  }
  const bot = await page();
  await bot.locator('[data-act="bot"]').click();
  await place(bot);
  await bot.waitForFunction(() => document.querySelector('#roundBadge')?.textContent.includes('2'));
  await bot.waitForFunction(() => window.__animLog?.some(e => e.fn === 'anim') && !document.querySelector('.combat-card-reveal,.combat-shield'));
  assert.equal(await bot.locator('.report-btn').count(), 3);
  const a = await page(), b = await page();
  await a.locator('[data-act="create"]').click();
  await a.locator('.code').waitFor();
  const code = await a.locator('.code').innerText();
  await b.locator('#roomInput').fill(code);
  await b.locator('[data-act="join"]').click();
  await place(a); await place(b);
  await Promise.all([a, b].map(p => p.waitForFunction(() => window.__animLog?.some(e => e.fn === 'anim') && !document.querySelector('.combat-card-reveal,.combat-shield'))));
  for (const p of [a, b]) assert.equal(await p.locator('.report-btn').count(), 3);
  await a.reload(); await a.locator('#hand .card').first().waitFor();
  assert.match(await a.locator('#roundBadge').innerText(), /2/);
  assert.deepEqual(errors, []); assert.deepEqual(remote, []);
  console.log('PASS local launcher: bot round, two-browser PvP room/join/round/synchronization, reconnect, no external requests or JavaScript errors');
} finally { await browser?.close(); await server.close(); }
