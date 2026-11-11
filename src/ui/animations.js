import { launchAttackCharge } from './arena/AttackCharge.js';
import { setTowerShield, setTowerHealth } from './arena/TowerHealth.js';
import { ELEMENTS } from '../../shared/elements.js';
import { damageSplit, revealAssignments, shieldEntries } from './combat-logic.js';

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
  document.querySelectorAll('.attack-charge.charge-fired').forEach(el => el.classList.remove('charge-fired'));
  document.querySelectorAll('.combat-shield,.combat-stage,.combat-card-reveal,.combat-damage-number,.attack-projectile,.attack-impact-flash').forEach((x) => x.remove());
  document.querySelectorAll('.combat-hp-restore').forEach((x) => {
    x.classList.remove('combat-hp-restore');
    if (x.dataset.combatRestoreText !== undefined) { x.textContent = x.dataset.combatRestoreText; delete x.dataset.combatRestoreText; }
    if (x.dataset.combatRestoreFill !== undefined) {
      x.style[x.dataset.combatFillAxis || 'width'] = x.dataset.combatRestoreFill;
      delete x.dataset.combatRestoreFill;
      delete x.dataset.combatFillAxis;
    }
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

// Остаток щита показываем в шкале цели.
function combatShieldMeter(target, entry) {
  if (!target) return null;
  const meter = target.querySelector('.tower-shield');
  if (!meter) return null;
  const track = meter.querySelector('.tower-meter-track i');
  const num = meter.querySelector('b');
  if (!track || !num) return null;
  setTowerShield(target, entry.full, entry.full);
  num.textContent = String(entry.full);
  meter.classList.add('combat-shield-meter');
  meter.setAttribute('aria-label', `Щит: ${entry.full}`);
  track.style.transition = 'none';
  track.style.height = entry.full ? '100%' : '0%';
  void track.offsetWidth;
  track.style.transition = '';
  return { target, meter, track, num };
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

// HP-снимок: DOM ещё показывает состояние ДО раунда, поэтому финальное HP
// считаем как «старт − суммарный урон» из отчёта. На фазе урона полоска
// плавно падает до этого значения.
// Возвращает map counter для восстановления HP при отмене хореографии.
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
    const bar = target.querySelector('.tower-hp .tower-meter-track i, .tinybar i, .bar .fill');
    if (!val || !bar) return;
    const match = val.textContent.match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) return;
    const start = +match[1], max = +match[2];
    const damage = hits.reduce((sum, ev) => sum + Math.max(0, +ev.amount || 0), 0);
    const final = Math.max(0, start - damage);
    if (final >= start) return;
    // Вертикальные полоски (арена v20) растут по height, v19 — по width.
    const axis = bar.dataset.vertical === '1' ? 'height' : 'width';
    val.dataset.combatRestoreText = val.textContent;
    bar.dataset.combatRestoreFill = bar.style[axis];
    bar.dataset.combatFillAxis = axis;
    val.classList.add('combat-hp-restore');
    bar.classList.add('combat-hp-restore');
    // На всякий случай фиксируем стартовое значение (без анимации).
    bar.style[axis] = (start / max) * 100 + '%';
    const lag = target.querySelector('.crystal-lag');
    if (lag) {
      lag.dataset.combatRestoreFill = lag.style.height;
      lag.dataset.combatFillAxis = 'height';
      lag.classList.add('combat-hp-restore');
    }
    items.push({ target, val, bar, axis, start, final, max });
  });
  return items;
}

function combatResultPopup(target, text, kind, blocked = false) {
  const r = target.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = `combat-damage-number combat-result ${kind}-damage-number`;
  const number = document.createElement('strong');
  number.textContent = text;
  el.append(number);
  if (blocked) {
    const status = document.createElement('span');
    status.textContent = 'Заблокировано';
    el.append(status);
  }
  el.style.left = Math.max(50, Math.min(innerWidth - 50, r.left + r.width / 2)) + 'px';
  const anchorY = r.top + r.height * (target.classList.contains('nexus-floor') ? 1 : 0.8);
  el.style.top = Math.min(innerHeight - 34, anchorY) + 'px';
  document.body.appendChild(el);
  combatLater(() => el.remove(), 1250);
}

function combatHpPopup(target, amount) {
  combatResultPopup(target, 'HP −' + amount, 'hp');
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
    const slots = target?.querySelectorAll('.card-slot');
    if (slots?.length !== 2) continue;
    const el = document.createElement('div');
    el.className = 'combat-card-reveal ' + (a.isMine ? 'incoming' : 'defending');
    const label = document.createElement('div');
    label.className = 'combat-reveal-label';
    label.textContent = a.label;
    const left = parseFloat(slots[0].style.left);
    const right = parseFloat(slots[1].style.left) + parseFloat(slots[1].style.width);
    label.style.left = (left + right) / 2 + '%';
    label.style.top = slots[0].style.top;
    el.append(label);
    a.cards.forEach((card, index) => {
      const c = document.createElement('span');
      c.className = 'combat-reveal-card' + ('♥♦'.includes(card.s) ? ' red' : '');
      c.style.cssText = slots[index % 2].style.cssText;
      if (a.cards.length === 4) {
        const box = slots[index % 2];
        const row = Math.floor(index / 2);
        c.style.height = (parseFloat(box.style.height) * .62) + '%';
        c.style.width = (parseFloat(box.style.width) * .85) + '%';
        c.style.top = (parseFloat(box.style.top) + (row ? .67 : -.33) * parseFloat(box.style.height)) + '%';
      }
      const rank = document.createElement('b'); rank.textContent = card.r;
      const suit = document.createElement('span'); suit.textContent = card.s;
      c.append(rank, suit);
      el.appendChild(c);
    });
    target.appendChild(el);
    overlays.push(el);
  }
  return overlays;
}

// Хореография раунда v19. Порядок фаз со стабильным таймлайном:
// Карты открываются сразу и остаются видны при ударе по щиту и начале урона.
// 1.9с щит тает в боковой шкале
// → 3.25с HP падает → 5.25с свежий авторитетный рендер (+ финиш-экран).
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
    const meter = combatShieldMeter(target, e);
    if (!meter) continue; // мёртвая цель без боковой шкалы: останется только цифра урона
    shields.push({ ...meter, full: e.full, attack: e.attack });
  }
  const revealedCards = combatRevealAttackCards(rep.report, seat);
  (window.__animLog = window.__animLog || []).push({ fn: 'anim', overlays: revealedCards.length, shields: shields.length, hp: hpItems.length });
  const phase = document.querySelector('#phase');
  if (phase) phase.textContent = '🃏 Раскрытие атак';
  combatLater(() => revealedCards.forEach((el) => el.classList.add('fade')), 3900);
  combatLater(() => revealedCards.forEach((el) => el.remove()), 4250);
  // The prepared elemental charge lands just before the shield absorption phase.
  combatLater(() => {
    if (!valid()) return;
    for (const e of shieldEntries(rep.report)) {
      const target = combatShieldTarget(e.lane, e.side, seat, e.stage);
      if (target?.classList.contains('tower-art')) launchAttackCharge(target, e.attackElement, e.attack);
    }
  }, 1450);
  // 1.9с: удар по щитам. Защита тает в боковой шкале цели.
  combatLater(() => {
    if (!valid()) return;
    if (phase) phase.textContent = '⚔️ Атака по щитам';
    shields.forEach(({ target, meter, track, num, full, attack }) => {
      const { absorbed, remaining, hpDamage } = damageSplit(attack, full);
      track.style.transition = 'height 1000ms cubic-bezier(.22,.65,.3,1)';
      track.style.height = (full ? remaining / full * 100 : 0) + '%';
      setTowerShield(target, remaining, full);
      num.textContent = String(remaining);
      meter.setAttribute('aria-label', `Щит: ${remaining}`);
      if (absorbed) combatResultPopup(target, 'Щит −' + absorbed, 'shield', hpDamage === 0);
    });
  }, 1900);
  // 3.25с: только теперь падает HP — по фактическим серверным событиям.
  combatLater(() => {
    if (!valid()) return;
    if (phase) phase.textContent = '💥 Урон башням';
    hpItems.forEach(({ target, val, bar, axis, start, final, max }) => {
      combatHpPopup(target, start - final);
      bar.style.transition = axis + ' 1100ms cubic-bezier(.25,.7,.25,1)';
      bar.style[axis] = (final / max) * 100 + '%';
      setTowerHealth(target, final, max);
      val.textContent = final + ' / ' + max;
    });
  }, 3250);
  // 4.75с: полоски HP уже упали — только теперь меняем модели башен/руины,
  // чтобы исход раунда не был виден до анимации урона.
  combatLater(() => {
    if (!valid()) return;
    if (combatUI.renderFinal) combatUI.renderFinal();
  }, 4750);
  // 5.25с: UI разморожен, рендерим свежее авторитетное состояние; финальный
  // экран показывается ТОЛЬКО после полного проигрыша последнего боя.
  combatLater(() => {
    if (!valid()) {
      if (import.meta.env.DEV) (window.__animLog = window.__animLog || []).push({ fn: 'anim-dropped' });
      return;
    }
    combatPlaying = false;
    shields.forEach(({ meter }) => {
      meter.classList.remove('combat-shield-meter');
    });
    document.querySelectorAll('.combat-damage-number').forEach((el) => el.remove());
    document.querySelector('#lanes')?.classList.remove('is-resolving');
    if (combatUI.render) combatUI.render();
    if (view.status === 'finished' || view.winner) {
      if (combatUI.showEndScreen) combatUI.showEndScreen(view);
    }
  }, 5250);
}
