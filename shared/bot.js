import { pairStats } from './elements.js';

// Совместный подбор трёх атакующих и трёх защитных пар без повторов карт.
// Оценивается только характеристика, которая реально работает в выбранной роли.
export function rolePairs(cards, attackCount = 3, defenseCount = 3) {
  const memo = new Map();
  const stats = cards.map((a, i) => cards.map((b, j) => i < j ? pairStats([a, b]) : null));
  const solve = (mask, atk, def) => {
    if (!atk && !def) return { score: 0, attacks: [], defenses: [] };
    const used = mask.toString(2).replaceAll('0', '').length;
    if (cards.length - used < 2 * (atk + def)) return { score: -Infinity };
    const key = `${mask}:${atk}:${def}`;
    if (memo.has(key)) return memo.get(key);
    let i = 0; while (mask & (1 << i)) i++;
    let best = solve(mask | (1 << i), atk, def);
    for (let j = i + 1; j < cards.length; j++) {
      if (mask & (1 << j)) continue;
      const nextMask = mask | (1 << i) | (1 << j), pair = [cards[i], cards[j]];
      for (const role of ['attack', 'defense']) {
        if (!(role === 'attack' ? atk : def)) continue;
        const next = solve(nextMask, atk - (role === 'attack'), def - (role === 'defense'));
        const score = next.score + stats[i][j][role];
        if (score > best.score) best = { score,
          attacks: role === 'attack' ? [pair, ...next.attacks] : next.attacks,
          defenses: role === 'defense' ? [pair, ...next.defenses] : next.defenses };
      }
    }
    memo.set(key, best); return best;
  };
  return solve(0, attackCount, defenseCount);
}

export function botPlan(hand, playerBoard, botBoard) {
  const { attacks, defenses } = rolePairs(hand);
  attacks.sort((a, b) => pairStats(b).attack - pairStats(a).attack);
  defenses.sort((a, b) => pairStats(b).defense - pairStats(a).defense);
  const rank = board => [0, 1, 2].sort((a, b) =>
    (board.outer[a] + board.inner[a]) - (board.outer[b] + board.inner[b]) || a - b);
  const attackLanes = rank(playerBoard), defenseLanes = rank(botBoard);
  return [0, 1, 2].map(lane => ({ lane,
    attack: attacks[attackLanes.indexOf(lane)], defense: defenses[defenseLanes.indexOf(lane)] }));
}
