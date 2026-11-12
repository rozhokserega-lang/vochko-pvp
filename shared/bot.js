import { pairStats, elementOf } from './elements.js';
import { deal } from './cards.js';
import { resolveRound, cloneGameState } from './engine.js';

// ── Старый бот (совместимость с текущим сервером PvE) ──────────────────────
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

// ── Умный бот: beam search раскладок + Monte Carlo прогноз ──────────────────
// Не получает скрытую руку противника: только доски и свои карты.

const laneTarget = (board, l) => {
  if (board.outer[l] > 0) return { stage: 'outer', hp: board.outer[l], max: 12 };
  if (board.inner[l] > 0) return { stage: 'inner', hp: board.inner[l], max: 18 };
  return { stage: 'nexus', hp: board.nexus, max: 80 };
};

const isNegative = (s) => s && (s.burn || s.weakenAttack || s.weakenDefense);

// Контекстная ценность стихии в атаке (состояние линии противника).
function attackElementBonus(element, target, enemyStatuses, ownStatuses) {
  let bonus = 0;
  if (element === 'water') bonus += Math.min(3, enemyStatuses?.armor || 0) * 1.6; // снятие брони
  if (element === 'earth') bonus += (enemyStatuses?.weakenDefense || enemyStatuses?.armor) ? 2 : 1;
  if (element === 'fire') bonus += target.hp > 4 ? 3 : 1;                          // поджог 2
  if (element === 'lava') bonus += target.hp > 2 ? 3 : 1;                          // поджог 1 + пробой
  if (element === 'air' || element === 'steam') bonus += target.hp > 8 ? 3 : 1;    // ослабление защиты
  if (element === 'ice') bonus += target.hp > 8 ? 2.5 : 1;
  if (element === 'sandstorm') bonus += target.hp > 6 ? 2 : 1;                     // ослабление атаки
  if (element === 'thunderstorm') bonus += 4;                                      // +2 урона по другой башне
  if (element === 'fire_vortex') bonus += 2 + ([0, 1, 2].filter(j => Math.abs(j - (target.lane ?? 0)) === 1 && target.hp > 0).length); // разлёт
  return bonus;
}

// Контекстная ценность стихии в защите (состояние своей линии).
function defenseElementBonus(element, target, ownStatuses) {
  let bonus = 0;
  if (element === 'water') bonus += isNegative(ownStatuses) ? 9 : 2.5;             // очищение/лечение
  if (element === 'earth') bonus += 3 + (target.hp <= 8 ? 2 : 0);                  // броня 3
  if (element === 'ice') bonus += 3.5;                                             // −15% атаки врага
  if (element === 'sandstorm') bonus += 3;                                         // +4 щита
  if (element === 'steam') bonus += 2;                                             // −10% урона
  if (element === 'fire' || element === 'air') bonus += 1.5;                       // блок → ответ 2
  if (element === 'lava') bonus += 1.5;                                            // удар врага → ответ 2
  if (element === 'thunderstorm') bonus += 1.5;                                    // заряд атаки
  if (element === 'fire_vortex') bonus += 1;                                       // заслон ситуативен
  if (target.hp <= 6) bonus += 3;                                                  // критичная линия
  return bonus;
}

// Все пары руки со статами.
function handPairs(hand) {
  const pairs = [];
  for (let i = 0; i < hand.length; i++)
    for (let j = i + 1; j < hand.length; j++)
      pairs.push({ i, j, cards: [hand[i], hand[j]], stats: pairStats([hand[i], hand[j]]) });
  return pairs;
}

const SLOT_ORDER = ['attack', 'defense'].flatMap(role => [0, 1, 2].map(lane => ({ role, lane })));

// Beam search допустимых раскладок: 3 атакующие + 3 защитные пары, без повторов.
export function beamLayouts(hand, ownBoard, enemyBoard, {
  beamWidth = 28, perSlot = 10, count = 8, rng = Math.random, jitter = 6, enemyKnownDefense = null,
} = {}) {
  const pairs = handPairs(hand);
  let states = [{ used: new Set(), picks: [], score: 0 }];
  const slots = SLOT_ORDER;
  for (const { role, lane } of slots) {
    const next = [];
    const target = role === 'attack' ? laneTarget(enemyBoard, lane) : laneTarget(ownBoard, lane);
    const enemyStatuses = enemyBoard.statuses?.[lane] ?? {};
    const ownStatuses = ownBoard.statuses?.[lane] ?? {};
    for (const st of states) {
      const candidates = [];
      for (const p of pairs) {
        if (st.used.has(p.i) || st.used.has(p.j)) continue;
        let s;
        if (role === 'attack') {
          const estDef = enemyKnownDefense?.[lane] ?? 0; // известная (после reveal) или 0
          const projHit = Math.max(0, p.stats.attack - estDef);
          s = p.stats.attack + Math.min(projHit, target.hp) * 0.8
            + attackElementBonus(p.stats.element, { ...target, lane }, enemyStatuses, ownStatuses);
        } else {
          s = p.stats.defense * 0.9 + defenseElementBonus(p.stats.element, { ...target, lane }, ownStatuses);
        }
        candidates.push({ p, s: s + rng() * jitter });
      }
      candidates.sort((a, b) => b.s - a.s);
      for (const c of candidates.slice(0, perSlot)) {
        next.push({ used: new Set([...st.used, c.p.i, c.p.j]), picks: [...st.picks, { role, lane, pair: c.p }], score: st.score + c.s });
      }
    }
    next.sort((a, b) => b.score - a.score);
    states = next.slice(0, beamWidth);
  }
  // Раскладки → placements; дедуп по составу карт.
  const seen = new Set(), layouts = [];
  for (const st of states) {
    const atkLane = new Map(), defLane = new Map();
    for (const p of st.picks) (p.role === 'attack' ? atkLane : defLane).set(p.lane, p);
    const placements = [0, 1, 2].map(l => ({
      lane: l,
      attack: atkLane.get(l).pair.cards,
      defense: defLane.get(l).pair.cards,
    }));
    const key = placements.map(p => [...p.attack, ...p.defense].map(c => c.id).sort().join()).join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    layouts.push(placements);
    if (layouts.length >= count) break;
  }
  return layouts;
}

// Оценка позиции (чем больше, тем лучше для side).
export function evaluateState(state, side) {
  const me = state[side], en = state[side === 'a' ? 'b' : 'a'];
  const struct = b => b.nexus + b.outer.reduce((a, x) => a + Math.max(0, x), 0)
    + b.inner.reduce((a, x) => a + Math.max(0, x), 0);
  const opened = b => b.inner.filter(v => v <= 0).length; // линии, открытые к Нексусу
  return (me.nexus - en.nexus) * 2.2
    + (struct(me) - struct(en)) * 0.4
    + (opened(me) - opened(en)) * 5   // открытая линия противника — угроза мне
    + (isNegative(en.statuses?.[0]) ? 0 : 0); // статусы учитываются симуляцией
}

// Monte Carlo выбор хода: сэмплы рук противника (по правилам раздачи, без
// доступа к реальной скрытой руке), симуляция depth раундов тем же движком.
export function choosePlan({
  state, hand, side = 'a', rng = Math.random,
  layouts = 6, samples = 4, depth = 2, budgetMs = 700,
} = {}) {
  const t0 = Date.now();
  const enemySide = side === 'a' ? 'b' : 'a';
  const own = state[side], enemy = state[enemySide];
  // Кандидаты: оптимум старого бота (точный DP) + варианты beam search —
  // MC-оценка ранжирует их одинаковым моделированием.
  const candidates = [];
  const seenKey = (placements) => placements.map(p => [...p.attack, ...p.defense].map(c => c.id).sort().join()).join('|');
  const legacy = botPlan(hand, enemy, own);
  candidates.push(legacy);
  const legacyKey = seenKey(legacy);
  for (const layout of beamLayouts(hand, own, enemy, { count: layouts, rng })) {
    if (seenKey(layout) === legacyKey) continue;
    candidates.push(layout);
  }
  // Возможные руки противника: полная колода, 7 красных + 7 чёрных.
  // Модель ответа противника: точный DP-подбор (как у текущего боевого бота)
  // и beam-варианты — чередование, чтобы не переобучаться под один класс.
  const oppLayouts = Array.from({ length: samples }, (_, i) => {
    const oppHand = deal(rng);
    return i % 2 === 0
      ? botPlan(oppHand, state[side], state[enemySide])
      : beamLayouts(oppHand, enemy, own, { count: 1, rng, beamWidth: 12, perSlot: 8 })[0];
  });
  // Быстрый генератор для lookahead-раундов (без DP — экономия бюджета).
  const quick = (h, ownB, enemyB) =>
    beamLayouts(h, ownB, enemyB, { count: 1, rng, beamWidth: 8, perSlot: 5 })[0]
      ?? botPlan(h, enemyB, ownB);

  const turn = placements => ({ placements });
  let best = null;
  for (const plan of candidates) {
    if (best && Date.now() - t0 > budgetMs) break; // бюджет: берём лучший найденный
    let score = 0;
    for (const oppPlan of oppLayouts) {
      const sim = cloneGameState(state);
      const args = side === 'a' ? [turn(plan), turn(oppPlan)] : [turn(oppPlan), turn(plan)];
      let r = resolveRound(sim, args[0], args[1], { abilities: true, rng });
      if (!r.finished && depth > 1) {
        // Следующие раунды: свежие раздачи, быстрые greedy-раскладки обеих сторон.
        for (let d = 1; d < depth && !r.finished; d++) {
          const hSelf = deal(rng), hOpp = deal(rng);
          const pSelf = quick(hSelf, sim[side], sim[enemySide]);
          const pOpp = quick(hOpp, sim[enemySide], sim[side]);
          const a2 = side === 'a' ? [turn(pSelf), turn(pOpp)] : [turn(pOpp), turn(pSelf)];
          r = resolveRound(sim, a2[0], a2[1], { abilities: true, rng });
        }
      }
      score += evaluateState(sim, side);
    }
    score /= oppLayouts.length || 1;
    if (!best || score > best.score) best = { plan, score };
  }
  if (!best) { // безопасный переход на старый алгоритм
    best = { plan: botPlan(hand, enemy, own), score: 0, fallback: true };
  }
  best.plan = { placements: best.plan };
  best.stats = {
    ms: Date.now() - t0,
    candidates: candidates.length,
    samples: oppLayouts.length,
    depth,
    fallback: !!best.fallback,
  };
  return best;
}
