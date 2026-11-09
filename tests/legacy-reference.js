// Эталонный порт легаси-кода v1.5 (дословный, без рефакторинга) — источник истины
// для property-теста: движок в src/game обязан давать те же числа.
export const legacyVal = (r) => (r === 'A' ? 11 : ['J', 'Q', 'K'].includes(r) ? 10 : +r);

export function legacyCombo(cards) {
  if (!cards || cards.length !== 2) return 0;
  let [a, b] = cards;
  let mul = 1;
  if (a.r === 'A' && b.r === 'A') mul = 2.5;
  else if (a.s === b.s && ['K', 'Q'].includes(a.r) && ['K', 'Q'].includes(b.r) && a.r !== b.r) mul = 2;
  else if ((a.r === 'A' && b.v === 10) || (b.r === 'A' && a.v === 10)) mul = 1.8;
  else if (a.r === b.r) mul = 1.6;
  else if (a.s === b.s) mul = 1.4;
  else if (Math.abs(a.v - b.v) === 1) mul = 1.2;
  return Math.round((a.v + b.v) * mul);
}

export function legacyType(cards) {
  if (!cards || cards.length !== 2) return '—';
  let a = cards.map((c) => c.s);
  if (a[0] === a[1]) return { '♥': '🔥', '♦': '💧', '♠': '🪨', '♣': '🌪️' }[a[0]];
  return a.includes('♥') ? '♨️' : '🌫️';
}

export function legacyAttackInfo(pair, defpair) {
  let a = legacyCombo(pair), d = legacyCombo(defpair), baseA = a, baseD = d;
  let at = legacyType(pair), dt = legacyType(defpair), burn = 0, match = '';
  if (at === '🔥' && dt === '🌪️') { a = Math.round(a * 1.0975); match = '🔥 Огонь > Воздух'; }
  else if (at === '🔥' && dt === '🪨') { a = Math.round(a * 0.9025); match = '🪨 Земля > Огонь'; }
  else if (at === '💧' && dt === '🪨') { a = Math.round(a * 1.0975); match = '💧 Вода > Земля'; }
  else if (at === '💧' && dt === '🌪️') { a = Math.round(a * 0.9025); match = '🌪️ Воздух > Вода'; }
  if (dt === '🪨') d = Math.round(d * 1.12);
  if (dt === '🌪️') d = Math.round(d * 1.05);
  if (dt === '🌫️') d = Math.round(d * 1.052);
  if (at === '💧') d = Math.round(d * 0.85);
  if (at === '♨️') d = Math.round(d * 0.925);
  if (dt === '🌪️' && (at === '💧' || at === '♨️')) d = Math.round(d * 1.08);
  let hit = Math.max(0, a - d);
  if ((at === '🔥' || at === '♨️') && hit > 0) burn = at === '🔥' ? 4 : 2;
  if (at === '🔥' && dt === '🪨') burn = Math.min(burn, 1);
  if (at === '♨️' && dt === '🌪️') burn = Math.min(burn, 1);
  return { hit, burn, at, dt, a, d, baseA, baseD, match };
}
