import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serverFixture } from './server-fixture.mjs';
import { deck } from '../shared/cards.js';

const server = await createServer({ base: '/', server: { host: '127.0.0.1', port: 5187, strictPort: true } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome' });
  for (const width of [1440, 390]) {
    const f = serverFixture();
    for (const side of ['a','b']) { f.match.state.board[side].outer.fill(0); f.match.state.board[side].inner.fill(0); }
    f.match.state.hands[1] = deck().filter(c => ['♥','♣'].includes(c.s) && Number(c.r) >= 2 && Number(c.r) <= 8);
    const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
    const errors = [];
    await ctx.route('**/src/lib/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: `export async function ensureSession(){};export function supabase(){return {auth:{getSession:async()=>({data:{session:{access_token:'fixture'}}})}}}` }));
    await ctx.route('**/src/lib/realtime.js', r => r.fulfill({ contentType: 'application/javascript', body: 'export function watchMatch(){return ()=>{}}' }));
    await ctx.route('**/functions/v1/*', async r => {
      const name = new URL(r.request().url()).pathname.split('/').at(-1);
      if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin':'*','access-control-allow-headers':'*' } });
      const result = await f.call(name,1,r.request().postDataJSON());
      await r.fulfill({ status:result.status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(result.body) });
    });
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
    await p.addInitScript(() => localStorage.setItem('vochko_match','fixture'));
    await p.goto('http://127.0.0.1:5187/');
    await p.locator('#hand .card').first().waitFor();
    for (const lane of [0,1,2]) for (const kind of ['def','atk']) {
      await p.locator('#hand .card.red:not(.used)').first().click();
      await p.locator('#hand .card:not(.red):not(.used)').first().click();
      await p.waitForFunction(() => {
        const img=document.querySelector('#panelEffect img');return img?.complete && img.naturalWidth===414;
      });
      await p.locator(`.nexus-floor.open[data-lane="${lane}"][data-kind="${kind}"]`).click();
    }
    assert.equal(await p.locator('.nexus-floor .slot-card').count(),12);
    await p.waitForFunction(() => [...document.querySelectorAll('.slot-card')].every(c => c.getAnimations().every(a => a.playState === 'finished')));
    const cards = await p.locator('.nexus-floor .slot-card').evaluateAll(nodes => nodes.map(c => ({
      text:c.textContent, height:c.clientHeight,
      rank:parseFloat(getComputedStyle(c.querySelector('.rank')).fontSize),
      suit:parseFloat(getComputedStyle(c.querySelector('.suit')).fontSize),
      rankHeight:c.querySelector('.rank').getBoundingClientRect().height,
    })));
    assert.ok(cards.every(c => c.rank >= c.height*.45 && c.suit >= c.height*.3 && c.rankHeight>0),JSON.stringify(cards));
    const effects = p.locator('.nexus-floor [data-effect="fire_vortex"]');
    assert.equal(await effects.count(),6);
    assert.ok((await effects.evaluateAll(imgs => imgs.map(img => img.src))).every(src => src.includes('elFireVortex.gif')));
    await p.waitForFunction(() => [...document.querySelectorAll('.nexus-floor .element-anim')].every(img => img.complete && img.naturalWidth===414));
    await mkdir('tests/.shots',{recursive:true});
    await p.locator('.nexus.ally').screenshot({path:`tests/.shots/nexus-cards-${width}.png`});
    assert.deepEqual(errors,[]);
    console.log(`PASS ${width}px: 12 visible Nexus cards across all floors/sides, supplied fire vortex GIF in all six circles and panel`);
    await ctx.close();
  }
} finally { await browser?.close(); await server.close(); }
