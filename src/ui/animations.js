// Классические цифры урона + боевая хореография v4 (порт из v5-версии игрока):
// щиты обеих сторон заряжены с «Готова» → атака съедает щит → только затем
// падает HP башен. Косметика: авторитетные HP и расчёт — только сервер.
let timers = [];

export function clearFloats() {
  timers.forEach(clearTimeout);
  timers.length = 0;
  document.querySelectorAll('.damage-float').forEach((el) => el.remove());
}

const ELEMENT_CLASS = { '🔥': 'fire', '💧': 'water', '🪨': 'earth', '🌪️': 'air', '♨️': 'steam', '🌫️': 'storm' };
const VFX_ICONS = { '🔥': '🔥', '💧': '💧', '🪨': '🪨', '🌪️': '🌪️', '♨️': '♨️', '🌫️': '🌫️' };

// Цель удара определяется детерминированно по стадии (не «первая живая»).
export function vfxTarget(ev, seat) {
  const mine = (ev.side === 'a' && seat === 1) || (ev.side === 'b' && seat === 2);
  const lane = document.querySelectorAll('#lanes .lane')[ev.l];
  if (ev.stage === 'nexus') {
    // У вражеского Нексуса нет #botBaseTargets — контейнер .nexus.enemy.
    return document.querySelector(mine ? '.nexus:not(.enemy)' : '.nexus.enemy');
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

/* ── Хореография боя: щиты → атаки по щитам → урон башням ── */
let combatTimers = [];
let combatRun = 0;
let combatPlaying = false;
export const isCombatPlaying = () => combatPlaying;

// Внедрение UI-функций (render/showEndScreen) из main.js без циркулярных импортов.
const combatUI = {};
export function bindCombatUI(ui) { Object.assign(combatUI, ui); }

function combatLater(fn, ms) { const id = setTimeout(fn, ms); combatTimers.push(id); return id; }

function combatClear() {
  combatRun++;
  combatTimers.forEach(clearTimeout);
  combatTimers = [];
  document.querySelectorAll('.combat-shield,.combat-stage').forEach((x) => x.remove());
  document.querySelectorAll('.combat-hp-restore').forEach((x) => {
    x.classList.remove('combat-hp-restore');
    if (x.dataset.combatFinalText !== undefined) { x.textContent = x.dataset.combatFinalText; delete x.dataset.combatFinalText; }
    if (x.dataset.combatFinalWidth !== undefined) { x.style.width = x.dataset.combatFinalWidth; delete x.dataset.combatFinalWidth; }
  });
}

function combatShieldTarget(lane, side, seat, stage) {
  // Цель — конкретная башня, получившая удар, а не «первая живая» после
  // того, как сервер уже обновил HP. Стороны рендерятся в обратном порядке.
  const mine = (side === 'a' && seat === 1) || (side === 'b' && seat === 2);
  const laneEl = document.querySelectorAll('#lanes .lane')[lane];
  if (!laneEl) return null;
  const selector = mine ? '.side:not(.enemy) .tower' : '.side.enemy .tower';
  const towers = laneEl.querySelectorAll(selector);
  if (stage === 'nexus') return document.querySelector(mine ? '.nexus:not(.enemy)' : '.nexus.enemy');
  if (stage === 'outer') return towers[mine ? 1 : 0] || null;
  if (stage === 'inner') return towers[mine ? 0 : 1] || null;
  return laneEl.querySelector((mine ? '.side:not(.enemy)' : '.side.enemy') + ' .tower.drop-target') || towers[mine ? 1 : 0] || null;
}

function combatBubble(target, icon, power) {
  if (!target) return null;
  const bubble = document.createElement('div');
  bubble.className = 'combat-shield';
  bubble.innerHTML = '<div class="combat-shield-title">🛡 <span class="combat-shield-icon"></span> <b class="combat-shield-number"></b></div><div class="combat-shield-track"><i></i></div>';
  bubble.querySelector('.combat-shield-icon').textContent = icon || '🛡️';
  bubble.querySelector('.combat-shield-number').textContent = String(power);
  target.appendChild(bubble);
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
function combatHpSnapshot(events, seat) {
  const grouped = new Map();
  for (const ev of events) {
    const target = vfxTarget(ev, seat);
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

// Хореография раунда. Щит изначально полный; атака сначала съедает щит,
// и только серверный урон снимает HP башен.
export function playRoundAnimation(view) {
  const rep = view.latestRoundReport;
  if (!rep || !Array.isArray(rep.events)) return;
  combatClear();
  combatPlaying = true;
  const run = combatRun;
  const seat = view.seat;
  const valid = () => run === combatRun;
  const hpItems = combatHpSnapshot(rep.events, seat);
  const shields = [];
  // Строка report.a: A бьёт B (защита B = row.b.info.d). Строка report.b: B бьёт A.
  for (const row of rep.report || []) {
    const lane = Number(row.lane);
    for (const entry of [
      { side: 'a', info: row.b?.info, stage: row.b?.stage, attackElement: row.b?.info?.at },
      { side: 'b', info: row.a?.info, stage: row.a?.stage, attackElement: row.a?.info?.at },
    ]) {
      if (!entry.info) continue;
      const full = Math.max(0, Number(entry.info.d) || 0);
      const attack = Math.max(0, Number(entry.info.a) || 0);
      const target = combatShieldTarget(lane, entry.side, seat, entry.stage);
      const bubble = combatBubble(target, entry.info.dt, full);
      if (!bubble) continue;
      const track = bubble.querySelector('.combat-shield-track i');
      const number = bubble.querySelector('.combat-shield-number');
      // Щит сразу полный — без искусственной зарядки после «Готова».
      bubble.classList.add('combat-shield-ready', 'combat-shield-initial');
      track.style.transition = 'none';
      track.style.width = '100%';
      number.textContent = String(full);
      void track.offsetWidth;
      shields.push({ bubble, target, track, number, full, attack, element: entry.attackElement });
    }
  }
  const phase = document.querySelector('#phase');
  if (phase) phase.textContent = '🛡 Защита';
  combatStage('🛡 Щиты готовы');
  // 0.45 с: удар по щитам. Цифры показывают поглощённые щитом очки.
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
  }, 450);
  // 1.8 с: только теперь падает HP — по фактическим серверным события.
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
  }, 1800);
  // 3.2 с: щиты уплывают.
  combatLater(() => {
    if (!valid()) return;
    shields.forEach(({ bubble }) => bubble.classList.add('combat-shield-out'));
  }, 3200);
  // 3.75 с: рендерим свежее авторитетное состояние после всей последовательности.
  combatLater(() => {
    if (!valid()) return;
    combatPlaying = false;
    shields.forEach(({ bubble }) => bubble.remove());
    document.querySelectorAll('.combat-damage-number').forEach((el) => el.remove());
    if (combatUI.render) combatUI.render();
    if (view.status === 'finished' || view.winner) {
      if (combatUI.showEndScreen) combatUI.showEndScreen(view);
    }
  }, 3750);
}
