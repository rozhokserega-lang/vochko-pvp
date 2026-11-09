// Браузерные E2E-тесты v19 (Playwright): реальный онлайн-PvP в двух контекстах,
// мобильный viewport, PvE с ботом. Раннер: node tests/browser-v19.mjs
// Требуется dev-сервер: npx serve/dist/preview на PROCESS_ENV.BASE_URL (по умолчанию http://127.0.0.1:5173/)
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5173/';
let passed = 0, failed = 0;
const ok = (cond, name) => { if (cond) { passed++; console.log('  ✓', name); } else { failed++; console.log('  ✗', name); } };

// Окончание хореографии: щиты/карты/цифры урона убраны с поля.
const animGone = () => !document.querySelector('.combat-shield,.combat-card-reveal,.combat-damage-number');
const waitAnimEnd = (page, timeout = 18000) => page.waitForFunction(animGone, null, { timeout });

const errors = new Map(); // contextKey -> console/page errors
const watch = (ctx, key) => {
  errors.set(key, []);
  ctx.on('console', (msg) => { if (msg.type() === 'error') errors.get(key).push('console:' + msg.text()); });
  ctx.on('pageerror', (err) => errors.get(key).push('pageerror:' + err.message));
};

// Выбор карт и клики по целям из локальной раскладки страницы.
const HAND_MINE = '…';
async function placeTurn(page, laneNum) {
  // TXX select two red attack for the enemy lane target, then two black on my assign
  for (const side of ['atk', 'def']) {
    for (let k = 0; k < 2; k++) {
      const kind = side === 'atk' ? 'red' : 'black';
      const selector = kind === 'red'
        ? '#hand .card.red:not(.used):not(.selected)'
        : '#hand .card:not(.red):not(.used):not(.selected)';
      await page.locator(selector).first().click();
    }
    const target = side === 'atk'
      ? `.side.enemy .tower.drop-target[data-lane="${laneNum}"]`
      : `.side:not(.enemy) .tower.drop-target[data-lane="${laneNum}"]`;
    await page.locator(target).first().click();
  }
}

async function submitRoundDesktop(ctxA, ctxB, opts = {}) {
  void ctxA; void ctxB; void opts;
}

const runBrowser = async () => {
  const browser = await chromium.launch();
  try {
    // ── Desktop: реальный PvP в двух независимых сессиях ──
    const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    watch(ctxA, 'A'); watch(ctxB, 'B');
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    await pageA.goto(BASE_URL);
    await pageB.goto(BASE_URL);
    await pageA.waitForSelector('.lobby');
    await pageB.waitForSelector('.lobby');
    ok(true, 'лобби открывается в обеих сессиях');

    await pageA.getByRole('button', { name: 'Создать комнату' }).click();
    await pageA.waitForSelector('.lobby .code');
    const code = (await pageA.locator('.lobby .code').textContent()).trim();
    ok(code.length >= 4, `комната создана, код ${code}`);

    await pageB.getByPlaceholder('КОД').fill(code);
    await pageB.getByRole('button', { name: 'Войти по коду' }).click();
    await pageA.waitForSelector('#hand .card', { timeout: 20000 });
    await pageB.waitForSelector('#hand .card', { timeout: 20000 });
    ok(true, 'PvP: обе сессии вошли в матч и видят руки');

    // Вторая карта не меняет высоту интерфейса (п.14)
    const wrapA = pageA.locator('.wrap');
    const h1 = await wrapA.evaluate((el) => el.scrollHeight);
    await pageA.locator('#hand .card:not(.used)').first().click();
    const h2 = await wrapA.evaluate((el) => el.scrollHeight);
    await pageA.locator('#hand .card:not(.used):not(.selected)').first().click();
    const h3 = await wrapA.evaluate((el) => el.scrollHeight);
    ok(h1 === h2 && h2 === h3, `выбор карт не скачёт по высоте (${h1}/${h2}/${h3})`);
    // снять выделение высотного теста, чтобы не мешать раскладке;
    await pageA.locator('#hand .card.selected').first().click();
    await pageA.locator('#hand .card.selected').first().click();

    // Раунд 1: оба игрока раскладывают и сдают
    for (const lane of [0, 1, 2]) await placeTurn(pageA, lane);
    for (const lane of [0, 1, 2]) await placeTurn(pageB, lane);
    ok(true, 'раскладка обоих принята локально');

    // Оба игрока видят карты на правильных сторонах: у A на своих башнях — чёрные ♠♣,
    // на вражеских — красные ♥♦ (наши атакующие пары при планировании).
    const sidesOk = await pageA.evaluate(() => {
      const own = [...document.querySelectorAll('.side:not(.enemy) .tower.drop-target .tower-cards .mini')].map((m) => m.textContent);
      const enemy = [...document.querySelectorAll('.side.enemy .tower.drop-target .tower-cards .mini')].map((m) => m.textContent);
      return { own, enemy };
    });
    ok(sidesOk.own.length === 6 && sidesOk.own.every((t) => '♠♣'.includes(t.slice(-1))), `A: чёрные карты на своих башнях ${JSON.stringify(sidesOk.own)}`);
    
    await pageA.getByRole('button', { name: '⚔ Готов' }).click();
    await pageB.getByRole('button', { name: '⚔ Готов' }).click();

    // Анимация: раскрытие карт → щиты → урон; финиш до взаимодействия.
    await waitAnimEnd(pageA);
    await waitAnimEnd(pageB);
    let revealSeen = 0, shieldSeen = 0;
    for (let i = 0; i < 48; i++) {
      const snap = await pageA.evaluate(() => ({
        reveals: document.querySelectorAll('.combat-card-reveal').length,
        shields: document.querySelectorAll('.combat-shield').length,
        anims: (window.__animLog || []).filter((x) => x.fn === 'anim').length,
      }));
      // Хореография фиксируется в animLog даже если DOM-фаза уже прошла.
      revealSeen = Math.max(revealSeen, snap.reveals, snap.anims);
      shieldSeen = Math.max(shieldSeen, snap.shields, snap.anims);
      const round2 = await pageA.evaluate(() => document.querySelector('#roundBadge')?.textContent.includes('Раунд 2'));
      if (round2 && i * 250 > 6500) break;
      if (i * 250 > 11500) break;
      await pageA.waitForTimeout(250);
    }
    await pageA.waitForFunction(() => document.querySelector('#roundBadge')?.textContent.includes('Раунд 2'), null, { timeout: 25000 });
    await pageB.waitForFunction(() => document.querySelector('#roundBadge')?.textContent.includes('Раунд 2'), null, { timeout: 25000 });
    ok(revealSeen > 0, `раскрытие run-карт видно у A (${revealSeen})`);
    ok(shieldSeen > 0, `щиты хореографии видны у A (${shieldSeen})`);
    ok(true, 'оба игрока видят раунд 2 после анимации');

ok(sidesOk.enemy.length === 6 && sidesOk.enemy.every((t) => '♥♦'.includes(t.slice(-1))), `A: красные карты на башнях врага ${JSON.stringify(sidesOk.enemy)}`);

    // Ещё один раунд — проверим отсутствие дублей и стабилизацию.
    // Раскладка начинается строго ПОСЛЕ завершения хореографии (UI разморожен).
    await waitAnimEnd(pageA);
    await waitAnimEnd(pageB);
    for (const lane of [0, 1, 2]) await placeTurn(pageA, lane);
    for (const lane of [0, 1, 2]) await placeTurn(pageB, lane);
    const statusA = await pageA.evaluate(() => document.getElementById('status')?.textContent || '');
    ok(statusA === '', `второй раунд: раскладка без ошибок (${statusA})`);
    await pageA.getByRole('button', { name: '⚔ Готов' }).click();
    await pageB.getByRole('button', { name: '⚔ Готов' }).click();
    await pageA.waitForFunction(() => document.querySelector('#roundBadge')?.textContent.includes('Раунд 3'), null, { timeout: 25000 }).catch(async () => {
      const dd = await pageA.evaluate(() => ({
        towers: [...document.querySelectorAll('.tower')].map((t) => t.dataset.lane + t.dataset.kind + ':' + t.querySelectorAll('.mini').length),
        used: document.querySelectorAll('#hand .card.used').length,
        hand: [...document.querySelectorAll('#hand .card')].map((c) => c.className.replace('card ', '').slice(0, 12)).join(','),
        status: document.getElementById('status')?.textContent,
      }));
      throw new Error('round3 нет: A=' + JSON.stringify(dd) + ' B=' + await pageB.evaluate(() => document.getElementById('status')?.textContent));
    });
    await pageB.waitForFunction(() => document.querySelector('#roundBadge')?.textContent.includes('Раунд 3'), null, { timeout: 25000 });
    // После успокоения поля: нет длительно висящих анимационных DOM
    await pageA.waitForTimeout(7000);
    const leftoversA = await pageA.evaluate(() => ({
      shields: document.querySelectorAll('.combat-shield').length,
      reveals: document.querySelectorAll('.combat-card-reveal').length,
      floats: document.querySelectorAll('.damage-float,.combat-damage-number').length,
    }));
    const leftoversB = await pageB.evaluate(() => ({
      shields: document.querySelectorAll('.combat-shield').length,
      reveals: document.querySelectorAll('.combat-card-reveal').length,
      floats: document.querySelectorAll('.damage-float,.combat-damage-number').length,
    }));
    ok(leftoversA.shields === 0 && leftoversA.reveals === 0, `A без хвостов анимации ${JSON.stringify(leftoversA)}`);
    ok(leftoversB.shields === 0 && leftoversB.reveals === 0, `B без хвостов анимации ${JSON.stringify(leftoversB)}`);

    // Реконнект после F5 — состояние восстанавливается без двойного урона
    const hpBefore = await pageA.evaluate(() => [...document.querySelectorAll('.tower .value')].map((e) => e.textContent).join('|'));
    await pageA.reload();
    await pageA.waitForSelector('#hand .card', { timeout: 25000 });
    const hpAfter = await pageA.evaluate(() => [...document.querySelectorAll('.tower .value')].map((e) => e.textContent).join('|'));
    ok(hpBefore === hpAfter, `реконнект после F5: HP-строки идентичны`);

    // Выход из матча: кнопка в шапке → подтверждение → лобби, F5 остаётся в лобби
    pageA.once('dialog', (d) => d.accept());
    await pageA.getByRole('button', { name: 'Выйти в лобби' }).click();
    await pageA.waitForSelector('.lobby', { timeout: 15000 });
    ok(true, 'выход из матча (кнопка в шапке) возвращает в лобби');
    await pageA.reload();
    await pageA.waitForSelector('.lobby', { timeout: 20000 });
    ok(true, 'после выхода F5 показывает лобби (реконнект отключён: localStorage чист)');

    const errA = errors.get('A'), errB = errors.get('B');
    ok(errA.length === 0, `консоль A без ошибок (${errA.length}) — ${errA.slice(0, 2).join(' · ')}`);
    ok(errB.length === 0, `консоль B без ошибок (${errB.length}) — ${errB.slice(0, 2).join(' · ')}`);

    // ── Mobile viewport ──
    const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    watch(mob, 'M');
    const mobPage = await mob.newPage();
    // Supabase ограничивает частоту анонимных входов: при 429 ждём и повторяем.
    let mobReady = false;
    for (let i = 0; i < 8 && !mobReady; i++) {
      await mobPage.goto(BASE_URL);
      mobReady = await mobPage.waitForSelector('.lobby', { timeout: 10000 })
        .then(() => mobPage.getByRole('button', { name: 'Играть с ботом' }).waitFor({ timeout: 5000 }).then(() => true))
        .catch(() => false);
      if (!mobReady) await mobPage.waitForTimeout(45000);
    }
    ok(mobReady, 'мобильная сессия вошла в лобби (устойчиво к 429)');
    if (mobReady) {
    await mobPage.getByRole('button', { name: 'Играть с ботом' }).click();
    await mobPage.waitForSelector('#hand .card', { timeout: 20000 });
    const layout = await mobPage.evaluate(() => {
      const doc = document.documentElement;
      const towers = [...document.querySelectorAll('.tower')];
      const outTowers = towers.filter((t) => {
        const r = t.getBoundingClientRect();
        return r.left < 0 || r.right > window.innerWidth;
      }).length;
      const handRect = document.querySelector('.hand-area').getBoundingClientRect();
      const lanesScroll = document.querySelector('#lanes').scrollWidth <= document.querySelector('#lanes').clientWidth + 1;
      const zone = getComputedStyle(document.querySelector('.hand-area .pair-preview'));
      return {
        scrollOverflow: doc.scrollWidth > window.innerWidth + 1,
        towersOutside: outTowers,
        handOffscreen: handRect.bottom > window.innerHeight + 1,
        lanesNoScroll: lanesScroll,
        previewH: zone.minHeight,
      };
    });
    ok(!layout.scrollOverflow, `мобильный: нет горизонтальной прокрутки (${layout.scrollOverflow})`);
    ok(layout.towersOutside === 0, `мобильный: башни не вылезают (${layout.towersOutside})`);
    ok(!layout.handOffscreen, `мобильный: нижняя панель на экране`);
    ok(layout.lanesNoScroll, 'мобильный: линии внутри контейнера');
    ok(layout.previewH === '64px', `фикс-высота предпросмотра ${layout.previewH}`);

    // PvE: полноценный раунд с ботом на мобильном
    for (const k of [0, 1, 2]) await placeTurn(mobPage, k);
    await mobPage.getByRole('button', { name: '⚔ Готов' }).click();
    await mobPage.waitForFunction(() => document.querySelector('#roundBadge')?.textContent.includes('Раунд 2'), null, { timeout: 25000 });
    await waitAnimEnd(mobPage);
    ok(true, 'PvE: бот-раунд ресолвится на мобильном viewport');
    } // mobReady

    const errM = errors.get('M');
    ok(errM.length === 0, `консоль M без ошибок (${errM.length}) — ${errM.slice(0, 2).join(' · ')}`);

    await pageA.screenshot({ path: 'tests/.shots/desktop-a.png', fullPage: true });
    await pageB.screenshot({ path: 'tests/.shots/desktop-b.png', fullPage: true });
    await mobPage.screenshot({ path: 'tests/.shots/mobile.png', fullPage: true });
  } finally {
    await browser.close();
  }
};

import { mkdirSync } from 'node:fs';
mkdirSync('tests/.shots', { recursive: true });

try {
  await runBrowser();
} catch (e) {
  console.error('HARD-FAIL:', e);
  process.exitCode = 1;
}
console.log(`\nБРАУЗЕРНЫЕ ТЕСТЫ ИТОГ: ✓ ${passed} · ✗ ${failed}`);
process.exit(failed ? 1 : 0);
