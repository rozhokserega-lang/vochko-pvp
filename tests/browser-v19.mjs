// Браузерные E2E-тесты v19 (Playwright): реальный онлайн-PvP в двух контекстах,
// мобильный viewport, PvE с ботом. Раннер: node tests/browser-v19.mjs
// Требуется dev-сервер: npx serve/dist/preview на PROCESS_ENV.BASE_URL (по умолчанию http://127.0.0.1:5173/)
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5173/vochko-pvp/';
let passed = 0, failed = 0;
const ok = (cond, name) => { if (cond) { passed++; console.log('  ✓', name); } else { failed++; console.log('  ✗', name); } };

// Окончание хореографии: щиты/карты/цифры урона убраны с поля.
const animGone = () => !document.querySelector('.combat-shield,.combat-card-reveal,.combat-damage-number');
const waitAnimEnd = (page, timeout = 18000) => page.waitForFunction(animGone, null, { timeout });

const errors = new Map(); // contextKey -> console/page errors
const watch = (ctx, key) => {
  errors.set(key, []);
  ctx.on('console', (msg) => {
    const url = msg.location().url;
    const expected = url.endsWith('/favicon.ico') || (key === 'A' && url.endsWith('/submit-turn') && /422|503/.test(msg.text()));
    if (msg.type() === 'error' && !expected) errors.get(key).push(`console: ${msg.text()} (${url})`);
  });
  ctx.on('pageerror', (err) => errors.get(key).push('pageerror:' + err.message));
};

// Выбор карт и клики по целям из локальной раскладки страницы.
const HAND_MINE = '…';
async function placeTurn(page, laneNum) {
  await page.locator('#fightBtn:enabled').waitFor();
  // TXX select two red attack for the enemy lane target, then two black on my assign
  for (const side of ['atk', 'def']) {
    for (let k = 0; k < 2; k++) {
      const kind = side === 'atk' ? 'red' : 'black';
      const selector = kind === 'red'
        ? '#hand .card.red:not(.used):not(.selected)'
        : '#hand .card:not(.red):not(.used):not(.selected)';
      await page.locator(selector).first().click();
    }
    const target = `#lanes .drop-target[data-kind="${side}"][data-lane="${laneNum}"]`;
    await page.locator(target).first().click();
  }
}

async function submitRoundDesktop(ctxA, ctxB, opts = {}) {
  void ctxA; void ctxB; void opts;
}

const runBrowser = async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL });
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
    const hand = pageA.locator('#hand');
    const preview = hand.locator('#panelEffect img');
    const power = hand.locator('#panelPower');
    const defense = hand.locator('[data-zone="defenseCards"] .card');
    const attack = hand.locator('[data-zone="attackCards"] .card');
    const desktopGeometry = await hand.evaluate((panel) => {
      const arena = document.querySelector('#arenaScene').getBoundingClientRect();
      const panelBox = panel.getBoundingClientRect();
      return Math.abs(panelBox.left - arena.left) < 2 && Math.abs(panelBox.right - arena.right) < 2;
    });
    ok(desktopGeometry, 'панель выровнена по игровому полю');
    ok(await defense.count() === 7 && await attack.count() === 7, 'по семь карт атаки и защиты');
    ok(await preview.count() === 0 && !(await power.textContent()), 'круг и число пусты в начале');
    await hand.screenshot({ path: 'tests/.shots/panel-14-cards.png' });

    // Вторая карта не меняет высоту интерфейса (п.14)
    const wrapA = pageA.locator('.wrap');
    const h1 = await wrapA.evaluate((el) => el.scrollHeight);
    await attack.first().click();
    ok(await preview.count() === 0 && !(await power.textContent()), 'одна карта не запускает предпросмотр');
    await defense.first().click();
    ok(await hand.locator('.selected').count() === 1, 'пара разных цветов не выбирается');
    const h2 = await wrapA.evaluate((el) => el.scrollHeight);
    await attack.nth(1).click();
    ok(await preview.count() === 1 && /^⚔ \d+$/.test(await power.textContent()), 'предпросмотр атакующей пары');
    await hand.screenshot({ path: 'tests/.shots/panel-attack.png' });
    ok(await pageA.locator('#fortifyBtn').count() === 0, 'кнопки укрепления нет');
    ok(await pageA.locator('.tower.outer .tower-hp').count() === 6
      && await pageA.locator('.tower.inner .tower-hp').count() === 0, 'HP только у ближних башен');
    const h3 = await wrapA.evaluate((el) => el.scrollHeight);
    ok(h1 === h2 && h2 === h3, `выбор карт не скачёт по высоте (${h1}/${h2}/${h3})`);
    // снять выделение высотного теста, чтобы не мешать раскладке;
    await pageA.locator('#hand .card.selected').first().click();
    ok(await preview.count() === 0 && !(await power.textContent()), 'отмена одной карты очищает предпросмотр');
    await pageA.locator('#hand .card.selected').first().click();
    await defense.first().click();
    await defense.nth(1).click();
    ok(await preview.count() === 1 && /^🛡 \d+$/.test(await power.textContent()), 'предпросмотр защитной пары');
    await hand.screenshot({ path: 'tests/.shots/panel-defense.png' });
    await pageA.locator('#clearBtn').click();
    ok(await preview.count() === 0, 'очистка снимает пару и её анимацию');

    // Раунд 1: оба игрока раскладывают и сдают
    for (const lane of [0, 1, 2]) await placeTurn(pageA, lane);
    for (const lane of [0, 1, 2]) await placeTurn(pageB, lane);
    ok(true, 'раскладка обоих принята локально');
    const metersMatch = await pageA.evaluate(() => {
      const tower = document.querySelector('.tower.ally.drop-target');
      const hp = tower.querySelector('.tower-hp .tower-meter-track').getBoundingClientRect();
      const shield = tower.querySelector('.tower-shield .tower-meter-track').getBoundingClientRect();
      return hp.width === shield.width && hp.height === shield.height && hp.top === shield.top && hp.x !== shield.x;
    });
    ok(metersMatch, 'HP и щит одинакового размера и стоят по разные стороны башни');

    // Оба игрока видят карты на правильных сторонах: у A на своих башнях — чёрные ♠♣,
    // на вражеских — красные ♥♦ (наши атакующие пары при планировании).
    const sidesOk = await pageA.evaluate(() => {
      const own = [...document.querySelectorAll('.side:not(.enemy) .tower.drop-target .slot-card .suit')].map((m) => m.textContent);
      const enemy = [...document.querySelectorAll('.side.enemy .tower.drop-target .slot-card .suit')].map((m) => m.textContent);
      return { own, enemy };
    });
    ok(sidesOk.own.length === 6 && sidesOk.own.every((t) => '♠♣'.includes(t.slice(-1))), `A: чёрные карты на своих башнях ${JSON.stringify(sidesOk.own)}`);
    
    await pageA.route('**/functions/v1/submit-turn', (route) => route.fulfill({
      status: 503, json: { error: 'test-submit-unavailable' },
    }), { times: 1 });
    await pageA.locator('#fightBtn').click();
    await pageA.waitForFunction(() => document.querySelector('#status')?.textContent.includes('test-submit-unavailable'));
    ok(await pageA.locator('#fightBtn').isEnabled(), 'ошибка отправки разблокирует кнопку и сохраняет раскладку');
    let rejectedCard;
    await pageA.route('**/functions/v1/submit-turn', (route) => {
      rejectedCard = route.request().postDataJSON().placements[0].attack[0];
      return route.fulfill({ status: 422, json: { error: 'Карты нет в руке: ' + rejectedCard } });
    }, { times: 1 });
    await pageA.locator('#fightBtn').click();
    await pageA.getByText(/Сервер отклонил карту/).waitFor();
    const firstAttack = pageA.locator('#lanes .drop-target[data-kind="atk"][data-lane="0"]');
    ok(await hand.locator('.used').count() === 11 && await firstAttack.locator('.slot-card').count() === 1,
      'отклонение карты освобождает только её место');
    await hand.locator(`.card.red:not(.used):not([data-card="${rejectedCard}"])`).click();
    await firstAttack.click();
    let submitCount = 0;
    let turnPayload;
    pageA.on('request', (r) => {
      if (r.method() !== 'POST' || !r.url().endsWith('/submit-turn')) return;
      submitCount++;
      turnPayload = r.postDataJSON();
    });
    await pageA.locator('#fightBtn').dblclick();
    await pageA.waitForFunction(() => document.querySelector('#status')?.textContent.includes('Ждём соперника'));
    ok(submitCount === 1 && await pageA.locator('#fightBtn').isDisabled(), 'двойное нажатие отправляет один ход, ожидание блокирует кнопку');
    ok(turnPayload && !Object.hasOwn(turnPayload, 'fortifyLane'), 'ход отправляется без укрепления');
    await pageA.reload();
    await pageA.waitForSelector('#hand .card');
    ok(await pageA.locator('#fightBtn').isDisabled(), 'после перезагрузки подтверждённый ход остаётся заблокирован');
    const enemyAttack = await pageB.locator('.tower.drop-target[data-lane="0"][data-kind="atk"] .slot-card').allTextContents();
    const enemyDefense = await pageB.locator('.tower.drop-target[data-lane="0"][data-kind="def"] .slot-card').allTextContents();
    ok(await pageA.locator('.combat-card-reveal').count() === 0, 'до обоих ходов карты врага скрыты');
    await pageB.locator('#fightBtn').click();

    await pageA.waitForFunction(() => document.querySelector('#phase')?.textContent.includes('Атака по щитам'), null, { timeout: 25000 });
    const incoming = pageA.locator('.tower.ally[data-lane="0"] .combat-card-reveal.incoming .combat-reveal-card:visible');
    const defending = pageA.locator('.tower.enemy[data-lane="0"] .combat-card-reveal.defending .combat-reveal-card:visible');
    ok(JSON.stringify(await incoming.allTextContents()) === JSON.stringify(enemyAttack)
      && JSON.stringify(await defending.allTextContents()) === JSON.stringify(enemyDefense), 'во время удара видны именно карты атаки и защиты соперника');
    ok(await pageA.locator('.tower .tower-shield.combat-shield-meter:visible').count() > 0, 'во время боя щит появляется в боковой шкале башни');
    await pageA.waitForFunction(() => document.querySelector('#roundBadge')?.textContent.includes('Раунд 2'), null, { timeout: 25000 });
    await pageB.waitForFunction(() => document.querySelector('#roundBadge')?.textContent.includes('Раунд 2'), null, { timeout: 25000 });
    ok(true, 'оба игрока видят раунд 2 после анимации');
    ok(await pageA.locator('#battleReports, .battle-reports').count() === 0, 'после хода статистика под панелью не появляется');

ok(sidesOk.enemy.length === 6 && sidesOk.enemy.every((t) => '♥♦'.includes(t.slice(-1))), `A: красные карты на башнях врага ${JSON.stringify(sidesOk.enemy)}`);

    // Ещё один раунд — проверим отсутствие дублей и стабилизацию.
    // Раскладка начинается строго ПОСЛЕ завершения хореографии (UI разморожен).
    await waitAnimEnd(pageA);
    await waitAnimEnd(pageB);
    for (const lane of [0, 1, 2]) await placeTurn(pageA, lane);
    for (const lane of [0, 1, 2]) await placeTurn(pageB, lane);
    const statusA = await pageA.evaluate(() => document.getElementById('status')?.textContent || '');
    ok(statusA === '', `второй раунд: раскладка без ошибок (${statusA})`);
    await pageA.locator('#fightBtn').click();
    await pageB.locator('#fightBtn').click();
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
    await pageA.goto(new URL('?panelDebug=1', BASE_URL).href);
    await pageA.waitForSelector('#panelEditor');
    const oldX = await pageA.locator('#roundBadge').evaluate((el) => el.getBoundingClientRect().x);
    await pageA.locator('#panelEditor input[name=x]').fill('4');
    const newX = await pageA.locator('#roundBadge').evaluate((el) => el.getBoundingClientRect().x);
    const [download] = await Promise.all([
      pageA.waitForEvent('download'),
      pageA.getByRole('button', { name: 'Экспорт JSON' }).click(),
    ]);
    ok(newX > oldX && download.suggestedFilename() === 'cardPanelLayout.json', 'редактор меняет координаты и экспортирует JSON');
    await pageA.screenshot({ path: 'tests/.shots/panel-debug.png' });

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
      const cardsInside = [...document.querySelectorAll('#hand .card')].every((card) => {
        const { left, right, top, bottom } = card.getBoundingClientRect();
        const group = card.parentElement.getBoundingClientRect();
        return left >= group.left && right <= group.right && top >= group.top && bottom <= group.bottom;
      });
      return {
        scrollOverflow: doc.scrollWidth > window.innerWidth + 1,
        towersOutside: outTowers,
        handOffscreen: handRect.bottom > window.innerHeight + 1,
        lanesNoScroll: lanesScroll,
        cardsInside,
      };
    });
    ok(!layout.scrollOverflow, `мобильный: нет горизонтальной прокрутки (${layout.scrollOverflow})`);
    ok(layout.towersOutside === 0, `мобильный: башни не вылезают (${layout.towersOutside})`);
    ok(!layout.handOffscreen, `мобильный: нижняя панель на экране`);
    ok(layout.lanesNoScroll, 'мобильный: линии внутри контейнера');
    ok(layout.cardsInside, 'мобильный: карты в пределах своих групп');
    await mobPage.screenshot({ path: 'tests/.shots/mobile.png', fullPage: true });

    // PvE: полноценный раунд с ботом на мобильном
    for (const k of [0, 1, 2]) await placeTurn(mobPage, k);
    await mobPage.locator('#fightBtn').click();
    await mobPage.waitForFunction(() => document.querySelector('#roundBadge')?.textContent.includes('Раунд 2'), null, { timeout: 25000 });
    await waitAnimEnd(mobPage);
    ok(true, 'PvE: бот-раунд ресолвится на мобильном viewport');
    } // mobReady

    const errM = errors.get('M');
    ok(errM.length === 0, `консоль M без ошибок (${errM.length}) — ${errM.slice(0, 2).join(' · ')}`);

    await pageA.screenshot({ path: 'tests/.shots/desktop-a.png', fullPage: true });
    await pageB.screenshot({ path: 'tests/.shots/desktop-b.png', fullPage: true });
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
if (failed) process.exitCode = 1;
