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
  const ability = ABILITIES[ev.ability];
  const name = ability ? ability.name : ev.ability;
  if (ev.effect === 'cleanse') return `💧 ${who}: ${name} — очищение статусов (${laneName})`;
  if (ev.effect === 'heal') return `✚ ${who}: ${name} — +${ev.amount} HP (${laneName})`;
  if (ev.effect === 'damage') return `⚔ ${who}: ${name} — −${ev.amount} (${laneName})`;
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
    el.className = 'ability-feed-item' + ((ev.side === 'a' && seat === 1) || (ev.side === 'b' && seat === 2) ? ' mine' : '');
    el.textContent = label(ev, seat);
    feed.appendChild(el);
  }
  document.body.appendChild(feed);
  timers.push(setTimeout(() => feed.classList.add('fade'), 3200));
  timers.push(setTimeout(() => feed.remove(), 4200));
}
