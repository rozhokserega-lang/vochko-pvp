// Лента срабатываний стихийных способностей во время боевой хореографии.
// Данные — серверные abilityEvents отчёта раунда (публичная информация).
import { ABILITIES } from '../../../shared/abilities.js';

const LANES = ['ВЕРХ', 'ЦЕНТР', 'НИЗ'];

let timers = [];

export function clearAbilityFeed() {
  timers.forEach(clearTimeout);
  timers = [];
  document.querySelectorAll('.ability-feed, .ability-feed-item').forEach((el) => el.remove());
}

function label(ev, seat) {
  const mine = (ev.side === 'a' && seat === 1) || (ev.side === 'b' && seat === 2);
  const who = mine ? 'Вы' : 'Соперник';
  const laneName = LANES[ev.lane] ?? '';
  if (ev.ability === 'burn_tick') {
    return `🔥 Поджог: ${who.toLowerCase()} ${laneName} −${ev.amount}`;
  }
  if (ev.ability === 'counter_triggered') {
    const canceled = ABILITIES[ev.canceled];
    return `🛡 КОНТРСТИХИЯ: ${who} — «${canceled?.name ?? ev.canceled}» нейтрализована (${laneName})`;
  }
  const ability = ABILITIES[ev.ability];
  const name = ability ? ability.name : ev.ability;
  if (ev.effect === 'cleanse') return `💧 ${who}: ${name} — очищение статусов (${laneName})`;
  if (ev.effect === 'heal') return `✚ ${who}: ${name} — +${ev.amount} HP (${laneName})`;
  if (ev.effect === 'damage') return `⚔ ${who}: ${name} — −${ev.amount} (${laneName})`;
  if (ev.effect === 'status') return `${who}: ${name} — эффект на следующий раунд (${laneName})`;
  return `${who}: ${name} (${laneName})`;
}

// Показ всплывающих строк сверху арены; гаснут через ~4 c.
export function showAbilityFeed(abilityEvents, seat) {
  clearAbilityFeed();
  if (!Array.isArray(abilityEvents) || !abilityEvents.length) return;
  const feed = document.createElement('div');
  feed.className = 'ability-feed';
  const items = abilityEvents.slice(0, 8); // без спама: первые 8 событий раунда
  for (const ev of items) {
    const el = document.createElement('div');
    const mine = (ev.side === 'a' && seat === 1) || (ev.side === 'b' && seat === 2);
    el.className = 'ability-feed-item'
      + (mine ? ' mine' : '')
      + (ev.ability === 'counter_triggered' ? ' counter' : '');
    el.textContent = label(ev, seat);
    feed.appendChild(el);
  }
  document.body.appendChild(feed);
  timers.push(setTimeout(() => feed.classList.add('fade'), 3200));
  timers.push(setTimeout(() => feed.remove(), 4200));
  // Метки «КОНТРСТИХИЯ!» над затронутыми башнями линии (без задержек/подтверждений).
  for (const ev of items.filter(e => e.ability === 'counter_triggered')) {
    const laneEl = document.querySelectorAll('#lanes .lane')[ev.lane];
    if (!laneEl) continue;
    const rect = laneEl.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'counter-float';
    el.textContent = 'КОНТРСТИХИЯ!';
    el.style.left = Math.max(40, Math.min(window.innerWidth - 110, rect.left + rect.width / 2 - 45)) + 'px';
    el.style.top = Math.max(40, rect.top - 4) + 'px';
    document.body.appendChild(el);
    timers.push(setTimeout(() => el.remove(), 1500));
  }
}
