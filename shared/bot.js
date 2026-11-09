// Эвристика бота PvE — порт botPlan()/bestPairs() из legacy_v15.html.
// Чистая функция: рука бота + доски обеих сторон. Без DOM и без знания руки игрока.
import { combo } from './combos.js';

export function bestPairs(cards) {
  let best = -Infinity, answer = null;
  const recurse = (rem, pairs) => {
    if (pairs.length === 3) {
      const sc = pairs.reduce((a, p) => a + combo(p), 0);
      if (sc > best) { best = sc; answer = pairs.map((p) => [...p]); }
      return;
    }
    for (let i = 0; i < rem.length; i++)
      for (let j = i + 1; j < rem.length; j++)
        recurse(rem.filter((_, k) => k !== i && k !== j), [...pairs, [rem[i], rem[j]]]);
  };
  recurse(cards, []);
  return answer || [];
}

// hand — 14 карт бота; playerBoard — доска игрока (бьём слабейшие линии),
// botBoard — своя доска (лучшую защиту — на самую побитую линию).
export function botPlan(hand, playerBoard, botBoard) {
  const a = bestPairs(hand.filter((c) => c.s === '♥' || c.s === '♦'));
  const d = bestPairs(hand.filter((c) => c.s === '♠' || c.s === '♣'));
  const lanes = [0, 1, 2];
  const score = (i) =>
    (playerBoard.inner[i] <= 0 ? 50 : 0) +
    (playerBoard.outer[i] <= 0 ? 20 : 0) +
    (12 - playerBoard.outer[i]) * 0.6 +
    (18 - playerBoard.inner[i]) * 0.4;
  lanes.sort((x, y) => score(y) - score(x));
  a.sort((x, y) => combo(y) - combo(x));
  const out = Array.from({ length: 3 }, () => ({ attack: [], defense: [] }));
  lanes.forEach((l, i) => { out[l].attack = a[i] ?? []; });
  const defensive = [0, 1, 2].sort((x, y) => botBoard.outer[x] - botBoard.outer[y]);
  d.sort((x, y) => combo(y) - combo(x));
  defensive.forEach((l, i) => { out[l].defense = d[i] ?? []; });
  return [0, 1, 2].map((l) => ({ lane: l, attack: out[l].attack, defense: out[l].defense }));
}
