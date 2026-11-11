import { comboDetails } from './combos.js';

// Единственный источник баланса для сервера и предпросмотра клиента.
export const ELEMENTS = Object.freeze(Object.fromEntries([
  ['fire', 'Огонь', '♥♥', '🔥', 20, -10],
  ['water', 'Вода', '♦♦', '💧', 10, 10],
  ['earth', 'Земля', '♠♠', '🪨', -5, 25],
  ['air', 'Воздух', '♣♣', '🌪️', 5, 15],
  ['steam', 'Пар', '♥♦', '♨️', 10, 10],
  ['lava', 'Лава', '♥♠', '🌋', 20, -5],
  ['fire_vortex', 'Огненный вихрь', '♥♣', '🔥🌪️', 15, 0],
  ['ice', 'Лёд', '♦♠', '❄️', 0, 20],
  ['thunderstorm', 'Гроза', '♦♣', '⛈️', 15, 5],
  ['sandstorm', 'Песчаная буря', '♠♣', '🌫️', 5, 15],
].map(([id, name, suits, icon, attackBonus, defenseBonus]) =>
  [id, Object.freeze({ id, name, suits, icon, attackBonus, defenseBonus })])));

export function elementOf(cards) {
  if (!cards || cards.length !== 2) return null;
  const suits = cards.map(c => c.s).sort().join('');
  return Object.values(ELEMENTS).find(e => [...e.suits].sort().join('') === suits) ?? null;
}
export const type = cards => elementOf(cards)?.icon ?? '—';
export const elementName = cards => elementOf(cards)?.name ?? '';

export function pairStats(cards) {
  const details = comboDetails(cards), element = elementOf(cards);
  if (!details || !element) return null;
  return { ...details, basePower: details.power, element: element.id,
    attack: Math.round(details.power * (1 + element.attackBonus / 100)),
    defense: Math.round(details.power * (1 + element.defenseBonus / 100)) };
}

// Роли пары задаются местом размещения: атака не даёт щит, защита не атакует.
export function lineStats(placement) {
  const attackPair = pairStats(placement.attack), defensePair = pairStats(placement.defense);
  if (!attackPair || !defensePair) throw new Error('В линии нужны атакующая и защитная пары');
  return { pairs: [attackPair, defensePair], attack: attackPair.attack,
    defense: defensePair.defense, baseAttack: attackPair.basePower,
    baseDefense: defensePair.basePower };
}

// Совместимая форма отчёта для существующих потребителей. Эффектов нет.
export function attackInfo(pair, defpair) {
  const a = pairStats(pair), d = pairStats(defpair);
  return { a: a?.attack ?? 0, d: d?.defense ?? 0,
    hit: Math.max(0, (a?.attack ?? 0) - (d?.defense ?? 0)),
    baseA: a?.basePower ?? 0, baseD: d?.basePower ?? 0,
    at: type(pair), dt: type(defpair), burn: 0, match: '' };
}
