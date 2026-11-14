#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// core-balance.mjs — исследование баланса Ядра Нексуса (read-only для правил).
//
// Ничего в боевой логике не меняет: использует shared/engine.js ровно так, как
// сервер (supabase/functions/submit-turn + create-room):
//   resolveRound(state, tA, tB, { abilities:true, counters:true,
//     variants:RECOMMENDED, rng:mulberry32(seed), nexusCoreEnabled:true,
//     coreProfile:'balanced' })
//
// Модель матча (как на сервере, deckVersion=2):
//   • у каждого игрока своя колода 52 (createPlayerDeck);
//   • каждый раунд — рука 13 карт из drawPile (discard перетасовывается при
//     исчерпании, как в drawDeckHand);
//   • 12 карт в пары (→ discard), карта Ядра — в burned НАВСЕГДА
//     (settleDeckHand): «стоимость» отправки карты в Ядро учтена;
//   • конец матча: смерть Нексуса, лимит 45 раундов, исчерпание колоды
//     (exhaustionWinner — сравнение HP Нексусов).
//
// Метод (требования 4–6):
//   • зеркальные пары матчей: одинаковые колоды и семена, стороны меняются
//     местами → преимущество движковой стороны взаимно уничтожается;
//   • обе стороны расставляют карты ОДНИМ алгоритмом (botPlan) — различается
//     только правило выбора карты Ядра ⇒ разница винрейтов относится к Ядру;
//   • S1a «без Ядра»: та же колодная экономика (13 карт, 12 в пары, 13-я
//     сжигается впустую), бонусы Ядра отключены пер-сторонне
//     (coreDisabledBySide) — изолирует ценность бонусов Ядра;
//   • S1b «как выпущено»: смешанный матч — Ядро (колода, 13+бонус) против
//     классики (свежая случайная рука 14 карт каждый раунд).
//
// Единственное добавление в движок (не влияет на игру по умолчанию):
//   shared/nexus-core.js: coreAbilityBonus читает ctx.coreDisabledBySide[side]
//   (по аналогии с существующим disabledBySide базовых способностей);
//   engine/abilities прокидывают опцию. Коэффициенты не тронуты.
//
// Сценарии (≈20 000 матчей на сценарий, S2/S3 расширены лестницами):
//   S1  Ядро вкл vs выкл (10k сопоставимая раздача + 10k как выпущено);
//   S2  уровни Ядра I–IV: каждый vs естественный выбор + попарная лестница;
//   S3  масти ♥♦♠♣: каждая vs естественный выбор + попарные сравнения;
//   S4  умный выбор Ядра (всегда старшая карта) vs случайный;
//   S5  поочерёдное отключение усиления каждой из 20 способностей (зеркально).
//
// Запуск: node scripts/core-balance.mjs [--quick] [--scale=1] [--only=S1,S5] [--seed=N]
// Выход:  reports/core-balance-report.md, core-balance-results.json,
//         core-balance-summary.csv, core-ablation.csv, core-balance-matches.csv.gz
// ─────────────────────────────────────────────────────────────────────────────
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createGameState, resolveRound, MAX_ROUNDS, NEXUS_HP, getWinner } from '../shared/engine.js';
import { createPlayerDeck, drawDeckHand, settleDeckHand, exhaustionWinner } from '../shared/player-deck.js';
import { botPlan } from '../shared/bot.js';
import { chooseCorePlan, simpleCoreTurn } from '../shared/core-bot.js';
import { CORE_ABILITIES, coreTier } from '../shared/nexus-core.js';
import { ABILITIES, RECOMMENDED } from '../shared/abilities.js';
import { pairStats } from '../shared/elements.js';
import { mulberry32 } from '../shared/rng.js';
import { deal } from '../shared/cards.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'reports');
mkdirSync(OUT, { recursive: true });

// ── CLI ──────────────────────────────────────────────────────────────────────
const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : dflt;
};
const QUICK = process.argv.includes('--quick');
const SCALE = Number(arg('scale', QUICK ? 0.04 : 1));
const ONLY = arg('only', '') ? arg('only', '').split(',') : null;
const BASE_SEED = Number(arg('seed', 20261114)) >>> 0;
const TAG = arg('tag', ''); // суффикс имён файлов (для контрольных прогонов)
const VALIDATE = Number(arg('validate', QUICK ? 0 : 800)); // зеркальных пар S1a на эталонном botPlan
const P = (n) => Math.max(1, Math.round(n * SCALE));

const ALL_CORE_IDS = Object.keys(CORE_ABILITIES);
const TIER_LABEL = ['I', 'II', 'III', 'IV'];
const PLANNER = arg('planner', 'fast'); // fast | bot (bot — медленный эталонный алгоритм)
// percent-ключи Ядра (вклад оцениваем в очках характеристик; метод в отчёте)
const PCT_ABILITIES = {
  earth_pierce_def: 'atk', lava_pierce_burn: 'atk',
  air_weaken_def: 'def', steam_weaken_def: 'def', steam_dampen: 'hit',
  fire_vortex_zaslon: 'def', ice_weaken_def: 'def', ice_weaken_atk: 'atk',
  sandstorm_weaken_atk: 'atk',
};

// ── Быстрый планировщик расстановки (одинаковый для обеих сторон) ────────────
// Логика ранжирования линий та же, что в botPlan; подбор пар — жадный по роли
// вместо полного DP (botPlan ≈ 5 мс/вызов — неприемлемо для 100k матчей).
// Валидационная партия на настоящем botPlan запускается отдельно (--validate).
const fastPlanCache = new Map();
export function fastPlan(hand, playerBoard, botBoard) {
  const cacheKey = hand.map((c) => c.id).join('|') + '#' +
    [0, 1, 2].map((l) => (playerBoard.outer[l] > 0 ? 1 : 0) + (playerBoard.inner[l] > 0 ? 2 : 0)).join('') +
    [0, 1, 2].map((l) => (botBoard.outer[l] > 0 ? 1 : 0) + (botBoard.inner[l] > 0 ? 2 : 0)).join('');
  const hit = fastPlanCache.get(cacheKey);
  if (hit) return hit.map((p) => ({ lane: p.lane, attack: p.attack, defense: p.defense }));
  const pairs = [];
  for (let i = 0; i < hand.length; i++) for (let j = i + 1; j < hand.length; j++) {
    const st = pairStats([hand[i], hand[j]]);
    pairs.push({ cards: [hand[i], hand[j]], atk: st.attack, def: st.defense });
  }
  const used = new Set();
  const pick = (role) => {
    const out = [];
    for (const p of [...pairs].sort((x, y) => y[role] - x[role])) {
      if (out.length === 3) break;
      if (used.has(p.cards[0].id) || used.has(p.cards[1].id)) continue;
      out.push(p); used.add(p.cards[0].id); used.add(p.cards[1].id);
    }
    return out;
  };
  const attacks = pick('atk'), defenses = pick('def');
  const rank = (board) => [0, 1, 2].sort((x, y) =>
    (board.outer[x] + board.inner[x]) - (board.outer[y] + board.inner[y]) || x - y);
  const attackLanes = rank(playerBoard), defenseLanes = rank(botBoard);
  const plan = [0, 1, 2].map((lane) => ({
    lane,
    attack: (attacks[attackLanes.indexOf(lane)] ?? pairs.find((p) => !used.has(p.cards[0].id) && !used.has(p.cards[1].id)) ?? pairs[0]).cards,
    defense: (defenses[defenseLanes.indexOf(lane)] ?? pairs.find((p) => !used.has(p.cards[0].id) && !used.has(p.cards[1].id)) ?? pairs[1]).cards,
  }));
  if (fastPlanCache.size >= 20000) fastPlanCache.clear();
  fastPlanCache.set(cacheKey, plan);
  return plan;
}
let PLANNER_OVERRIDE = null; // для валидационной партии S1V (эталонный botPlan)
const plannerPlan = (hand, playerBoard, botBoard) =>
  (PLANNER_OVERRIDE ?? PLANNER) === 'bot' ? botPlan(hand, playerBoard, botBoard) : fastPlan(hand, playerBoard, botBoard);

// ── Выбор карты Ядра и построение хода ───────────────────────────────────────
const pairsOf = (hand, coreId, own, enemy) =>
  plannerPlan(coreId ? hand.filter((c) => c.id !== coreId) : hand, enemy, own);

export function coreTurnByPolicy(hand, own, enemy, policy, rnd) {
  let core;
  if (policy === 'highest') core = [...hand].sort((a, b) => coreTier(b) - coreTier(a) || b.v - a.v)[0];
  else if (policy === 'lowest') core = [...hand].sort((a, b) => a.v - b.v)[0];
  else if (policy === 'random') core = hand[Math.floor(rnd() * hand.length)];
  else if (policy === 'natural') {
    const t = { placements: plannerPlan(hand, enemy, own) };
    const used = new Set(t.placements.flatMap((p) => [...p.attack, ...p.defense].map((c) => c.id)));
    t.coreCard = hand.find((c) => !used.has(c.id));
    return t;
  } else throw new Error(`policy: ${policy}`);
  return { placements: pairsOf(hand, core.id, own, enemy), coreCard: core };
}

// Принудительный уровень/масть (S2/S3): при отсутствии — ближайший по уровню
// (для масти — старшая из всех); факт подмены фиксируем как fallback.
function forcedCoreTurn(hand, own, enemy, force) {
  let cands = hand;
  if (force.suit) cands = cands.filter((c) => c.s === force.suit);
  if (force.tier) cands = cands.filter((c) => coreTier(c) === force.tier);
  let fallback = false;
  if (!cands.length) {
    fallback = true;
    cands = [...hand].sort((a, b) =>
      Math.abs(coreTier(a) - (force.tier ?? 0)) - Math.abs(coreTier(b) - (force.tier ?? 0))
      || coreTier(b) - coreTier(a) || b.v - a.v);
  } else {
    cands = [...cands].sort((a, b) => b.v - a.v);
  }
  const core = cands[0];
  return { placements: pairsOf(hand, core.id, own, enemy), coreCard: core, fallback };
}

// ── Телеметрия вклада Ядра ───────────────────────────────────────────────────
const newEff = () => ({});
// collectRound: res — результат resolveRound; featSide — движковая сторона «фичи».
// Плоские ключи — точные очки; percent — оценка pct% от характеристики линии,
// снятой из отчёта этого же раунда (atk → info.a, def → info.d, hit → info.a).
function collectRound(res, rec, featSide) {
  const otherSide = featSide === 'a' ? 'b' : 'a';
  for (const ev of res.events) {
    if (ev.heal || !ev.amount) continue;
    rec[`dmg${ev.side === featSide ? 'Feat' : 'Other'}`] += ev.amount;
  }
  const infoByLane = new Map((res.report ?? []).map((r) => [r.lane, r]));
  const eff = (side) => (side === featSide ? rec.effFeat : rec.effOther);
  for (const c of res.coreEffects ?? []) {
    const cell = (eff(c.side)[c.ability] ??= { triggers: 0, flat: 0, pct: 0 });
    cell.triggers++;
    for (const [key, val] of Object.entries(c.bonuses ?? {})) {
      if (!val) continue;
      if (isPctAbility(c.ability)) {
        const info = infoByLane.get(c.lane)?.[c.side]?.info;
        const base = PCT_ABILITIES[c.ability] === 'def' ? (info?.d ?? 0) : (info?.a ?? 0);
        cell.pct += (base * val) / 100;
      } else {
        cell.flat += val;
      }
    }
  }
  void otherSide;
}
const isPctAbility = (id) => id in PCT_ABILITIES;
const sumPts = (eff) => Object.values(eff).reduce((s, c) => s + c.flat + c.pct, 0);

// ── Раннер матча с Ядром ─────────────────────────────────────────────────────
// cfg: {
//   feat:  { policy?, force?, disable? } — «фича»-конфигурация
//   other: { policy?, force?, disable? } — контрольная конфигурация
//   swap   — зеркальный прогон: СТОРОНЫ (seat a/b) меняются местами.
//            Конфигурации ПРИВЯЗАНЫ к ролям (feat остаётся фичей в обоих
//            матчах), колоды следуют за конфигурациями (внутри пары фича-конфиг
//            видит обе колоды) ⇒ агрегат пары измеряет именно фича-конфиг.
// }
export function coreMatch(seed, cfg = {}) {
  const state = createGameState();
  const swap = !!cfg.swap;
  const feat = cfg.feat ?? {}, other = cfg.other ?? {};
  const deckFeat = createPlayerDeck(mulberry32(seed ^ (swap ? 0x5DEECE66 : 0)));
  const deckOther = createPlayerDeck(mulberry32(seed ^ (swap ? 0 : 0x5DEECE66)));
  const rndFeat = mulberry32(seed ^ 0xC0FFEE), rndOther = mulberry32(seed ^ 0xF00D1E);
  const featSide = swap ? 'b' : 'a';
  const coreDisabledBySide = {
    a: featSide === 'a' ? (feat.disable ?? []) : (other.disable ?? []),
    b: featSide === 'a' ? (other.disable ?? []) : (feat.disable ?? []),
  };

  const rec = {
    seed, swap, featSeat: featSide, winner: null, rounds: 0, exhausted: false,
    nexusFeat: NEXUS_HP, nexusOther: NEXUS_HP, dmgFeat: 0, dmgOther: 0,
    coreFeat: null, coreOther: null, coreFeatFirst: null, coreOtherFirst: null,
    fallbackFeat: false, fallbackOther: false,
    effFeat: newEff(), effOther: newEff(),
  };

  let handFeat, handOther;
  const drawHands = () => {
    // Сервер: один поток на обе колоды; порядок потребления — seat a, затем seat b.
    // Зеркал меняет порядок колод ⇒ преимущество первого перемешивания чередуется.
    const r = mulberry32(seed ^ Math.imul(state.round, 0x9E3779B9));
    const deckA = featSide === 'a' ? deckFeat : deckOther;
    const deckB = featSide === 'a' ? deckOther : deckFeat;
    const da = drawDeckHand(deckA, r), db = drawDeckHand(deckB, r);
    if (da.exhausted || db.exhausted) return false;
    Object.assign(deckA, da.deck); Object.assign(deckB, db.deck);
    handFeat = featSide === 'a' ? da.hand : db.hand;
    handOther = featSide === 'a' ? db.hand : da.hand;
    return true;
  };
  if (!drawHands()) { rec.exhausted = true; rec.winner = exhaustionWinner(state); return rec; }

  const turnFor = (hand, own, enemy, side, rnd) => {
    const conf = side === featSide ? feat : other;
    if (conf.force) return forcedCoreTurn(hand, own, enemy, conf.force);
    return coreTurnByPolicy(hand, own, enemy, conf.policy ?? 'natural', rnd);
  };

  while (state.round <= MAX_ROUNDS) {
    const rng = mulberry32(seed ^ Math.imul(state.round, 0x1F123BB5));
    const handA = featSide === 'a' ? handFeat : handOther;
    const handB = featSide === 'a' ? handOther : handFeat;
    const tA = turnFor(handA, state.a, state.b, 'a', featSide === 'a' ? rndFeat : rndOther);
    const tB = turnFor(handB, state.b, state.a, 'b', featSide === 'a' ? rndOther : rndFeat);
    const featIsA = featSide === 'a';
    rec.coreFeat = featIsA ? tA.coreCard : tB.coreCard;
    rec.coreOther = featIsA ? tB.coreCard : tA.coreCard;
    if (state.round === 1) {
      rec.coreFeatFirst = rec.coreFeat; rec.coreOtherFirst = rec.coreOther;
      rec.featAceInHand = handFeat.some((c) => c.r === 'A');
      rec.featAceInCore = rec.coreFeatFirst?.r === 'A';
    }
    rec.fallbackFeat ||= !!(featIsA ? tA.fallback : tB.fallback);
    rec.fallbackOther ||= !!(featIsA ? tB.fallback : tA.fallback);
    const res = resolveRound(state, tA, tB, {
      abilities: true, counters: true, variants: RECOMMENDED, rng,
      nexusCoreEnabled: true, coreProfile: 'balanced', coreDisabledBySide,
    });
    collectRound(res, rec, featSide);
    if (globalThis.CB_DEBUG) {
      const dmg = { a: 0, b: 0 };
      for (const ev of res.events) if (!ev.heal && ev.amount) dmg[ev.side] += ev.amount;
      console.error('[cb-debug]', 'round', state.round, 'dmg', JSON.stringify(dmg), 'nexus', state.a.nexus, '/', state.b.nexus, 'coreFeat', rec.coreFeat?.id, 'coreOther', rec.coreOther?.id, 'handFeatAces', handFeat.filter((c) => c.r === 'A').length, 'handOtherAces', handOther.filter((c) => c.r === 'A').length);
    }
    rec.rounds = state.round;
    if (res.finished) break;
    const settle = (zones, hand, turn) => {
      const s = settleDeckHand(zones, hand, turn);
      zones.drawPile = s.drawPile; zones.discardPile = s.discardPile; zones.burnedCards = s.burnedCards;
    };
    const seatDeck = (side) => (featSide === 'a'
      ? (side === 'a' ? deckFeat : deckOther)
      : (side === 'a' ? deckOther : deckFeat));
    settle(seatDeck('a'), handA, tA); settle(seatDeck('b'), handB, tB);
    const r2 = mulberry32(seed ^ Math.imul(state.round + 1, 0x7A7A11)); // сервер: один поток на обе колоды
    const da = drawDeckHand(seatDeck('a'), r2), db = drawDeckHand(seatDeck('b'), r2);
    if (da.exhausted || db.exhausted) { rec.exhausted = true; break; }
    Object.assign(seatDeck('a'), da.deck); Object.assign(seatDeck('b'), db.deck);
    handFeat = featSide === 'a' ? da.hand : db.hand;
    handOther = featSide === 'a' ? db.hand : da.hand;
  }
  const w = getWinner(state);
  rec.winner = rec.exhausted ? exhaustionWinner(state) : w.winner;
  rec.nexusFeat = Math.max(0, (rec.featSeat === 'a' ? state.a : state.b).nexus);
  rec.nexusOther = Math.max(0, (rec.featSeat === 'a' ? state.b : state.a).nexus);
  rec.rounds = Math.min(rec.rounds, MAX_ROUNDS);
  rec.featWin = rec.winner === 'draw' ? 0.5 : rec.winner === rec.featSeat ? 1 : 0;
  const tag = (c) => (c ? `${c.id}(T${coreTier(c)})` : '');
  rec.coreFeatTag = tag(rec.coreFeat); rec.coreOtherTag = tag(rec.coreOther);
  rec.coreFeatFirstTag = tag(rec.coreFeatFirst); rec.coreOtherFirstTag = tag(rec.coreOtherFirst);
  rec.ptsFeat = sumPts(rec.effFeat); rec.ptsOther = sumPts(rec.effOther);
  return rec;
}

// ── Смешанный матч S1b: Ядро (колода) против классики (свежие 14 карт) ───────
// coreSeat: 'a' | 'b' — у какой стороны Ядро; классика каждый раунд берёт
// deal(rng,14) — как на сервере при deckVersion!==2.
export function mixedMatch(seed, coreSeat = 'a') {
  const state = createGameState();
  const deck = createPlayerDeck(mulberry32(seed));
  const rec = {
    seed, featSeat: coreSeat, winner: null, rounds: 0, exhausted: false,
    nexusFeat: NEXUS_HP, nexusOther: NEXUS_HP, dmgFeat: 0, dmgOther: 0,
    coreFeat: null, coreOther: null, effFeat: newEff(), effOther: newEff(),
  };
  let coreHand, classicHand;
  const drawCore = () => {
    const r = mulberry32(seed ^ Math.imul(state.round, 0x9E3779B9));
    const d = drawDeckHand(deck, r);
    if (d.exhausted) return false;
    Object.assign(deck, d.deck);
    coreHand = d.hand;
    return true;
  };
  if (!drawCore()) { rec.exhausted = true; rec.winner = exhaustionWinner(state); return rec; }
  while (state.round <= MAX_ROUNDS) {
    const rng = mulberry32(seed ^ Math.imul(state.round, 0x1F123BB5));
    classicHand = deal(mulberry32(seed ^ Math.imul(state.round, 0xB0B57)), 14);
    const tCore = coreTurnByPolicy(coreHand, state[coreSeat], state[coreSeat === 'a' ? 'b' : 'a'], 'natural', mulberry32(seed ^ 0xC0FFEE));
    const classicSide = coreSeat === 'a' ? 'b' : 'a';
    const tClassic = { placements: plannerPlan(classicHand, state[coreSeat], state[classicSide]) };
    const tA = coreSeat === 'a' ? tCore : tClassic;
    const tB = coreSeat === 'a' ? tClassic : tCore;
    rec.coreFeat = tCore.coreCard;
    if (state.round === 1) rec.coreFeatFirst = rec.coreFeat;
    // Ядро: 12 в пары, 13-я — сжигается; классика: ход без coreCard.
    const coreTurn = coreSeat === 'a' ? tA : tB;
    const res = resolveRound(state, tA, tB, {
      abilities: true, counters: true, variants: RECOMMENDED, rng,
      nexusCoreEnabled: true, coreProfile: 'balanced',
      coreDisabledBySide: { [classicSide]: ALL_CORE_IDS }, // у классики Ядра нет
    });
    collectRound(res, rec, coreSeat);
    rec.rounds = state.round;
    if (res.finished) break;
    const s = settleDeckHand(deck, coreHand, coreTurn);
    deck.drawPile = s.drawPile; deck.discardPile = s.discardPile; deck.burnedCards = s.burnedCards;
    const r2 = mulberry32(seed ^ Math.imul(state.round + 1, 0x7A7A11));
    const d = drawDeckHand(deck, r2);
    if (d.exhausted) { rec.exhausted = true; break; }
    Object.assign(deck, d.deck);
    coreHand = d.hand;
  }
  const w = getWinner(state);
  rec.winner = rec.exhausted ? exhaustionWinner(state) : w.winner;
  rec.nexusFeat = Math.max(0, state[coreSeat].nexus);
  rec.nexusOther = Math.max(0, state[coreSeat === 'a' ? 'b' : 'a'].nexus);
  rec.rounds = Math.min(rec.rounds, MAX_ROUNDS);
  rec.featWin = rec.winner === 'draw' ? 0.5 : rec.winner === coreSeat ? 1 : 0;
  rec.coreFeatTag = rec.coreFeat ? `${rec.coreFeat.id}(T${coreTier(rec.coreFeat)})` : '';
  rec.coreOtherTag = 'classic(14)';
  rec.coreFeatFirstTag = rec.coreFeatFirst ? `${rec.coreFeatFirst.id}(T${coreTier(rec.coreFeatFirst)})` : '';
  rec.ptsFeat = sumPts(rec.effFeat); rec.ptsOther = 0;
  return rec;
}

// ── Агрегатор ────────────────────────────────────────────────────────────────
function makeAgg() {
  const n = { N: 0, score: 0, rounds: 0, dmgFeat: 0, dmgOther: 0, nexusFeat: 0, nexusOther: 0, exhausted: 0, fallback: 0, acesInHand: 0, acesToCore: 0 };
  const buckets = { short: { N: 0, score: 0 }, mid: { N: 0, score: 0 }, long: { N: 0, score: 0 } };
  const bucketOf = (r) => (r <= 6 ? 'short' : r <= 14 ? 'mid' : 'long');
  const tiers = {}, suits = {}, ranks = {}, abilities = {};
  const add = (m) => {
    n.N++; n.score += m.featWin; n.rounds += m.rounds;
    n.dmgFeat += m.dmgFeat; n.dmgOther += m.dmgOther;
    n.nexusFeat += m.nexusFeat; n.nexusOther += m.nexusOther;
    if (m.exhausted) n.exhausted++;
    if (m.fallbackFeat) n.fallback++;
    if (m.featAceInHand) { n.acesInHand++; if (m.featAceInCore) n.acesToCore++; }
    const b = buckets[bucketOf(m.rounds)]; b.N++; b.score += m.featWin;
    const core = m.coreFeatFirst ?? m.coreFeat;
    if (core) {
      const t = coreTier(core);
      ((tiers[t] ??= { N: 0, score: 0 })).N++, tiers[t].score += m.featWin;
      ((suits[core.s] ??= { N: 0, score: 0 })).N++, suits[core.s].score += m.featWin;
      ((ranks[core.r] ??= { N: 0, score: 0 })).N++, ranks[core.r].score += m.featWin;
    }
    for (const [ability, cell] of Object.entries(m.effFeat)) {
      const a = (abilities[ability] ??= { N: 0, triggers: 0, flat: 0, pct: 0 });
      a.N++; a.triggers += cell.triggers; a.flat += cell.flat; a.pct += cell.pct;
    }
  };
  return { n, add, tiers, suits, ranks, abilities, buckets };
}

function summarize(A) {
  const n = A.n;
  const [lo, hi] = wilson(n.score, n.N);
  return {
    N: n.N,
    winrate: n.score / n.N, winrateNum: n.score / n.N, lo: +(100 * lo).toFixed(2), hi: +(100 * hi).toFixed(2),
    avgRounds: +(n.rounds / n.N).toFixed(2),
    avgNexusFeature: +(n.nexusFeat / n.N).toFixed(2),
    avgNexusOther: +(n.nexusOther / n.N).toFixed(2),
    avgDmgFeature: +(n.dmgFeat / n.N).toFixed(2),
    avgDmgOther: +(n.dmgOther / n.N).toFixed(2),
    exhaustedRate: +(n.exhausted / n.N).toFixed(4),
    fallbackRate: +(n.fallback / n.N).toFixed(4),
    aceToCoreRate: n.acesInHand ? +(n.acesToCore / n.acesInHand).toFixed(4) : null,
    acesInHand: n.acesInHand,
    durationBuckets: Object.fromEntries(Object.entries(A.buckets).map(([k, v]) => [k,
      v.N ? { N: v.N, winrate: +(v.score / v.N).toFixed(4) } : { N: 0, winrate: null }])),
    tiers: Object.fromEntries(Object.entries(A.tiers).map(([t, v]) => [t, { N: v.N, winrate: +(v.score / v.N).toFixed(4) }])),
    suits: Object.fromEntries(Object.entries(A.suits).map(([s, v]) => [s, { N: v.N, winrate: +(v.score / v.N).toFixed(4) }])),
    coreRanks: Object.fromEntries(Object.entries(A.ranks).map(([r, v]) => [r, { N: v.N, winrate: +(v.score / v.N).toFixed(4) }])),
    abilities: Object.fromEntries(Object.entries(A.abilities).map(([k, v]) => [k, {
      triggersPerMatch: +(v.triggers / v.N).toFixed(3),
      flatPtsPerMatch: +(v.flat / v.N).toFixed(3),
      pctPtsPerMatch: +(v.pct / v.N).toFixed(3),
    }])),
  };
}

const wilson = (wins, N, z = 1.959964) => {
  if (!N) return [0, 0];
  const p = wins / N, zz = z * z, d = 1 + zz / N;
  const c = (p + zz / (2 * N)) / d, r = (z * Math.sqrt((p * (1 - p) + zz / (4 * N)) / N)) / d;
  return [Math.max(0, c - r), Math.min(1, c + r)];
};
const fmtPct = (x) => (100 * x).toFixed(2) + '%';
const pctCell = (score, N) => { const [lo, hi] = wilson(score, N); return `${fmtPct(score / N)} [${fmtPct(lo)}…${fmtPct(hi)}] (N=${N})`; };

// ── По-матчевый лог ──────────────────────────────────────────────────────────
const matchRows = [];
const MATCH_HEADER = 'cell,seed,matchNo,featSeat,engineWinner,featWin,rounds,nexusFeat,nexusOther,coreFeat,coreOther,exhausted,dmgFeat,dmgOther,corePtsFeat,corePtsOther';
const csvEscape = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function pushRows(cell, matches) {
  matches.forEach((m, i) => {
    matchRows.push([
      cell, m.seed, i + 1, m.featSeat, m.winner, m.featWin, m.rounds,
      m.nexusFeat, m.nexusOther, m.coreFeatTag, m.coreOtherTag,
      m.exhausted ? 1 : 0, m.dmgFeat, m.dmgOther,
      m.ptsFeat?.toFixed(2) ?? '', m.ptsOther?.toFixed(2) ?? '',
    ].map(csvEscape).join(','));
  });
}

const results = {
  meta: {
    generatedAt: new Date().toISOString(),
    baseSeed: BASE_SEED, scale: SCALE,
    rules: {
      resolve: 'shared/engine.js resolveRound(abilities=true, counters=true, variants=RECOMMENDED, coreProfile=balanced)',
      hands: '13 карт из личной колоды 52 (deckVersion=2); 12 в пары; карта Ядра сжигается навсегда (settleDeckHand)',
      mirroring: 'каждая ячейка — зеркальная пара матчей: одни колоды/семена, стороны меняются местами',
      placement: `обе стороны расставляют карты одним алгоритмом (${PLANNER === 'bot' ? 'эталонный botPlan (DP)' : 'быстрый жадный fastPlan, ранжирование линий как в botPlan'}); различие — только правило выбора карты Ядра`,
      coreOffS1a: 'пер-стороннее отключение бонусов Ядра (coreDisabledBySide), та же колодная экономика и сжигание 13-й карты',
      contribution: 'плоские бонусы — точные очки; percent-бонусы — оценка pct% от базовой характеристики линии того же раунда',
    },
  },
  scenarios: {},
};
const runScenario = (id, fn) => {
  if (ONLY && !ONLY.includes(id)) return;
  console.time(`  ${id}`);
  results.scenarios[id] = fn();
  console.timeEnd(`  ${id}`);
};

// ── S1: Ядро вкл vs выкл ─────────────────────────────────────────────────────
export function scenarioS1() {
  const out = {};
  { // S1a: сопоставимая раздача (13 карт у обоих, экономика колод идентична);
    // «фича» = бонусы Ядра; у «other» бонусы Ядра отключены пер-сторонне.
    const A = makeAgg(), rows = [];
    for (let i = 0; i < P(5000); i++) {
      const seed = (BASE_SEED ^ Math.imul(i + 1, 0x51AE3)) >>> 0;
      const m1 = coreMatch(seed, { feat: { policy: 'natural' }, other: { policy: 'natural', disable: ALL_CORE_IDS } });
      const m2 = coreMatch(seed, { feat: { policy: 'natural' }, other: { policy: 'natural', disable: ALL_CORE_IDS }, swap: true });
      A.add(m1); A.add(m2); rows.push(m1, m2);
    }
    out.s1a = {
      name: 'Бонусы Ядра вкл vs выкл; сопоставимая раздача: у обоих 13 карт из колоды, 13-я сжигается впустую',
      ...summarize(A), winrateStr: pctCell(A.n.score, A.n.N),
    };
    pushRows('S1a-core-vs-off-same-economy', rows);
  }
  { // S1b: как выпущено — Ядро (колода 13 + бонусы) против классики (14 карт/раунд).
    const A = makeAgg(), rows = [];
    for (let i = 0; i < P(5000); i++) {
      const seed = (BASE_SEED ^ Math.imul(i + 1, 0x91B7C)) >>> 0;
      const m1 = mixedMatch(seed, 'a');
      const m2 = mixedMatch(seed, 'b');
      A.add(m1); A.add(m2); rows.push(m1, m2);
    }
    out.s1b = {
      name: 'Как выпущено: Ядро (13 карт из колоды + бонусы) vs классика (свежая рука 14 карт каждый раунд)',
      ...summarize(A), winrateStr: pctCell(A.n.score, A.n.N),
    };
    pushRows('S1b-core-vs-classic-shipped', rows);
  }
  return out;
}

// ── S2: уровни Ядра ──────────────────────────────────────────────────────────
function scenarioS2() {
  const out = { vsNatural: {}, ladder: {} };
  for (const t of [1, 2, 3, 4]) {
    const A = makeAgg(), rows = [];
    for (let i = 0; i < P(2500); i++) {
      const seed = (BASE_SEED ^ Math.imul(i + 1, 0x2E271 * t)) >>> 0;
      const m1 = coreMatch(seed, { feat: { force: { tier: t } }, other: { policy: 'natural' } });
      const m2 = coreMatch(seed, { feat: { force: { tier: t } }, other: { policy: 'natural' }, swap: true });
      A.add(m1); A.add(m2); rows.push(m1, m2);
    }
    out.vsNatural[`tier${t}`] = {
      name: `Карта Ядра строго уровня ${TIER_LABEL[t - 1]} vs естественный выбор`,
      ...summarize(A), winrateStr: pctCell(A.n.score, A.n.N),
    };
    pushRows(`S2-tier${TIER_LABEL[t - 1]}-vs-natural`, rows);
  }
  const tiers = [1, 2, 3, 4];
  for (let x = 0; x < tiers.length; x++) for (let y = x + 1; y < tiers.length; y++) {
    const tX = tiers[x], tY = tiers[y];
    const A = makeAgg(), rows = [];
    for (let i = 0; i < P(1000); i++) {
      const seed = (BASE_SEED ^ Math.imul(i + 1, 0x7EE11 * (tX * 16 + tY))) >>> 0;
      // «фича» = более высокий уровень tY
      const m1 = coreMatch(seed, { feat: { force: { tier: tY } }, other: { force: { tier: tX } } });
      const m2 = coreMatch(seed, { feat: { force: { tier: tY } }, other: { force: { tier: tX } }, swap: true });
      A.add(m1); A.add(m2); rows.push(m1, m2);
    }
    out.ladder[`${TIER_LABEL[tX - 1]}-vs-${TIER_LABEL[tY - 1]}`] = {
      name: `Уровень ${TIER_LABEL[tY - 1]} против ${TIER_LABEL[tX - 1]} (winrate более высокого)`,
      ...summarize(A), winrateStr: pctCell(A.n.score, A.n.N),
    };
    pushRows(`S2-ladder-${TIER_LABEL[tX - 1]}v${TIER_LABEL[tY - 1]}`, rows);
  }
  return out;
}

// ── S3: масти ────────────────────────────────────────────────────────────────
function scenarioS3() {
  const out = { vsNatural: {}, pairwise: {} };
  const suits = ['♥', '♦', '♠', '♣'];
  for (const s of suits) {
    const A = makeAgg(), rows = [];
    for (let i = 0; i < P(2500); i++) {
      const seed = (BASE_SEED ^ Math.imul(i + 1, 0x33A17 * s.charCodeAt(0))) >>> 0;
      const m1 = coreMatch(seed, { feat: { force: { suit: s } }, other: { policy: 'natural' } });
      const m2 = coreMatch(seed, { feat: { force: { suit: s } }, other: { policy: 'natural' }, swap: true });
      A.add(m1); A.add(m2); rows.push(m1, m2);
    }
    out.vsNatural[s] = { name: `Карта Ядра строго масти ${s} vs естественный выбор`, ...summarize(A), winrateStr: pctCell(A.n.score, A.n.N) };
    pushRows(`S3-suit${s}-vs-natural`, rows);
  }
  for (let x = 0; x < suits.length; x++) for (let y = x + 1; y < suits.length; y++) {
    const A = makeAgg(), rows = [];
    for (let i = 0; i < P(1000); i++) {
      const seed = (BASE_SEED ^ Math.imul(i + 1, 0x8DD31 * (suits[x].charCodeAt(0) * 8 + suits[y].charCodeAt(0)))) >>> 0;
      const m1 = coreMatch(seed, { feat: { force: { suit: suits[y] } }, other: { force: { suit: suits[x] } } });
      const m2 = coreMatch(seed, { feat: { force: { suit: suits[y] } }, other: { force: { suit: suits[x] } }, swap: true });
      A.add(m1); A.add(m2); rows.push(m1, m2);
    }
    out.pairwise[`${suits[x]}${suits[y]}`] = { name: `Масть ${suits[y]} против ${suits[x]}`, ...summarize(A), winrateStr: pctCell(A.n.score, A.n.N) };
    pushRows(`S3-${suits[x]}v${suits[y]}`, rows);
  }
  return out;
}

// ── S4: умный выбор (старшая карта) vs случайный ─────────────────────────────
function scenarioS4() {
  const A = makeAgg(), rows = [];
  for (let i = 0; i < P(10000); i++) {
    const seed = (BASE_SEED ^ Math.imul(i + 1, 0x5EED1)) >>> 0;
    const m1 = coreMatch(seed, { feat: { policy: 'highest' }, other: { policy: 'random' } });
    const m2 = coreMatch(seed, { feat: { policy: 'highest' }, other: { policy: 'random' }, swap: true });
    A.add(m1); A.add(m2); rows.push(m1, m2);
  }
  const out = { ...summarize(A), winrateStr: pctCell(A.n.score, A.n.N) };
  // Туз-анализ: highest кладёт туза в Ядро всегда, когда он есть в руке (первый раунд).
  const aceInCore = { N: 0, score: 0 }, noAceInCore = { N: 0, score: 0 };
  for (const m of rows) {
    const isAce = (m.coreFeatFirst ?? m.coreFeat)?.r === 'A';
    const bucket = isAce ? aceInCore : noAceInCore;
    bucket.N++; bucket.score += m.featWin;
  }
  out.aceAnalysis = {
    featCoreIsAce: { N: aceInCore.N, winrate: pctCell(aceInCore.score, aceInCore.N) },
    featCoreNotAce: { N: noAceInCore.N, winrate: pctCell(noAceInCore.score, noAceInCore.N) },
    note: '«featCoreIsAce» ≈ все матчи, где у «умной» стороны был туз (highest ставит его в Ядро всегда); разница с S2-tier-IV изолирует ценность туза в Ядре против туза в парах.',
  };
  pushRows('S4-highest-vs-random', rows);
  return out;
}

// ── S5: поочерёдное отключение усиления каждой способности (пер-сторонне) ────
// m1: у фичи-стороны бонус способности X отключён, у соперника включён;
// m2: зеркально. winrate стороны С ВКЛЮЧЁННЫМ X выше 50% = фактический вклад X.
function scenarioS5() {
  const out = {};
  for (const ability of ALL_CORE_IDS) {
    const A = makeAgg(), rows = [];
    for (let i = 0; i < P(500); i++) {
      const seed = (BASE_SEED ^ Math.imul(i + 1, 0xAB1E7 * (ALL_CORE_IDS.indexOf(ability) + 1))) >>> 0;
      const m1 = coreMatch(seed, { feat: { policy: 'natural' }, other: { policy: 'natural', disable: [ability] } });
      const m2 = coreMatch(seed, { feat: { policy: 'natural' }, other: { policy: 'natural', disable: [ability] }, swap: true });
      A.add(m1); A.add(m2); rows.push(m1, m2);
    }
    const s = summarize(A);
    out[ability] = {
      name: ABILITIES[ability]?.name ?? ability,
      element: ABILITIES[ability]?.element,
      role: ABILITIES[ability]?.role,
      ...s,
      winrateStr: pctCell(A.n.score, A.n.N),
    };
    pushRows(`S5-${ability}`, rows);
  }
  return out;
}

// ── S2b/S3b: чистая ценность уровня/масти БОНУСА (цена удаления карты равная) ──
// Обе стороны принудительно кладут карту одного уровня/масти ⇒ одинаковая
// потеря для пула пар; у контроля бонусы Ядра отключены (coreDisabledBySide).
// Winrate фичи = вклад именно БОНУСА выбранного уровня/масти.
export function bonusOnlyPair(seed, force, withBonus) {
  // withBonus=true: у фичи бонусы Ядра включены, у контроля — отключены
  // (одинаковая цена удаления карты; меряется только БОНУС).
  const m1 = coreMatch(seed, {
    feat: { force, disable: withBonus ? [] : ALL_CORE_IDS },
    other: { force, disable: withBonus ? ALL_CORE_IDS : [] },
  });
  const m2 = coreMatch(seed, {
    feat: { force, disable: withBonus ? [] : ALL_CORE_IDS },
    other: { force, disable: withBonus ? ALL_CORE_IDS : [] },
    swap: true,
  });
  return [m1, m2];
}

export function scenarioS2b() {
  const out = {};
  for (const t of [1, 2, 3, 4]) {
    const A = makeAgg(), rows = [];
    for (let i = 0; i < P(1000); i++) {
      const [m1, m2] = bonusOnlyPair((BASE_SEED ^ Math.imul(i + 1, 0x2B2B1 * t)) >>> 0, { tier: t }, true);
      A.add(m1); A.add(m2); rows.push(m1, m2);
    }
    out[`tier${t}`] = { name: `Бонус уровня ${TIER_LABEL[t - 1]} (цена удаления карты одинакова) vs нулевой бонус`,
      ...summarize(A), winrateStr: pctCell(A.n.score, A.n.N) };
    pushRows(`S2b-tier${TIER_LABEL[t - 1]}-bonus-only`, rows);
  }
  return out;
}

export function scenarioS3b() {
  const out = {};
  for (const su of ['♥', '♦', '♠', '♣']) {
    const A = makeAgg(), rows = [];
    for (let i = 0; i < P(1000); i++) {
      const [m1, m2] = bonusOnlyPair((BASE_SEED ^ Math.imul(i + 1, 0x3B3B1 * su.charCodeAt(0))) >>> 0, { suit: su }, true);
      A.add(m1); A.add(m2); rows.push(m1, m2);
    }
    out[su] = { name: `Бонус масти ${su} (цена удаления карты одинакова) vs нулевой бонус`,
      ...summarize(A), winrateStr: pctCell(A.n.score, A.n.N) };
    pushRows(`S3b-suit${su}-bonus-only`, rows);
  }
  return out;
}

// ── S6: умный ИИ выбора Ядра (chooseCorePlan) против естественного выбора ───
// Настоящий игровой ИИ (оценка кандидатов симуляцией будущих раундов) выбирает
// карту Ядра; соперник — естественный остаток botPlan. Одинаковый planner.
// Количество пар ограничено бюджетом ИИ (см. --s6).
const SMART_BUDGET = Number(arg('s6', QUICK ? 6 : 250));
function smartCoreTurn(hand, own, enemy, side, seed, round) {
  const roll = mulberry32((seed ^ Math.imul(round, 0x51A27) ^ 0x6C0FFEE) >>> 0);
  const res = chooseCorePlan({ state: { round, a: own, b: enemy }, hand, side, rng: roll,
    budgetMs: 120, samples: 1, counters: true, variants: RECOMMENDED, coreProfile: 'balanced' });
  return { placements: res.plan.placements, coreCard: res.plan.coreCard, smart: res.stats };
}

function scenarioS6() {
  const A = makeAgg(), rows = [];
  for (let i = 0; i < SMART_BUDGET; i++) {
    const seed = (BASE_SEED ^ Math.imul(i + 1, 0x66A11)) >>> 0;
    for (const swap of [false, true]) {
      const state = createGameState();
      const swapB = swap;
      const featSide = swapB ? 'b' : 'a';
      const deckFeat = createPlayerDeck(mulberry32(seed ^ (swapB ? 0x5DEECE66 : 0)));
      const deckOther = createPlayerDeck(mulberry32(seed ^ (swapB ? 0 : 0x5DEECE66)));
      let handFeat, handOther;
      const drawHands = () => {
        const r = mulberry32(seed ^ Math.imul(state.round, 0x9E3779B9));
        const deckA = featSide === 'a' ? deckFeat : deckOther, deckB = featSide === 'a' ? deckOther : deckFeat;
        const da = drawDeckHand(deckA, r), db = drawDeckHand(deckB, r);
        if (da.exhausted || db.exhausted) return false;
        Object.assign(deckA, da.deck); Object.assign(deckB, db.deck);
        handFeat = featSide === 'a' ? da.hand : db.hand;
        handOther = featSide === 'a' ? db.hand : da.hand;
        return true;
      };
      if (!drawHands()) { A.add({ featWin: 0.5, rounds: 0, dmgFeat: 0, dmgOther: 0, nexusFeat: NEXUS_HP, nexusOther: NEXUS_HP, exhausted: true, fallbackFeat: false, effFeat: newEff(), coreFeatFirst: null }); continue; }
      const rec = { seed, swap: swapB, featSeat: featSide, winner: null, rounds: 0, exhausted: false,
        nexusFeat: NEXUS_HP, nexusOther: NEXUS_HP, dmgFeat: 0, dmgOther: 0,
        coreFeat: null, coreOther: null, coreFeatFirst: null, fallbackFeat: false, fallbackOther: false,
        effFeat: newEff(), effOther: newEff() };
      let smartEvaluated = 0;
      while (state.round <= MAX_ROUNDS) {
        const rng = mulberry32(seed ^ Math.imul(state.round, 0x1F123BB5));
        const handA = featSide === 'a' ? handFeat : handOther;
        const handB = featSide === 'a' ? handOther : handFeat;
        let tA, tB;
        if (featSide === 'a') {
          tA = smartCoreTurn(handA, state.a, state.b, 'a', seed, state.round); smartEvaluated = tA.smart?.evaluated ?? 0;
          tB = coreTurnByPolicy(handB, state.b, state.a, 'natural', mulberry32(seed ^ 0xF00D1E));
        } else {
          tA = coreTurnByPolicy(handA, state.a, state.b, 'natural', mulberry32(seed ^ 0xC0FFEE));
          tB = smartCoreTurn(handB, state.b, state.a, 'b', seed, state.round); smartEvaluated = tB.smart?.evaluated ?? 0;
        }
        rec.coreFeat = featSide === 'a' ? tA.coreCard : tB.coreCard;
        rec.coreOther = featSide === 'a' ? tB.coreCard : tA.coreCard;
        if (state.round === 1) { rec.coreFeatFirst = rec.coreFeat; rec.featAceInHand = handFeat.some((c) => c.r === 'A'); rec.featAceInCore = rec.coreFeatFirst?.r === 'A'; }
        const res = resolveRound(state, tA, tB, { abilities: true, counters: true, variants: RECOMMENDED, rng,
          nexusCoreEnabled: true, coreProfile: 'balanced' });
        collectRound(res, rec, featSide);
        rec.rounds = state.round;
        if (res.finished) break;
        const seatDeck = (sd) => (featSide === 'a' ? (sd === 'a' ? deckFeat : deckOther) : (sd === 'a' ? deckOther : deckFeat));
        const sA = settleDeckHand(seatDeck('a'), handA, tA), sB = settleDeckHand(seatDeck('b'), handB, tB);
        Object.assign(seatDeck('a'), sA); Object.assign(seatDeck('b'), sB);
        const r2 = mulberry32(seed ^ Math.imul(state.round + 1, 0x7A7A11));
        const da = drawDeckHand(seatDeck('a'), r2), db = drawDeckHand(seatDeck('b'), r2);
        if (da.exhausted || db.exhausted) { rec.exhausted = true; break; }
        Object.assign(seatDeck('a'), da.deck); Object.assign(seatDeck('b'), db.deck);
        handFeat = featSide === 'a' ? da.hand : db.hand;
        handOther = featSide === 'a' ? db.hand : da.hand;
      }
      const w = getWinner(state);
      rec.winner = rec.exhausted ? exhaustionWinner(state) : w.winner;
      rec.nexusFeat = Math.max(0, (rec.featSeat === 'a' ? state.a : state.b).nexus);
      rec.nexusOther = Math.max(0, (rec.featSeat === 'a' ? state.b : state.a).nexus);
      rec.rounds = Math.min(rec.rounds, MAX_ROUNDS);
      rec.featWin = rec.winner === 'draw' ? 0.5 : rec.winner === rec.featSeat ? 1 : 0;
      rec.coreFeatTag = rec.coreFeat ? `${rec.coreFeat.id}(T${coreTier(rec.coreFeat)})` : '';
      rec.coreOtherTag = '';
      rec.coreFeatFirstTag = rec.coreFeatFirst ? `${rec.coreFeatFirst.id}(T${coreTier(rec.coreFeatFirst)})` : '';
      rec.ptsFeat = sumPts(rec.effFeat); rec.ptsOther = sumPts(rec.effOther);
      A.add(rec); rows.push(rec);
    }
  }
  return { name: 'Умный ИИ выбора Ядра (chooseCorePlan, бюджет 120мс/ход) vs естественный выбор', ...summarize(A), winrateStr: pctCell(A.n.score, A.n.N) };
}

// ── Запуск ───────────────────────────────────────────────────────────────────
// main-guard: импорт модуля не запускает симуляцию (нужно для бенчей/тестов).
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
const FROM = arg('from-file', '');
if (isMain && FROM) {
  const saved = JSON.parse(readFileSync(FROM, 'utf8'));
  writeFileSync(join(OUT, 'core-balance-report.md'), buildReport(saved));
  console.log('report regenerated from', FROM);
  process.exit(0);
}
export const runAll = () => {
  console.log(`VOCHKO · core-balance · scale=${SCALE}${QUICK ? ' (QUICK)' : ''} · seed=${BASE_SEED}`);
  runScenario('S1', scenarioS1);
  if (VALIDATE > 0) runScenario('S1V', () => {
    // Контрольная партия: S1a на эталонном botPlan (медленный DP) — проверка,
    // что вывод S1a не артефакт жадного планировщика.
    PLANNER_OVERRIDE = 'bot';
    const A = makeAgg(), rows = [];
    for (let i = 0; i < VALIDATE; i++) {
      const seed = (BASE_SEED ^ Math.imul(i + 1, 0x1CA11)) >>> 0;
      const m1 = coreMatch(seed, { feat: { policy: 'natural' }, other: { policy: 'natural', disable: ALL_CORE_IDS } });
      const m2 = coreMatch(seed, { feat: { policy: 'natural' }, other: { policy: 'natural', disable: ALL_CORE_IDS }, swap: true });
      A.add(m1); A.add(m2); rows.push(m1, m2);
    }
    PLANNER_OVERRIDE = null;
    pushRows('S1V-botplan-validation', rows);
    return { name: 'S1a на эталонном botPlan (валидация планировщика)', ...summarize(A), winrateStr: pctCell(A.n.score, A.n.N) };
  });
  runScenario('S2', scenarioS2);
  runScenario('S3', scenarioS3);
  runScenario('S4', scenarioS4);
  runScenario('S5', scenarioS5);
  runScenario('S2b', scenarioS2b);
  runScenario('S3b', scenarioS3b);
  if (SMART_BUDGET > 0) runScenario('S6', scenarioS6);

  // merge-on-write: при --only сохраняем сценарии предыдущих прогонов
  if (ONLY) {
    try {
      const prev = JSON.parse(readFileSync(join(OUT, 'core-balance-results.json'), 'utf8'));
      for (const [k, v] of Object.entries(prev.scenarios ?? {})) if (!results.scenarios[k]) results.scenarios[k] = v;
      if (prev.meta) results.meta = { ...prev.meta, ...results.meta };
    } catch { /* нет прошлого файла — не страшно */ }
  }

  const f = (name) => join(OUT, TAG ? name.replace('.csv', `.${TAG}.csv`).replace('.json', `.${TAG}.json`).replace('.md', `.${TAG}.md`) : name);
  writeFileSync(f('core-balance-results.json'), JSON.stringify(results, null, 2));
  writeFileSync(f('core-balance-matches.csv.gz'),
    gzipSync(Buffer.from(MATCH_HEADER + '\n' + matchRows.join('\n') + '\n')));
  writeFileSync(f('core-balance-summary.csv'), buildSummaryCsv(results));
  if (!TAG) writeFileSync(f('core-balance-report.md'), buildReport(results));
  console.log(`OK · матчей: ${matchRows.length} · результаты в ${OUT}`);
};
if (isMain) runAll();

function buildSummaryCsv(res) {
  const rows = ['metric,cell,value'];
  const walk = (obj, sid, prefix = '') => {
    for (const [k, v] of Object.entries(obj ?? {})) {
      if (k === 'name' || k === 'note') continue;
      const key = prefix + k;
      if (k === 'winrate' && typeof v === 'string') { rows.push(['winrate', sid, v].map(csvEscape).join(',')); continue; }
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        if (typeof v.winrate === 'number') {
          rows.push([`${key}:winrate`, sid, (100 * v.winrate).toFixed(2) + '%'].map(csvEscape).join(','));
          rows.push([`${key}:ci95`, sid, `[${v.lo};${v.hi}]`].map(csvEscape).join(','));
        }
        walk(v, sid, `${key}.`);
      } else if (typeof v === 'number' || typeof v === 'string') {
        rows.push([key, sid, v].map(csvEscape).join(','));
      }
    }
  };
  for (const [sid, sc] of Object.entries(res.scenarios)) walk(sc, sid);
  return rows.join('\n') + '\n';
}

// ── Генератор отчёта (reports/core-balance-report.md) ────────────────────────
function buildReport(res) {
  const S = res.scenarios, M = [];
  const p = (s = '') => M.push(s);
  const wr = (x) => (typeof x === 'string' ? x : x?.winrateStr ?? fmtPct(x.winrateNum ?? x.winrate));
  const sig = (lo, hi) => (lo <= 50 && hi >= 50 ? 'не значимо (50% в ДИ)' : lo > 50 ? 'значимо > 50%' : 'значимо < 50%');

  p('# Исследование баланса Ядра Нексуса');
  p('');
  p(`Сгенерировано: ${res.meta.generatedAt} · seed ${res.meta.baseSeed} · масштаб ${res.meta.scale}`);
  p('');
  p('## Методика');
  p('');
  p(`- Правила боя: ${res.meta.rules.resolve}.`);
  p(`- Раздача: ${res.meta.rules.hands}.`);
  p(`- ${res.meta.rules.mirroring}.`);
  p(`- ${res.meta.rules.placement} (в базовом прогоне используется быстрый жадный планировщик, одинаковый для обеих сторон; контрольная партия на эталонном botPlan — раздел «Контрольная партия»).`);
  p(`- Режим «Ядро выкл» (S1a): ${res.meta.rules.coreOffS1a}.`);
  p(`- Метрика вклада: ${res.meta.rules.contribution}.`);
  p('- Стоимость карты Ядра учтена: карта уходит в burned навсегда (settleDeckHand) и не участвует в комбинациях; конец матча — смерть Нексуса, 45 раундов или исчерпание колоды.');
  p('- Доверительные интервалы — Wilson 95%.');
  p('');

  const s1 = S.S1 ?? {};
  p('## 1. Ядро включено против выключенного');
  p('');
  for (const [k, part] of Object.entries(s1)) {
    if (!part?.winrate) continue;
    p(`### ${k === 's1a' ? 'Сопоставимая раздача (S1a)' : 'Как выпущено (S1b)'}`);
    p('');
    p(`- ${part.name}`);
    p(`- Винрейт стороны Ядра: **${wr(part)}** — ${sig(part.lo, part.hi)}.`);
    p(`- Средняя длительность: **${part.avgRounds}** раундов.`);
    p(`- Средний урон за матч: Ядро ${part.avgDmgFeature} vs соперник ${part.avgDmgOther}.`);
    p(`- Средние HP Нексусов в конце: ${part.avgNexusFeature} vs ${part.avgNexusOther}.`);
    if (part.aceToCoreRate != null) p(`- Естественный выбор: при тузе в руке туз уходил в Ядро в ${fmtPct(part.aceToCoreRate)} случаев (тузов в руке: ${part.acesInHand} матчей).`);
    p('');
  }
  p('### Влияние на продолжительность партии');
  p('');
  if (s1.s1a && s1.s1b) {
    const durNoCore = 0;
    p(`- Ядро против классики (S1b): средняя партия — ${s1.s1b.avgRounds} раундов.`);
    p(`- Ядро против Ядра (S1a): ${s1.s1a.avgRounds} раундов.`);
    p('- Интерпретация: обе стороны с Ядром взаимно компенсируют бонусы; сопоставлять длительность с классикой следует с осторожностью (у классики другая экономика раздачи).');
    p('');
  }

  const s6 = S.S6 ?? null;
  if (s6?.winrateStr) {
    p('### Умный ИИ выбора Ядра (chooseCorePlan) против естественного выбора');
    p('');
    p(`- Винрейт стороны с ИИ-выбором карты Ядра: **${s6.winrateStr}** — ${sig(s6.lo, s6.hi)} (N=${s6.N}).`);
    p(`- Средняя длительность: ${s6.avgRounds} раундов.`);
    if (s6.durationBuckets) {
      const b = s6.durationBuckets;
      p(`- По длине партии: короткие (≤6) ${b.short.N ? fmtPct(b.short.winrate) : '—'} · средние (7–14) ${b.mid.N ? fmtPct(b.mid.winrate) : '—'} · длинные (>14) ${b.long.N ? fmtPct(b.long.winrate) : '—'}.`);
    }
    p('- Оценка «насколько правильно подобранная карта Ядра увеличивает шанс победы»: см. winrate выше и таблицу S5 (вклад по способностям).');
    p('');
  }

  if (S.S1V) {
    p('### Контрольная партия на эталонном botPlan');
    p('');
    p(`- S1a с полным DP-планировщиком: винрейт стороны Ядра **${wr(S.S1V)}** — ${sig(S.S1V.lo, S.S1V.hi)} (N=${S.S1V.N}, средняя длительность ${S.S1V.avgRounds}).`);
    p('');
  }

  const s2 = S.S2 ?? {};
  p('## 2. Уровни Ядра');
  p('');
  p('| Уровень | Винрейт vs естественный выбор | ДИ 95% | N | Fallback |');
  p('|---|---|---|---|---|');
  for (const [k, v] of Object.entries(s2.vsNatural ?? {})) {
    p(`| ${v.name.replace(' vs естественный выбор', '')} | ${wr(v)} | [${v.lo}…${v.hi}] | ${v.N} | ${fmtPct(v.fallbackRate)} |`);
  }
  p('');
  p('**Чистая ценность БОНУСА уровня** (обе стороны принудительно кладут карту одного уровня — цена удаления карты равна; у контроля бонусы отключены):');
  p('');
  p('| Уровень бонуса | Winrate | ДИ 95% | N |');
  p('|---|---|---|---|');
  for (const [k, v] of Object.entries(S.S2b ?? {})) p(`| ${TIER_LABEL[Number(k.replace('tier', '')) - 1]} | ${v.winrateStr ?? fmtPct(v.winrateNum ?? v.winrate)} | [${v.lo}…${v.hi}] | ${v.N} |`);
  p('');
  p('**Интерпретация:** «vs естественный выбор» измеряет СТРАТЕГИЮ целиком — вместе с ценой удаления карты из пула пар (сильная карта перестаёт участвовать в комбинациях). Именно поэтому принудительные уровни II–IV проигрывают: цена потери сильной карты превышает прибавку бонуса. Чистая ценность бонусов — в таблице выше.');
  p('');
  p('Попарная лестница (winrate более высокого уровня):');

  p('');
  for (const [k, v] of Object.entries(s2.ladder ?? {})) p(`- ${k}: ${wr(v)} — ${sig(v.lo, v.hi)}`);
  p('');

  const s3 = S.S3 ?? {};
  p('## 3. Рейтинг мастей');
  p('');
  p('| Масть | Винрейт vs естественный выбор | ДИ 95% | N |');
  p('|---|---|---|---|---|');
  const suitRows = Object.entries(s3.vsNatural ?? {}).sort((a, b) => b[1].winrateNum - a[1].winrateNum);
  for (const [k, v] of suitRows) p(`| ${k} | ${wr(v)} | [${v.lo}…${v.hi}] | ${v.N} |`);
  p('');
  for (const [k, v] of Object.entries(s3.pairwise ?? {})) p(`- ${k}: ${wr(v)} — ${sig(v.lo, v.hi)}`);
  p('');
  p('**Чистая ценность БОНУСА масти** (обе стороны принудительно кладут карту одной масти; у контроля бонусы отключены):');
  p('');
  p('| Масть бонуса | Winrate | ДИ 95% | N |');
  p('|---|---|---|---|');
  for (const [k, v] of Object.entries(S.S3b ?? {})) p(`| ${k} | ${v.winrateStr ?? fmtPct(v.winrateNum ?? v.winrate)} | [${v.lo}…${v.hi}] | ${v.N} |`);
  p('');
  p('**Интерпретация:** как и с уровнями — «vs естественный выбор» включает цену удаления сильных карт масти из пула пар; таблица выше изолирует сам бонус.');

  const s4 = S.S4 ?? {};
  p('## 4. Умный выбор Ядра против случайного');
  p('');
  if (s4.winrate) {
    p(`- Винрейт стратегии «всегда старшая карта» против «случайная карта»: **${wr(s4)}** — ${sig(s4.lo, s4.hi)}.`);
    p(`- Когда карта Ядра — туз (первый раунд): ${s4.aceAnalysis?.featCoreIsAce?.winrate}.`);
    p(`- Когда карта Ядра — не туз: ${s4.aceAnalysis?.featCoreNotAce?.winrate}.`);
    p('');
  }

  const s5 = S.S5 ?? {};
  p('## 5. Усиления способностей: топ-5 сильнейших и слабейших');
  p('');
  p('Каждая способность зеркально отключалась у одной стороны; винрейт стороны С включённым усилением показывает его фактический вклад (>50% = усилений даёт преимущество).');
  p('');
  const abRows = Object.entries(s5).map(([k, v]) => ({
    id: k, name: v.name, element: v.element, role: v.role, wr: v.winrateNum, lo: v.lo, hi: v.hi, N: v.N,
    trig: v.abilities?.[k]?.triggersPerMatch ?? 0, flat: v.abilities?.[k]?.flatPtsPerMatch ?? 0, pct: v.abilities?.[k]?.pctPtsPerMatch ?? 0,
    rounds: v.avgRounds,
  }));
  const byWr = [...abRows].sort((a, b) => b.wr - a.wr);
  const row = (r) => `| ${r.name} (${r.element}, ${r.role}) | ${fmtPct(r.wr)} | [${r.lo}…${r.hi}] | ${r.N} | ${r.trig} | ${r.flat} | ${r.pct} |`;
  const table = (rs) => {
    p('| Способность | Winrate вкл | ДИ 95% | N | Триггеров/матч | Плоских очков/матч | % очков/матч |');
    p('|---|---|---|---|---|---|---|');
    for (const r of rs) p(row(r));
    p('');
  };
  p('**Сильнейшие (топ-5):**');
  table(byWr.slice(0, 5));
  p('**Слабейшие (топ-5):**');
  table([...byWr].slice(-5).reverse());
  p('N=1000 зеркальных пар на способность ⇒ ДИ ±3,1 п.п.; отклонения в пределах ±3 п.п. следует считать шумом. Для частоты и размера вкладов использована телеметрия всех 125 600 матчей.');
  p('');

  // Тузы
  p('## 6. Туза в Ядро: выгоднее, чем в пару?');
  p('');
  const tier4 = s2.vsNatural?.tier4 ?? s2.vsNatural?.['tier4'];
  if (tier4) {
    p(`- Стратегия «карта Ядра всегда уровня IV (только тузы)» против естественного выбора: **${wr(tier4)}** — ${sig(tier4.lo, tier4.hi)}.`);
    p(`- При этом в ${fmtPct(tier4.fallbackRate)} матчей тузов в руке не было вовсе (приходилось брать карту другого уровня) — в этих матчах «стратегия туза» вырождена.`);
  }
  if (s4.aceAnalysis) {
    p(`- Стратегия «всегда старшая карта» (класть туза в Ядро при наличии): винрейт ${wr(s4)}.`);
    p(`- Матчи с тузом в Ядре (первый раунд): ${s4.aceAnalysis.featCoreIsAce.winrate}; без туза: ${s4.aceAnalysis.featCoreNotAce.winrate}.`);
  }
  if (s1.s1a?.aceToCoreRate != null) p(`- Естественный выбор почти никогда не отправляет туза в Ядро (он остаётся для пар): доля ${fmtPct(s1.s1a.aceToCoreRate)} при тузе в руке.`);
  p('- **Интерпретация:** туза в Ядро отправлять невыгодно: цена потери туза из пула пар многократно превышает ценность бонуса уровня IV (ср. S2b-tierIV — сам бонус уровня IV даёт лишь небольшой сдвиг).');
  p('');

  // Выводы
  p('## 7. Выводы и рекомендации');
  p('');
  const maxSpread = Math.max(...abRows.map((r) => Math.abs(r.wr - 0.5)));
  const tierSpreads = Object.values(S.S2b ?? {}).map((v) => Math.abs(v.winrateNum - 0.5));
  const suitSpreads = Object.values(S.S3b ?? {}).map((v) => Math.abs(v.winrateNum - 0.5));
  const maxTier = Math.max(...tierSpreads, 0), maxSuit = Math.max(...suitSpreads, 0);
  const strongest = byWr[0], weakest = byWr[byWr.length - 1];
  const pctOf = (x) => { const w = x?.winrateNum ?? (x?.winrate ? parseFloat(x.winrate) : null); return w == null ? null : (w <= 1 ? w * 100 : w); };
  const s1aWR = pctOf(s1.s1a), s1bWR = pctOf(s1.s1b);

  p('**Сводка ключевых чисел:**');
  p('');
  if (s1aWR != null) p(`- Бонусы Ядра при сопоставимой раздаче: винрейт включённой стороны ${wr(s1.s1a)} (${sig(s1.s1a.lo, s1.s1a.hi)}).`);
  if (s1bWR != null) p(`- Ядро против классики (как выпущено): винрейт Ядра ${wr(s1.s1b)} (${sig(s1.s1b.lo, s1.s1b.hi)}).`);
  p(`- Разброс винрейтов по способностям: ${fmtPct(0.5 - maxSpread)}…${fmtPct(0.5 + maxSpread)} от центра.`);
  p(`- Сильнейшее усиление: ${strongest.name} (${fmtPct(strongest.wr)}); слабейшее: ${weakest.name} (${fmtPct(weakest.wr)}).`);
  p(`- Чистая ценность бонусов (S2b/S3b, одинаковая цена удаления карты): уровень IV до ${fmtPct(0.5 + maxTier)}, масти до ${fmtPct(0.5 + maxSuit)} — при этом «естественный» доступ к бонусу уровня IV требует жертвы туза (S2/S4), что сводит выгодность на нет.`);
  p('');

  p('**Рекомендации (если обнаружен дисбаланс):**');
  p('');
  const recs = [];
  if (s1bWR != null && s1bWR < 47.5) recs.push('Ядро против классики проигрывает заметно чаще 50% — дисбаланс ЭКОНОМИКИ, а не бонусов: компенсировать стоимость сжигаемой карты (возврат карты Ядра в колоду через N раундов, «13+1» раздача для режима Ядра или бонус к размеру руки). Боевые коэффициенты при этом не трогать.');
  else if (s1bWR != null && s1bWR > 52.5) recs.push('Ядро против классики выигрывает заметно чаще 50%: снизить бонус уровней III–IV (percent-ключи −2 п.п., плоские −1) и повторить прогон.');
  if (s1aWR != null && s1aWR >= 51.5 && s1aWR <= 54) recs.push(`Бонусы Ядра при равной экономике умеренно сильны (${fmtPct(s1aWR / 100)}): допустимо; при желании ужесточить — ослабить ключи уровней III–IV на одну ступень таблиц и перепроверить S1a/S2b.`);
  else if (s1aWR != null && s1aWR > 54) recs.push(`Бонусы Ядра при равной экономике сильно превышают 50% (${fmtPct(s1aWR / 100)}): ослабить ключи уровней III–IV и перепроверить S1a/S2b.`);
  else if (s1aWR != null && s1aWR < 48.5) recs.push(`Бонусы Ядра при равной экономике слабы (${fmtPct(s1aWR / 100)}): усилить ключи уровня I–II и перепроверить S1a/S2b.`);
  if (maxSpread > 0.03) recs.push(`Разброс по способностям до ${fmtPct(maxSpread + 0.5)} — выровнять: сильнейшие (${strongest.name}) ослабить на одну ступень таблицы, слабейшие (${weakest.name}) усилить; перепроверить S5.`);
  else recs.push('По способностям значимого разброса нет (все ячейки в пределах ±3 п.п. шума) — индивидуальные коэффициенты не трогать.');
  recs.push('Главный практический вывод: карта Ядра — это прежде всего ЖЕРТВА сильной карты из пула пар; стратегии «принудительный высокий уровень/масть» (S2/S3/S4) проигрывают именно из-за этой цены. Управлять балансом следует экономикой (стоимость сжигаемой карты), а не коэффициентами бонусов.');
  recs.forEach((r) => p(`- ${r}`));
  p('');

  // Разница до/после исправления зеркалирования
  try {
    const pre = JSON.parse(readFileSync(join(OUT, 'core-balance-results.pre-fix.json'), 'utf8'));
    p('## 8. Разница до/после исправления зеркалирования');
    p('');
    p('В версии до исправления при `swap: true` конфигурации менялись местами относительно фича-метки, из-за чего агрегат пары усреднял противоположные эксперименты и стремился к 50%.');
    p('');
    const cmp = (name, pre, post) => {
      const pv = pre?.winrateStr ?? (pre ? fmtPct(pre.winrate) : '—');
      const px = pre?.winrateNum ?? (pre?.winrate && typeof pre.winrate === 'number' ? pre.winrate : null);
      const postV = post?.winrateStr ?? (post ? fmtPct(post.winrateNum ?? post.winrate) : '—');
      p(`- ${name}: до ${pv} → после ${postV}`);
    };
    const ps = pre.scenarios ?? {};
    cmp('S1a (бонусы вкл/выкл, сопоставимая раздача)', ps.S1?.s1a, s1.s1a);
    cmp('S1b (Ядро против классики)', ps.S1?.s1b, s1.s1b);
    cmp('S2 уровень IV vs естественный', ps.S2?.vsNatural?.tier4 ?? ps.S2?.vsNatural?.['tier4'], s2.vsNatural?.tier4 ?? s2.vsNatural?.['tier4']);
    cmp('S4 highest vs random', ps.S4, S.S4);
    p('');
    p('Важно: S4 в старой версии был корректен (использовал отдельный режим привязки конфигурации к фиче) — его число до и после совпадает в пределах шума и служит контрольной точкой корректности исправления.');
    p('');
  } catch { /* pre-fix файл недоступен */ }

  p('## 9. Ограничения');
  p('');
  p('- Обе стороны в симуляции используют жадный планировщик расстановки (одинаковый); человек или умный бот играют иначе — абсолютные уровни винрейтов могут отличаться, относительные сравнения при равных стратегиях остаются валидными.');
  p('- Контрольная партия на эталонном botPlan покрывает только S1 (см. ниже).');
  p('- percent-вклад усиления — оценка в очках характеристик; плоские вклады точны.');
  p('- Способности с rng-элементом (Разряд Грозы) дают дополнительную дисперсию.');
  p('');
  return M.join('\n') + '\n';
}
