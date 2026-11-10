// Стихии и контрстихии — портировано 1:1 из legacy_v15.html (type()/attackInfo()).
// Каждое промежуточное округление (Math.round) сохранено в точности как в исходнике.
import { combo } from '../shared/combos.js';

export const SUIT_ELEMENT = { '♥': '🔥', '♦': '💧', '♠': '🪨', '♣': '🌪️' };
const ELEMENT_NAME = { '🔥': 'ОГОНЬ', '💧': 'ВОДА', '🪨': 'ЗЕМЛЯ', '🌪️': 'ВОЗДУХ', '♨️': 'ПАР', '🌫️': 'БУРЯ' };

export function type(cards) {
  if (!cards || cards.length !== 2) return '—';
  const a = cards[0].s, b = cards[1].s;
  if (a === b) return SUIT_ELEMENT[a];
  return a === '♥' || b === '♥' ? '♨️' : '🌫️';
}

export function elementName(cards) {
  if (!cards || cards.length !== 2) return '';
  return ELEMENT_NAME[type(cards)] || '';
}

// a — атакующая пара, defpair — защитная пара. Возвращает полный расчёт линии.
export function attackInfo(pair, defpair) {
  let a = combo(pair), d = combo(defpair);
  const baseA = a, baseD = d;
  const at = type(pair), dt = type(defpair);
  let match = '';
  // Контрстихии: +9.75% выгодная атака, −9.75% невыгодная.
  if (at === '🔥' && dt === '🌪️') { a = Math.round(a * 1.0975); match = '🔥 Огонь > Воздух'; }
  else if (at === '🔥' && dt === '🪨') { a = Math.round(a * 0.9025); match = '🪨 Земля > Огонь'; }
  else if (at === '💧' && dt === '🪨') { a = Math.round(a * 1.0975); match = '💧 Вода > Земля'; }
  else if (at === '💧' && dt === '🌪️') { a = Math.round(a * 0.9025); match = '🌪️ Воздух > Вода'; }
  // Базовые способности стихий защиты.
  if (dt === '🪨') d = Math.round(d * 1.12);
  if (dt === '🌪️') d = Math.round(d * 1.05);
  if (dt === '🌫️') d = Math.round(d * 1.052);
  if (at === '💧') d = Math.round(d * 0.85);
  if (at === '♨️') d = Math.round(d * 0.925);
  if (dt === '🌪️' && (at === '💧' || at === '♨️')) d = Math.round(d * 1.08);
  const hit = Math.max(0, a - d);
  let burn = 0;
  if ((at === '🔥' || at === '♨️') && hit > 0) burn = at === '🔥' ? 4 : 2;
  if (at === '🔥' && dt === '🪨') burn = Math.min(burn, 1);
  if (at === '♨️' && dt === '🌪️') burn = Math.min(burn, 1);
  return { hit, burn, at, dt, a, d, baseA, baseD, match };
}
