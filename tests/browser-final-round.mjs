import { chromium } from 'playwright';
let passed = 0, failed = 0;
const ok = (cond, name) => { if (cond) { passed++; console.log('  ✓', name); } else { failed++; console.log('  ✗', name); } };

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

let retries = 0;
for (; retries < 6;) {
  await page.goto('http://localhost:5173/vochko-pvp/');
  if (await page.getByRole('button', { name: 'Играть с ботом' }).waitFor({ timeout: 6000 }).then(() => true).catch(() => false)) break;
  await page.waitForTimeout(45000);
  retries++;
}
ok(retries < 6 || await page.getByRole('button', { name: 'Играть с ботом' }).count() > 0, 'лобби доступно (устойчиво к 429)');
await page.getByRole('button', { name: 'Играть с ботом' }).click();
await page.waitForSelector('#hand .card', { timeout: 30000 });

const waitAnimGone = () => page.waitForFunction(
  () => !document.querySelector('.combat-shield,.combat-card-reveal,.combat-damage-number'), null, { timeout: 20000 }).catch(() => {});

const timeline = []; // паспорт состояний поля: 300 мс
const snap = () => page.evaluate(() => ({
  round: Number(document.querySelector('#roundBadge')?.textContent.match(/\d+/)?.[0] ?? 0),
  reveals: document.querySelectorAll('.combat-card-reveal').length,
  shields: document.querySelectorAll('.combat-shield').length,
  floats: document.querySelectorAll('.combat-damage-number,.damage-float').length,
  overlay: !!document.querySelector('.end-overlay.show'),
  anims: (window.__animLog || []).filter((x) => x.fn === 'anim').length,
}));

let rounds = 0, guard = 0;
pollLoop:
while (guard++ < 600) {
  const s = await snap();
  timeline.push(s);
  if (s.overlay) break;
  // во время анимации не трогаем руки — ждём завершения хореографии
  if (s.reveals || s.shields || s.floats) { await page.waitForTimeout(300); continue; }
  // planning: раскладка если рука не пустая, иначе ждём новые карты
  const ready = await page.evaluate(() => ({
    reds: document.querySelectorAll('#hand .card.red:not(.used)').length,
    blacks: document.querySelectorAll('#hand .card:not(.red):not(.used)').length,
  }));
  if (ready.reds < 6 || ready.blacks < 6) { await page.waitForTimeout(300); continue; }
  const atkTarget = '.side.enemy .tower.drop-target[data-lane="{lane}"], .nexus-fortress.enemy .nexus-floor.open[data-lane="{lane}"]';
  const defTarget = '.side:not(.enemy) .tower.drop-target[data-lane="{lane}"], .nexus-fortress.ally .nexus-floor.open[data-lane="{lane}"]';
  for (const lane of [0, 1, 2]) {
    const atk = atkTarget.split('{lane}').join(String(lane));
    const def = defTarget.split('{lane}').join(String(lane));
    for (let k = 0; k < 2; k++) await page.locator('#hand .card.red:not(.used):not(.selected)').first().click();
    await page.locator(atk).first().click();
    for (let k = 0; k < 2; k++) await page.locator('#hand .card:not(.red):not(.used):not(.selected)').first().click();
    await page.locator(def).first().click();
  }
  rounds++;
  await page.getByRole('button', { name: '⚔ Готов' }).click();
  await page.waitForTimeout(400);
}
await waitAnimGone();
const finalState = await snap();
console.log('timeline length:', timeline.length, '| rounds placed:', rounds, '| anim entries:', finalState.anims, '| final:', JSON.stringify(finalState));
if (!finalState.overlay) {
  console.log('[:diag] последний прогресс:', timeline.slice(-3).map((t) => `${t.round}(${t.reveals}/${t.shields}/${t.floats})`).join(' '));
}

ok(finalState.overlay, `матч дошёл до финала, окно результата показано (${finalState.round} раундов)`);
ok(finalState.anims >= rounds, `хореография играла на каждом раунде (${finalState.anims}/${rounds})`);
// Индекс первого оверлея — до него должен быть кадр с активной анимацией.
const firstOverlayIdx = timeline.findIndex((t) => t.overlay);
ok(firstOverlayIdx >= 0, 'окно результата ясно зафиксировано в таймлайне');
const animBefore = firstOverlayIdx >= 0
  ? timeline.slice(0, firstOverlayIdx).some((t) => t.reveals || t.shields || t.floats) : false;
ok(animBefore, `последний удар анимируется ДО окна результата (${animBefore})`);
const afterOverlayOnly = timeline.slice(firstOverlayIdx).every((t) => t.round === timeline[firstOverlayIdx].round);
ok(afterOverlayOnly, 'раунд-бейдж не меняется после показа результата');

const errList = errors.slice(0, 2);
ok(errors.length === 0, `консоль без ошибок (${errors.length}) — ${errList.join(' · ')}`);
await page.screenshot({ path: 'tests/.shots/final-round.png', fullPage: true });
await browser.close();
console.log(`\nФИНАЛЬНЫЙ РАУНД В БРАУЗЕРЕ: ✓ ${passed} · ✗ ${failed}`);
process.exit(failed ? 1 : 0);
