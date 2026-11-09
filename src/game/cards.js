// ВОЧКО: Три линии — карты и раздача. Портировано 1:1 из legacy_v15.html.
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

// Рука раунда: 7 красных (♥♦) и 7 чёрных (♠♣) из одной перемешанной колоды.
// Внутри руки карты уникальны; между руками разных игроков совпадения допустимы.
export function deal(rng = Math.random) {
  const d = shuffled(deck(), rng);
  const reds = d.filter((c) => c.s === '♥' || c.s === '♦').slice(0, 7);
  const blacks = d.filter((c) => c.s === '♠' || c.s === '♣').slice(0, 7);
  return [...reds, ...blacks];
}
