// ВОЧКО: Три линии — карты и раздача. Портировано 1:1 из legacy_v15.html.
// Раздача: полностью случайная рука из колоды 52 (без баланса цветов);
// историческая схема 7 красных + 7 чёрных сохранена как dealBalancedLegacy
// для A/B-симуляций. Размер руки параметризован (подготовка к Ядру Нексуса).
export const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
export const SUITS = ['♥','♦','♠','♣'];

export const cardValue = (r) => (r === 'A' ? 11 : r === 'J' || r === 'Q' || r === 'K' ? 10 : +r);

export function deck() {
  return SUITS.flatMap((s) => RANKS.map((r) => ({ id: s + r, s, r, v: cardValue(r) })));
}

// Fisher–Yates; rng внедряется (сервер — доверенный источник, тесты — seeded).
export function shuffled(list, rng = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Полностью случайная рука: handSize случайных РАЗЛИЧНЫХ карт из 52.
// Без гарантий по цветам и мастям; любая пара мастей образует одну из 10 стихий.
// handSize параметризован: сегодня 14, в будущем (Ядро Нексуса) — 13.
export function deal(rng = Math.random, handSize = 14) {
  const size = Math.min(Math.max(0, handSize), 52);
  return shuffled(deck(), rng).slice(0, size);
}

// Историческая раздача (7 красных + 7 чёрных) — только для A/B-симуляций
// и сравнения распределений. В игре не используется.
export function dealBalancedLegacy(rng = Math.random) {
  const d = shuffled(deck(), rng);
  const reds = d.filter((c) => c.s === '♥' || c.s === '♦').slice(0, 7);
  const blacks = d.filter((c) => c.s === '♠' || c.s === '♣').slice(0, 7);
  return [...reds, ...blacks];
}
