import { pairStats } from './elements.js';

export function bestPairs(cards, count = Math.floor(cards.length / 2)) {
  const memo = new Map();
  const score = (i, j) => { const p = pairStats([cards[i], cards[j]]); return p.attack + p.defense; };
  const solve = (mask, n) => {
    if (!n) return { score: 0, pairs: [] };
    if (cards.length - mask.toString(2).replaceAll('0', '').length < n * 2) return { score: -Infinity, pairs: [] };
    const key = mask + ':' + n;
    if (memo.has(key)) return memo.get(key);
    let i = 0; while (mask & (1 << i)) i++;
    let best = solve(mask | (1 << i), n);
    for (let j = i + 1; j < cards.length; j++) {
      if (mask & (1 << j)) continue;
      const next = solve(mask | (1 << i) | (1 << j), n - 1);
      const total = score(i, j) + next.score;
      if (total > best.score) best = { score: total, pairs: [[cards[i], cards[j]], ...next.pairs] };
    }
    memo.set(key, best); return best;
  };
  return solve(0, count).pairs;
}

export function botPlan(hand, playerBoard, _botBoard) {
  const pairs = bestPairs(hand, 6).sort((a, b) => pairStats(b).attack - pairStats(a).attack);
  const lanes = [0, 1, 2].sort((a, b) =>
    (playerBoard.outer[a] + playerBoard.inner[a]) - (playerBoard.outer[b] + playerBoard.inner[b]));
  return lanes.map((lane, i) => ({ lane, attack: pairs[i], defense: pairs[5 - i] })).sort((a, b) => a.lane - b.lane);
}
