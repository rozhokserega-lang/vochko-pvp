// Real client + real Edge handlers, with in-memory SQL and simulated broadcast.
// No requests reach the hosted Supabase project.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { serverFixture } from './server-fixture.mjs';

const server = await createServer({ base: '/', server: { host: '127.0.0.1', port: 5184, strictPort: true } });
await server.listen();
const browser = await chromium.launch(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {});
const f = serverFixture(), errors = [], submissions = [];
try {
  const pages = [];
  for (const seat of [1, 2]) {
    const ctx = await browser.newContext({ viewport: seat === 1 ? { width: 1440, height: 1000 } : { width: 390, height: 844 }, isMobile: seat === 2, hasTouch: seat === 2 });
    await ctx.route('**/src/lib/supabase.js', route => route.fulfill({ contentType: 'application/javascript', body: `export async function ensureSession(){return {access_token:'fixture'}}; export function supabase(){return {auth:{getSession:async()=>({data:{session:{access_token:'fixture'}}})}}}` }));
    await ctx.route('**/src/lib/realtime.js', route => route.fulfill({ contentType: 'application/javascript', body: `export function watchMatch(id,cb){window.__fixtureBroadcast=cb;return ()=>{delete window.__fixtureBroadcast}}` }));
    await ctx.route('**/functions/v1/*', async route => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1);
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
      const body = route.request().postDataJSON();
      if (name === 'submit-turn') submissions.push({ seat, body });
      const result = await f.call(name, seat, body);
      await route.fulfill({ status: result.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(result.body) });
    });
    const page = await ctx.newPage(); pages.push(page);
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => localStorage.setItem('vochko_match', 'fixture'));
    await page.goto('http://127.0.0.1:5184/');
    await page.locator('#hand .card').first().waitFor();
    assert.equal(await page.locator('#hand .panel-cards').count(), 1);
    assert.equal(await page.locator('#hand [data-zone="cards"] .card').count(), 14);
    const originalOrder = await page.locator('#hand .card').evaluateAll(cards => cards.map(c => c.dataset.card));
    assert.notDeepEqual(originalOrder, f.match.state.hands[seat].map(c => c.id));
    assert.equal(await page.locator('.panel-art').evaluate(img => new URL(img.src).pathname.includes('panel-unified.png')), true);
    assert.equal(await page.locator('#hand').evaluate(hand =>
      Number(getComputedStyle(hand.querySelector('.panel-art')).zIndex) > Number(getComputedStyle(hand.querySelector('.panel-sphere')).zIndex)), true);
    assert.equal(await page.locator('#fortifyBtn').count(), 0);
    assert.equal(await page.locator('#pairsDetails,#battleReports,#clearBtn,#pairPreview').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), true);
    // Арена 1600×760 (обрезка арта): на 390px сцена ≈170px высотой.
    assert.ok(await page.locator('#arenaScene').evaluate(el => el.getBoundingClientRect().height > 150));
    const previews = await page.evaluate(async () => {
      const { renderPanelPreview } = await import('/src/ui/card-panel/CardPanel.js');
      const { ELEMENTS, pairStats } = await import('/shared/elements.js');
      const { deck } = await import('/shared/cards.js');
      const hand = document.querySelector('#hand');
      return Object.values(ELEMENTS).map(e => {
        const pair = [e.suits[0], e.suits[1]].map((s,i) => deck().find(c => c.s === s && c.r === ['5','9'][i]));
        renderPanelPreview(hand,pair);
        const p = pairStats(pair);
        const d=hand.querySelector('.pair-defense').getBoundingClientRect(),n=hand.querySelector('.pair-element').getBoundingClientRect(),a=hand.querySelector('.pair-attack').getBoundingClientRect();
        const pocket=hand.querySelector('#panelPower').getBoundingClientRect(),tray=hand.querySelector('.panel-cards').getBoundingClientRect();
        return { id:e.id, valid:hand.querySelector('#panelPower').textContent === `🛡 ${p.defense} ${e.name} ⚔ ${p.attack}` && hand.querySelector('#panelEffect [data-effect]')?.dataset.effect === e.id && d.right <= n.left && n.right <= a.left && pocket.top >= tray.bottom - 1 };
      });
    });
    assert.equal(previews.length, 10); assert.ok(previews.every(p => p.valid));
    // Каждая пара — две любые неиспользованные карты (раздача случайна, цвета
    // не сбалансированы); обе роли работают с любой парой мастей.
    for (let lane = 0; lane < 3; lane++) for (const kind of ['atk', 'def']) {
      await page.locator('#hand .card:not(.used):not(.selected)').first().click();
      await page.locator('#hand .card:not(.used):not(.selected)').first().click();
      assert.match(await page.locator('#panelPower').innerText(), /🛡.*⚔/s);
      if (lane === 0 && kind === 'atk') {
        await mkdir('tests/.shots', { recursive: true });
        await page.locator('#hand').screenshot({ path: `tests/.shots/unified-preview-${seat}.png` });
      }
      if (seat === 1 && lane === 0 && kind === 'atk') {
        await page.locator('#hand .card.selected').first().dragTo(page.locator('.tower.drop-target[data-lane="0"][data-kind="atk"]'));
      } else await page.locator(`.tower.drop-target[data-lane="${lane}"][data-kind="${kind}"]`).click();
    }
    assert.equal(await page.locator('#hand .card.used').count(), 12);
    assert.deepEqual(await page.locator('#hand .card').evaluateAll(cards => cards.map(c => c.dataset.card)), originalOrder);
    assert.equal(await page.locator('#hand .card:not(.used)').count(), 2);
    // A used card cannot be selected again.
    await page.locator('#hand .card.used').first().dispatchEvent('click');
    assert.equal(await page.locator('#hand .card.selected').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await mkdir('tests/.shots', { recursive: true });
    await page.screenshot({ path: `tests/.shots/elements-${seat === 1 ? 'desktop' : 'mobile'}.png`, fullPage: true });
  }
  for (const page of pages) await page.evaluate(() => {
    window.__flights = [];
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (!node.matches?.('.attack-projectile')) continue;
        window.__flights.push({ attacker: node.dataset.attacker, time: performance.now(),
          dx: parseFloat(node.style.getPropertyValue('--flight-x')),
          dy: parseFloat(node.style.getPropertyValue('--flight-y')) });
      }
    }).observe(document.body, {childList:true});
  });
  await pages[0].locator('#fightBtn').click();
  await pages[0].waitForFunction(() => document.querySelector('#status')?.textContent.includes('Ход отправлен'));
  assert.equal(f.reports.length, 0);
  await pages[1].locator('#fightBtn').click();
  await pages[1].waitForFunction(() => window.__animLog?.some(e => e.fn === 'anim'));
  await pages[0].evaluate(() => window.__fixtureBroadcast());
  await Promise.all(pages.map(async page => {
    await page.waitForFunction(() => document.querySelectorAll('.combat-card-reveal').length === 6);
    assert.equal(await page.locator('.combat-reveal-card').count(), 12);
  }));
  await pages[0].screenshot({ path: 'tests/.shots/elements-combat.png', fullPage: true });
  for (const page of pages) {
    await page.waitForFunction(() => window.__animLog?.some(e => e.fn === 'anim') && !document.querySelector('.combat-card-reveal,.combat-shield') && !document.querySelector('#fightBtn')?.disabled, null, { timeout: 12000 });
    assert.equal(await page.locator('.report-btn').count(), 0);
    assert.equal(await page.locator('#hand .card').count(), 14);
    assert.match(await page.locator('#roundBadge').innerText(), /2/);
    const flights = await page.evaluate(() => window.__flights);
    assert.equal(flights.length, 6, 'three own spells, then three enemy spells');
    assert.deepEqual(flights.map(f => f.attacker), ['me','me','me','opponent','opponent','opponent']);
    assert.ok(flights.slice(0, 3).every(f => f.dy < 0 && f.dx === 0), 'own spells fly upward');
    assert.ok(flights.slice(3).every(f => f.dy > 0 && f.dx === 0), 'enemy spells fly downward');
    assert.ok(flights[3].time - flights[2].time >= 2000, 'sides do not attack together');
  }
  assert.equal(submissions.length, 2);
  assert.ok(submissions.every(s => s.body.fortifyLane === null));
  assert.equal(f.reports.length, 1);
  // Nexus floors inherit their side from the fortress, not from the floor.
  for (const page of pages) {
    const nexusFlights = await page.evaluate(async () => {
      const { launchAttackCharge } = await import('/src/ui/arena/AttackCharge.js');
      const { cancelCombat } = await import('/src/ui/animations.js');
      for (const side of ['enemy', 'ally']) launchAttackCharge(document.querySelector(`.nexus-fortress.${side} .nexus-floor`), '🔥', 10);
      const flights = [...document.querySelectorAll('.attack-projectile')].map(el => ({
        attacker: el.dataset.attacker, dy: parseFloat(el.style.getPropertyValue('--flight-y')),
      }));
      cancelCombat();
      return { flights, remaining: document.querySelectorAll('.attack-projectile,.attack-impact-flash').length };
    });
    assert.deepEqual(nexusFlights.flights.map(f => f.attacker), ['me', 'opponent']);
    assert.ok(nexusFlights.flights[0].dy < 0 && nexusFlights.flights[1].dy > 0);
    assert.equal(nexusFlights.remaining, 0);
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.evaluate(async () => {
      const { launchAttackCharge } = await import('/src/ui/arena/AttackCharge.js');
      const { cancelCombat } = await import('/src/ui/animations.js');
      launchAttackCharge(document.querySelector('.nexus-fortress.enemy .nexus-floor'), '🔥', 10);
      const count = document.querySelectorAll('.attack-projectile').length;
      cancelCombat();
      return count;
    }), 0);
  }
  await pages[1].setViewportSize({ width: 844, height: 390 });
  assert.equal(await pages[1].locator('#hand').isVisible(), true);
  assert.equal(await pages[1].evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), true);
  assert.equal(await pages[1].evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await pages[1].screenshot({ path: 'tests/.shots/elements-landscape.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: desktop + mobile mixed pairs, explanations, 12/14 cards, no duplicates/fortify, real handlers, two-player reveal/report, no overflow or JS errors');
} finally { await browser.close(); await server.close(); }
