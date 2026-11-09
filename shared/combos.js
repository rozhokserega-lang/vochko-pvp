// Комбинации пары — строгий приоритет сверху вниз, множители не складываются.
// Портировано 1:1 из legacy_v15.html (combo()/comboDetails()).
export function multiplier(a, b) {
  if (a.r === 'A' && b.r === 'A') return { m: 2.5, name: 'Два туза' };
  if (a.s === b.s && ['K','Q'].includes(a.r) && ['K','Q'].includes(b.r) && a.r !== b.r)
    return { m: 2, name: 'Король + дама одной масти' };
  if ((a.r === 'A' && b.v === 10) || (b.r === 'A' && a.v === 10))
    return { m: 1.8, name: 'Туз + карта на 10' };
  if (a.r === b.r) return { m: 1.6, name: 'Одинаковый номинал' };
  if (a.s === b.s) return { m: 1.4, name: 'Одна масть' };
  if (Math.abs(a.v - b.v) === 1) return { m: 1.2, name: 'Соседние значения' };
  return { m: 1, name: 'Обычная пара' };
}

export function combo(cards) {
  if (!cards || cards.length !== 2) return 0;
  const [a, b] = cards;
  const { m } = multiplier(a, b);
  return Math.round((a.v + b.v) * m);
}

export function comboDetails(cards) {
  if (!cards || cards.length !== 2) return null;
  const [a, b] = cards;
  const { m, name } = multiplier(a, b);
  return { base: a.v + b.v, m, name, power: combo(cards) };
}
