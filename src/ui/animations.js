import { revealAssignments, shieldEntries } from './combat-logic.js';
import { ELEMENTS } from '../../shared/elements.js';

// Боевая хореография v19 (эталон vochko_pvp_enemy_defense_reveal_v19.html):
// 1) под обеих сторон раскрываютсяcommitted пары (падение карт на цели),
// 2) щиты обеих сторон полны уже с момента «Готов» → атака съедает щит,
// 3) только затем падает HP башен и Нексусов (серверные события).
// Косметика: авторитетные HP и расчёт — только сервер (Supabase).
let timers = [];

export function clearFloats() {
  timers.forEach(clearTimeout);
  timers.length = 0;
  document.querySelectorAll('.damage-float').forEach((el) => el.remove());
  // Переход на другой экран/матч обязан отменять и боевую хореографию:
  // все таймеры сбрасываются, вставные узлы и маркеры HP убираются.
  cancelCombat();
  document.querySelector('#lanes')?.classList.remove('is-resolving');
}

const VFX_ICONS = Object.fromEntries(Object.values(ELEMENTS).map(e => [e.icon, e.icon]));

// Цель удара определяется детерминированно по стадии (не «первая живая»).
export function vfxTarget(ev, seat) {
  const mine = (ev.side === 'a' && seat === 1) || (ev.side === 'b' && seat === 2);
  const lane = document.querySelectorAll('#lanes .lane')[ev.l];
  if (ev.stage === 'nexus') {
    // Нексусы — большие трёхэтажные: этаж соответствует обстреливаемой линии.
    return document.querySelector((mine ? '.nexus-fortress.ally' : '.nexus-fortress.enemy') + ` .nexus-floor[data-lane="${ev.l}"]`)
      || document.querySelector(mine ? '.nexus-fortress.ally' : '.nexus-fortress.enemy');
  }
  if (!lane) return null;
  const towers = lane.querySelectorAll(mine ? '.side:not(.enemy) .tower' : '.side.enemy .tower');
  return towers[mine ? (ev.stage === 'outer' ? 1 : 0) : (ev.stage === 'outer' ? 0 : 1)] || null;
}

function vfxFloat(ev, seat, delay) {
  const target = vfxTarget(ev, seat);
  if (!target) return;
  const mine = (ev.side === 'a' && seat === 1) || (ev.side === 'b' && seat === 2);
  const icon = ev.burn ? '🔥' : (VFX_ICONS[ev.element] || '⚔️');
  const node = document.createElement('div');
  node.className = 'damage-float vfx-hit ' + (ev.burn ? 'burn-hit' : mine ? 'player-hit' : 'enemy-hit') + (ev.amount === 0 ? ' blocked-hit' : '');
  const glyph = document.createElement('span');
  glyph.className = 'vfx-icon';
  glyph.textContent = ev.amount === 0 ? '🛡️' : icon;
  const value = document.createElement('span');
  value.className = 'vfx-value';
  value.textContent = ev.amount === 0 ? '0' : '−' + ev.amount;
  node.append(glyph, value);
  const rect = target.getBoundingClientRect();
  const offset = ev.burn ? -19 : 8;
  node.style.left = Math.max(36, Math.min(window.innerWidth - 36, rect.left + rect.width / 2)) + 'px';
  node.style.top = Math.max(36, Math.min(window.innerHeight - 40, rect.top + rect.height * 0.30 + offset)) + 'px';
  node.style.setProperty('--vfx-delay', delay + 'ms');
  node.style.setProperty('--vfx-shift', ((ev.l - 1) * 7) + 'px');
  document.body.appendChild(node);
  node.addEventListener('animationend', () => node.remove(), { once: true });
  setTimeout(() => node.remove(), 1600);
  target.classList.remove('vfx-impact');
  void target.offsetWidth;
  target.classList.add('vfx-impact');
  setTimeout(() => target.classList.remove('vfx-impact'), 380);
}

// Мгновенные VFX (используется вне хореографии).
export function showRoundDamage(events, seat) {
  if (!Array.isArray(events)) return;
  events.forEach((ev) => vfxFloat(ev, seat, ev.burn ? 0 : 120));
}

/* ── Хореография боя: карты → щиты → урон башням — с непрерывным таймлайном ── */
let combatTimers = [];
let combatRun = 0;
let combatPlaying = false;
export const isCombatPlaying = () => combatPlaying;

// Внедрение UI-функций (render/showEndScreen) из main.js без циркулярных импортов.
const combatUI = {};
export function bindCombatUI(ui) { Object.assign(combatUI, ui); }

// Полная отмена текущей хореографии (выход из матча, реванш, F5-восстановление).
export function cancelCombat() {
  combatRun++;
  combatTimers.forEach(clearTimeout);
  combatTimers = [];
  combatPlaying = false;
  document.querySelectorAll('.combat-shield,.combat-stage,.combat-card-reveal,.combat-damage-number').forEach((x) => x.remove());
  document.querySelectorAll('.combat-hp-restore').forEach((x) => {
    x.classList.remove('combat-hp-restore');
    if (x.dataset.combatFinalText !== undefined) { x.textContent = x.dataset.combatFinalText; delete x.dataset.combatFinalText; }
    if (x.dataset.combatFinalWidth !== undefined) { x.style.width = x.dataset.combatFinalWidth; delete x.dataset.combatFinalWidth; }
  });
}

function combatLater(fn, ms) { const id = setTimeout(fn, ms); combatTimers.push(id); return id; }

function combatClear() {
  cancelCombat();
}

function combatShieldTarget(lane, side, seat, stage) {
  // Цель — конкретная башня/этаж, получившие удар, а не «первая живая» после
  // того, как сервер уже обновил HP. Стороны рендерятся в обратном порядке.
  const mine = (side === 'a' && seat === 1) || (side === 'b' && seat === 2);
  const laneEl = document.querySelectorAll('#lanes .lane')[lane];
  if (stage === 'nexus') {
    return document.querySelector((mine ? '.nexus-fortress.ally' : '.nexus-fortress.enemy') + ` .nexus-floor[data-lane="${lane}"]`)
      || document.querySelector(mine ? '.nexus-fortress.ally' : '.nexus-fortress.enemy');
  }
  if (!laneEl) return null;
  const selector = mine ? '.side:not(.enemy) .tower' : '.side.enemy .tower';
  const towers = laneEl.querySelectorAll(selector);
  if (stage === 'outer') return towers[mine ? 1 : 0] || null;
  if (stage === 'inner') return towers[mine ? 0 : 1] || null;
  return laneEl.querySelector((mine ? '.side:not(.enemy)' : '.side.enemy') + ' .tower.drop-target') || towers[mine ? 1 : 0] || null;
}

function combatBubble(target, icon, power, lane) {
  if (!target) return null;
  const bubble = document.createElement('div');
  bubble.className = 'combat-shield';
  bubble.innerHTML = '<div class="combat-shield-title">🛡 <span class="combat-shield-icon"></span> <b class="combat-shield-number"></b></div><div class="combat-shield-track"><i></i></div>';
  bubble.querySelector('.combat-shield-icon').textContent = icon || '🛡️';
  bubble.querySelector('.combat-shield-number').textContent = String(power);
  target.appendChild(bubble);
  // Шкала щита живёт внутри своей линии: position:fixed + clamp не даёт ей
  // уехать на соседнюю башню или обрезаться контейнерами поля.
  const targetRect = target.getBoundingClientRect();
  const nexusMeter = target.classList.contains('nexus-floor') ? target.querySelector('.nexus-floor-meter') : null;
  const meterRect = nexusMeter?.getBoundingClientRect();
  const laneNode = target.closest('.lane') || document.querySelectorAll('#lanes .lane')[Math.max(0, Math.min(2, Number(lane) || 0))];
  const laneRect = laneNode?.getBoundingClientRect();
  const meterWidth = meterRect ? Math.max(86, meterRect.width) : Math.min(128, Math.max(86, targetRect.width));
  const anchor = meterRect || targetRect;
  const x = Math.max(meterWidth / 2 + 8, Math.min(innerWidth - meterWidth / 2 - 8, anchor.left + anchor.width / 2));
  const desiredY = meterRect ? meterRect.top - 4 : targetRect.top - 48;
  const minY = laneRect ? laneRect.top + 8 : 8;
  const maxY = laneRect ? laneRect.bottom - 52 : innerHeight - 52;
  const y = Math.max(minY, Math.min(Math.max(minY, maxY), desiredY));
  bubble.style.setProperty('position', 'fixed', 'important');
  bubble.style.setProperty('left', x + 'px', 'important');
  bubble.style.setProperty('top', y + 'px', 'important');
  bubble.style.setProperty('bottom', 'auto', 'important');
  bubble.style.setProperty('width', meterWidth + 'px', 'important');
  requestAnimationFrame(() => bubble.classList.add('combat-shield-ready'));
  return bubble;
}

function combatStage(label) {
  const root = document.querySelector('#lanes');
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'combat-stage';
  el.textContent = label;
  root.appendChild(el);
  combatLater(() => el.remove(), 700);
}

// HP-снимок: мгновенно откатываем полоски к ДО-ударным значениям, чтобы
// на фазе урона красиво упасть до финальных (серверных) значений.
// Возвращает map counter для восстановления HP Нексуса на этажах.
function combatHpSnapshot(events, seat) {
  const grouped = new Map();
  for (const ev of events) {
    const mine = (ev.side === 'a' && seat === 1) || (ev.side === 'b' && seat === 2);
    // Нексус: HP живёт в .nexus-fortress-stats; башни — в .value/.tinybar.
    const target = ev.stage === 'nexus'
      ? document.querySelector((mine ? '.nexus-fortress.ally' : '.nexus-fortress.enemy') + ' .nexus-fortress-stats')
      : vfxTarget(ev, seat);
    if (!target || !Number(ev.amount)) continue;
    if (!grouped.has(target)) grouped.set(target, []);
    grouped.get(target).push(ev);
  }
  const items = [];
  grouped.forEach((hits, target) => {
    const val = target.querySelector('.value') || target.querySelector('.hp');
    const bar = target.querySelector('.tinybar i') || target.querySelector('.bar .fill');
    if (!val || !bar) return;
    const match = val.textContent.match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) return;
    const final = +match[1], max = +match[2];
    const damage = hits.reduce((sum, ev) => sum + Math.max(0, +ev.amount || 0), 0);
    const start = Math.min(max, final + damage);
    if (start <= final) return;
    val.dataset.combatFinalText = val.textContent;
    bar.dataset.combatFinalWidth = bar.style.width;
    val.classList.add('combat-hp-restore');
    bar.classList.add('combat-hp-restore');
    // Откат без transition: текущий кадр показывает ДО-ударное HP.
    bar.style.transition = 'none';
    val.textContent = start + ' / ' + max;
    bar.style.width = (start / max) * 100 + '%';
    void bar.offsetWidth;
    bar.style.transition = '';
    items.push({ target, val, bar, start, final, max, hits });
  });
  return items;
}

function combatShieldPopup(target, amount, element) {
  if (!target) return;
  const r = target.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'combat-damage-number shield-damage-number';
  const glyph = document.createElement('span');
  glyph.textContent = element || '⚔️';
  const number = document.createElement('strong');
  number.textContent = '−' + amount + ' 🛡';
  el.append(glyph, number);
  el.style.left = Math.max(35, Math.min(innerWidth - 35, r.left + r.width / 2)) + 'px';
  el.style.top = Math.max(30, r.top + 12) + 'px';
  document.body.appendChild(el);
  combatLater(() => el.remove(), 1400);
}

function combatHpPopup(target, amount, element) {
  if (!target || amount <= 0) return;
  const r = target.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'combat-damage-number hp-damage-number';
  const glyph = document.createElement('span');
  glyph.textContent = element || '⚔️';
  const number = document.createElement('strong');
  number.textContent = '−' + amount + ' HP';
  el.append(glyph, number);
  el.style.left = Math.max(35, Math.min(innerWidth - 35, r.left + r.width / 2)) + 'px';
  el.style.top = Math.max(30, r.top + r.height * 0.35) + 'px';
  document.body.appendChild(el);
  combatLater(() => el.remove(), 1500);
  target.classList.remove('vfx-impact');
  void target.offsetWidth;
  target.classList.add('vfx-impact');
  combatLater(() => target.classList.remove('vfx-impact'), 450);
}

// Раскрытие committed-пар ДО щитов и урона: только карты серверного отчёта.
// Наши башни принимают атакующие карты врага (падение); на башнях врага
// раскрывается ЕГО защита в развёрнутом виде. Чья рука никогда не читается,
// цели и разметка приходят из combat-logic.revealAssignments.
export function combatRevealAttackCards(report, seat) {
  const overlays = [];
  for (const a of revealAssignments(report, seat)) {
    const target = combatShieldTarget(a.lane, a.defenderSide, seat, a.stage);
    if (!target) continue;
    const cards = a.cards;
    const rect = target.getBoundingClientRect();
    const laneEl = document.querySelectorAll('#lanes .lane')[a.lane];
    const laneRect = laneEl?.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'combat-card-reveal ' + (a.isMine ? 'incoming' : 'defending');
    const label = document.createElement('div');
    label.className = 'combat-reveal-label';
    label.textContent = a.label;
    const pair = document.createElement('div');
    pair.className = 'combat-reveal-pair';
    el.append(label, pair);
    for (const card of cards) {
      const c = document.createElement('span');
      c.className = 'combat-reveal-card' + ('♥♦'.includes(card.s) ? ' red' : '');
      const rank = document.createElement('b'); rank.textContent = card.r;
      const suit = document.createElement('span'); suit.textContent = card.s;
      c.append(rank, suit); pair.appendChild(c);
    }
    const width = innerWidth <= 740 ? 84 : 104;
    const x = Math.max(width / 2 + 8, Math.min(innerWidth - width / 2 - 8, rect.left + rect.width / 2));
    const minY = (laneRect?.top ?? 0) + 35;
    const maxY = (laneRect?.bottom ?? innerHeight) - 100;
    const y = Math.max(minY, Math.min(Math.max(minY, maxY), rect.top + rect.height * 0.30));
    el.style.left = x + 'px'; el.style.top = y + 'px';
    document.body.appendChild(el);
    overlays.push(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('fall')));
  }
  return overlays;
}

// Хореография раунда v19. Порядок фаз со стабильным таймлайном:
// 0.0–1.75с карты падают и раскрываются → 1.9с щиты пробиты → 3.25с HP падает
// → 4.75с щиты уплывают → 5.25с свежий авторитетный рендер (+ финиш-экран).
export function playRoundAnimation(view) {
  const rep = view.latestRoundReport;
  if (!rep || !Array.isArray(rep.events)) return;
  combatClear();
  combatPlaying = true;
  const run = combatRun;
  const seat = view.seat;
  const valid = () => run === combatRun;
  // Подсветка выбора гаснет на время разрешения раунда (состояние resolving).
  document.querySelector('#lanes')?.classList.add('is-resolving');
  const hpItems = combatHpSnapshot(rep.events, seat);
  const shields = [];
  for (const e of shieldEntries(rep.report)) {
    const target = combatShieldTarget(e.lane, e.side, seat, e.stage);
    const bubble = combatBubble(target, e.element, e.full, e.lane);
    if (!bubble) continue;
    const track = bubble.querySelector('.combat-shield-track i');
    const number = bubble.querySelector('.combat-shield-number');
    // Щит сразу полный — без искусственной зарядки после «Готова».
    bubble.classList.add('combat-shield-ready', 'combat-shield-initial');
    track.style.transition = 'none';
    track.style.width = '100%';
    number.textContent = String(e.full);
    void track.offsetWidth;
    shields.push({ bubble, target, track, number, full: e.full, attack: e.attack, element: e.attackElement });
  }
  const revealedCards = combatRevealAttackCards(rep.report, seat);
  (window.__animLog = window.__animLog || []).push({ fn: 'anim', overlays: revealedCards.length, shields: shields.length, hp: hpItems.length });
  const phase = document.querySelector('#phase');
  if (phase) phase.textContent = '🃏 Раскрытие атак';
  combatLater(() => revealedCards.forEach((el) => el.classList.add('fade')), 1300);
  combatLater(() => revealedCards.forEach((el) => el.remove()), 1750);
  // 1.9с: удар по щитам. Цифры показывают поглощённые щитом очки.
  combatLater(() => {
    if (!valid()) return;
    if (phase) phase.textContent = '⚔️ Атака по щитам';
    shields.forEach(({ bubble, target, track, number, full, attack, element }) => {
      const absorbed = Math.min(full, attack);
      const remaining = Math.max(0, full - attack);
      bubble.classList.add('combat-shield-hit');
      track.style.transition = 'width 1000ms cubic-bezier(.22,.65,.3,1)';
      track.style.width = (full ? remaining / full * 100 : 0) + '%';
      number.textContent = String(remaining);
      if (absorbed) combatShieldPopup(target, absorbed, element);
      if (remaining === 0) combatLater(() => bubble.classList.add('combat-shield-broken'), 900);
    });
  }, 1900);
  // 3.25с: только теперь падает HP — по фактическим серверным событиям.
  combatLater(() => {
    if (!valid()) return;
    if (phase) phase.textContent = '💥 Урон башням';
    hpItems.forEach(({ target, val, bar, final, max, hits }) => {
      const total = hits.reduce((sum, e) => sum + Math.max(0, +e.amount || 0), 0);
      const icon = hits.find((e) => !e.burn)?.element || '🔥';
      combatHpPopup(target, total, icon);
      bar.style.transition = 'width 1100ms cubic-bezier(.25,.7,.25,1)';
      bar.style.width = (final / max) * 100 + '%';
      val.textContent = final + ' / ' + max;
      val.classList.remove('combat-hp-restore');
      bar.classList.remove('combat-hp-restore');
      delete val.dataset.combatFinalText;
      delete bar.dataset.combatFinalWidth;
    });
  }, 3250);
  // 4.75с: щиты уплывают.
  combatLater(() => {
    if (!valid()) return;
    shields.forEach(({ bubble }) => bubble.classList.add('combat-shield-out'));
  }, 4750);
  // 5.25с: UI разморожен, рендерим свежее авторитетное состояние; финальный
  // экран показывается ТОЛЬКО после полного проигрыша последнего боя.
  combatLater(() => {
    if (!valid()) {
      if (import.meta.env.DEV) (window.__animLog = window.__animLog || []).push({ fn: 'anim-dropped' });
      return;
    }
    combatPlaying = false;
    shields.forEach(({ bubble }) => bubble.remove());
    document.querySelectorAll('.combat-damage-number').forEach((el) => el.remove());
    document.querySelector('#lanes')?.classList.remove('is-resolving');
    if (combatUI.render) combatUI.render();
    if (view.status === 'finished' || view.winner) {
      if (combatUI.showEndScreen) combatUI.showEndScreen(view);
    }
  }, 5250);
}
