// Стихийные способности, статусы и таблица контрстихий.
// Единственный источник данных для движка, бота, клиента и симулятора.
// Движок (engine.js) передаёт io-хелперы явно — модуль не импортирует engine.js,
// поэтому циклических зависимостей нет.
import { elementOf } from './elements.js';

// ── Таблица 20 способностей (10 стихий × атака/защита) ──────────────────────
export const ABILITIES = Object.freeze(Object.fromEntries([
  // Огонь
  ['fire_burn', { id: 'fire_burn', element: 'fire', role: 'attack', name: 'Поджог',
    desc: 'При попадании наложить поджог на 2 урона в следующем раунде', trigger: 'on-hit' }],
  ['fire_retaliation', { id: 'fire_retaliation', element: 'fire', role: 'defense', name: 'Ответный жар',
    desc: 'Если щит полностью остановил удар — 2 ответного урона', trigger: 'blocked' }],
  // Вода
  ['water_strip_armor', { id: 'water_strip_armor', element: 'water', role: 'attack', name: 'Смыть броню',
    desc: 'Удалить до 3 единиц временной брони противника перед уроном', trigger: 'always' }],
  ['water_cleanse', { id: 'water_cleanse', element: 'water', role: 'defense', name: 'Очищение',
    desc: 'Очистить негативные статусы линии; если их нет — восстановить 2 HP', trigger: 'round-start' }],
  // Земля
  ['earth_pierce_def', { id: 'earth_pierce_def', element: 'earth', role: 'attack', name: 'Пренебречь защитой',
    desc: 'Игнорировать 15% защиты противника (защита ×0.85)', trigger: 'always' }],
  ['earth_armor', { id: 'earth_armor', element: 'earth', role: 'defense', name: 'Хребет',
    desc: 'Перенести 3 единицы брони на следующий раунд', trigger: 'always' }],
  // Воздух
  ['air_weaken_def', { id: 'air_weaken_def', element: 'air', role: 'attack', name: 'Рассеять защиту',
    desc: 'При попадании ослабить следующую защиту противника на 10%', trigger: 'on-hit' }],
  ['air_reflect', { id: 'air_reflect', element: 'air', role: 'defense', name: 'Контрветер',
    desc: 'Если удар полностью заблокирован — отразить 2 урона', trigger: 'blocked' }],
  // Пар
  ['steam_weaken_def', { id: 'steam_weaken_def', element: 'steam', role: 'attack', name: 'Обжигающий удар',
    desc: 'При попадании ослабить следующую защиту противника на 15%', trigger: 'on-hit' }],
  ['steam_dampen', { id: 'steam_dampen', element: 'steam', role: 'defense', name: 'Давление',
    desc: 'Уменьшить входящий урон на 10%; при полной блокировке восстановить 2 HP', trigger: 'incoming' }],
  // Лава
  ['lava_pierce_burn', { id: 'lava_pierce_burn', element: 'lava', role: 'attack', name: 'Пробой и поджог',
    desc: 'Пробить 10% защиты (×0.9) и при попадании наложить поджог на 1 урон', trigger: 'always' }],
  ['lava_counter', { id: 'lava_counter', element: 'lava', role: 'defense', name: 'Кипящая кровь',
    desc: 'При успешном ударе противника нанести 2 ответного урона', trigger: 'on-hit-taken' }],
  // Огненный вихрь
  ['fire_vortex_spread', { id: 'fire_vortex_spread', element: 'fire_vortex', role: 'attack', name: 'Разлёт огня',
    desc: 'При попадании наложить по 1 поджогу на соседние линии противника', trigger: 'on-hit' }],
  ['fire_vortex_zaslon', { id: 'fire_vortex_zaslon', element: 'fire_vortex', role: 'defense', name: 'Заслон',
    desc: 'Уменьшить входящую атаку на 10%, если соседняя линия горит', trigger: 'incoming' }],
  // Лёд
  ['ice_weaken_def', { id: 'ice_weaken_def', element: 'ice', role: 'attack', name: 'Обледенение',
    desc: 'При попадании ослабить следующую защиту противника на 10%', trigger: 'on-hit' }],
  ['ice_weaken_atk', { id: 'ice_weaken_atk', element: 'ice', role: 'defense', name: 'Стужа',
    desc: 'Ослабить следующую атаку противника на 15%', trigger: 'always' }],
  // Гроза
  ['thunderstorm_discharge', { id: 'thunderstorm_discharge', element: 'thunderstorm', role: 'attack', name: 'Разряд',
    desc: 'При попадании нанести 2 дополнительного урона случайной другой башне', trigger: 'on-hit' }],
  ['thunderstorm_charge', { id: 'thunderstorm_charge', element: 'thunderstorm', role: 'defense', name: 'Заряд',
    desc: 'При атаке противника получить +2 к следующей собственной атаке на линии', trigger: 'on-hit-taken' }],
  // Песчаная буря
  ['sandstorm_weaken_atk', { id: 'sandstorm_weaken_atk', element: 'sandstorm', role: 'attack', name: 'Ослепление',
    desc: 'При попадании ослабить следующую атаку противника на 15%', trigger: 'on-hit' }],
  ['sandstorm_shield', { id: 'sandstorm_shield', element: 'sandstorm', role: 'defense', name: 'Песчаный щит',
    desc: 'Получить +4 щита на текущий раунд', trigger: 'always' }],
].map(([id, ability]) => [id, Object.freeze(ability)])));

// ── Контрстихии: направленные отношения (предварительные, эффекты НЕ утверждены).
// В основном балансе не применяются: только данные + предложения в docs/abilities.md.
export const COUNTERS = Object.freeze({
  fire: 'water',
  water: 'thunderstorm',
  earth: 'lava',
  air: 'sandstorm',
  steam: 'ice',
  lava: 'water',
  fire_vortex: 'earth',
  ice: 'fire',
  thunderstorm: 'earth',
  sandstorm: 'water',
});
export const counterOf = (element) => COUNTERS[element] ?? null;
export const isCounter = (element, opposingElement) =>
  !!element && counterOf(element) === opposingElement;

// ── Статусы: жизненный цикл 1 раунд ────────────────────────────────────────
// Статусы выставленные в раунде N применяются в начале раунда N+1 и стираются.
// Накопление внутри раунда — через максимум; сверху жёсткие капы.
export const NEGATIVE_STATUSES = Object.freeze(['burn', 'weakenAttack', 'weakenDefense']);
export const STATUS_CAPS = Object.freeze({
  burn: 5,            // 2/раунд максимум у Огня, Лава даёт 1
  armor: 9,           // 3/раунд от Земли
  weakenAttack: 30,   // %
  weakenDefense: 30,  // %
  attackBoost: 6,     // +2/раунд от Грозы
});
export const emptyStatuses = () => [{}, {}, {}];

export function ensureStatuses(board) {
  if (!board.statuses) board.statuses = emptyStatuses();
  for (let l = 0; l < 3; l++) if (!board.statuses[l]) board.statuses[l] = {};
  return board.statuses;
}

// Добавить статус с накоплением по максимуму и капом (без бесконтрольного роста).
export function addStatus(statuses, lane, key, value) {
  if (lane < 0 || lane > 2) return;
  const cap = STATUS_CAPS[key] ?? 99;
  const s = statuses[lane] ?? (statuses[lane] = {});
  s[key] = Math.min(cap, Math.max(s[key] || 0, value));
}

export const cloneStatuses = (statuses) =>
  (statuses ?? emptyStatuses()).map((s) => ({ ...s }));

// ── Фаза 0 раунда: очищение (Вода), тик поджога, съём применённых статусов ──
// Порядок: очищение → тик поджога → статусы применены и стёрты (переносится
// только то, что выставят способности в этом раунде).
// io: { damage, damageStage, recordDamage, healStructure, snapshot }
export function applyStatuses(state, opts) {
  const { turnA, turnB, nexusPct, rng, disabled, events, abilityEvents, io } = opts;
  const ctx = {
    state, rng, nexusPct, disabled: disabled ?? new Set(), events, abilityEvents, io,
    applied: { a: emptyStatuses(), b: emptyStatuses() },
    next: { a: emptyStatuses(), b: emptyStatuses() },
    burned: { a: [false, false, false], b: [false, false, false] },
  };
  const on = (id) => !ctx.disabled.has(id);
  for (const side of ['a', 'b']) {
    const board = state[side];
    ensureStatuses(board);
    const ownTurn = side === 'a' ? turnA : turnB;
    for (let l = 0; l < 3; l++) {
      const s = board.statuses[l];
      const placement = ownTurn?.placements?.find((p) => p.lane === l);
      const defElement = elementOf(placement?.defense)?.id;
      // Очищение Водой: до тика поджога — Защитная способность действует в начале раунда.
      if (defElement === 'water' && on('water_cleanse')) {
        const negatives = NEGATIVE_STATUSES.filter((k) => s[k]);
        if (negatives.length) {
          for (const k of negatives) delete s[k];
          abilityEvents.push({ ability: 'water_cleanse', side, lane: l, effect: 'cleanse', removed: negatives });
        } else {
          healTarget(ctx, side, l, 2, 'water_cleanse');
        }
      }
      // Тик поджога: урон по текущей цели, затем поджог погашен.
      if (s.burn) {
        ctx.burned[side][l] = true;
        const before = io.snapshot(board), stage = io.damageStage(board, l);
        io.damage(board, l, s.burn, nexusPct[side]);
        const dealt = io.recordDamage(before, board, l);
        events.push({ side, l, stage, amount: dealt, element: '🔥', burn: dealt, burnTick: true });
        abilityEvents.push({ ability: 'burn_tick', side, lane: l, effect: 'damage', amount: dealt, target: side });
      }
      // Статусы этого раунда применены — съём; новые выставит разрешение раунда.
      ctx.applied[side][l] = { ...s };
      board.statuses[l] = {};
    }
  }
  return ctx;
}

// ── Эффективные атака/защита линии (статусы + способности до урона) ─────────
// Порядок: буст атаки → ослабление атаки → ослабление защиты → броня и щит
// Бури → модификаторы атакующего (Вода/Земля/Лава) → Заслон вихря → удар →
// ослабление удара Паром.
export function effectiveLine(p) {
  const { ctx, attackerSide, lane, atkStat, defStat, atkElement, defElement } = p;
  const defenderSide = attackerSide === 'a' ? 'b' : 'a';
  const on = (id) => !ctx.disabled.has(id);
  const atkS = ctx.applied[attackerSide][lane] || {};
  const defS = ctx.applied[defenderSide][lane] || {};

  let attack = atkStat + (atkS.attackBoost || 0);
  attack = Math.round(attack * (1 - (atkS.weakenAttack || 0) / 100));

  let defense = Math.round(defStat * (1 - (defS.weakenDefense || 0) / 100));
  const armor = defS.armor || 0;
  defense += armor;
  if (defElement === 'sandstorm' && on('sandstorm_shield')) defense += 4;

  let armorStripped = 0;
  if (atkElement === 'water' && on('water_strip_armor') && armor > 0) {
    armorStripped = Math.min(3, armor);
    defense = Math.max(0, defense - armorStripped);
  }
  if (atkElement === 'earth' && on('earth_pierce_def')) defense = Math.round(defense * 0.85);
  if (atkElement === 'lava' && on('lava_pierce_burn')) defense = Math.round(defense * 0.90);

  if (defElement === 'fire_vortex' && on('fire_vortex_zaslon') &&
      [lane - 1, lane + 1].some((j) => j >= 0 && j < 3 && ctx.burned[defenderSide][j])) {
    attack = Math.round(attack * 0.90);
  }

  let hit = Math.max(0, attack - defense);
  if (defElement === 'steam' && on('steam_dampen')) hit = Math.round(hit * 0.90);
  return { attack, defense, hit, armorStripped };
}

// ── Последствия попадания и защитные триггеры ───────────────────────────────
// Требуемый порядок: урон уже нанесён → on-hit атакующего → триггеры защиты.
export function hitConsequences(p) {
  const { ctx, state, attackerSide, lane, atkElement, defElement, hit, rng } = p;
  const defenderSide = attackerSide === 'a' ? 'b' : 'a';
  const on = (id) => !ctx.disabled.has(id);
  const next = ctx.next;

  if (hit > 0) { // способности, требующие попадания
    if (atkElement === 'fire' && on('fire_burn'))
      addStatus(next[defenderSide], lane, 'burn', 2);
    if (atkElement === 'lava' && on('lava_pierce_burn'))
      addStatus(next[defenderSide], lane, 'burn', 1);
    if (atkElement === 'air' && on('air_weaken_def'))
      addStatus(next[defenderSide], lane, 'weakenDefense', 10);
    if (atkElement === 'steam' && on('steam_weaken_def'))
      addStatus(next[defenderSide], lane, 'weakenDefense', 15);
    if (atkElement === 'ice' && on('ice_weaken_def'))
      addStatus(next[defenderSide], lane, 'weakenDefense', 10);
    if (atkElement === 'sandstorm' && on('sandstorm_weaken_atk'))
      addStatus(next[defenderSide], lane, 'weakenAttack', 15);
    if (atkElement === 'fire_vortex' && on('fire_vortex_spread'))
      for (const j of [lane - 1, lane + 1]) addStatus(next[defenderSide], j, 'burn', 1);
    if (atkElement === 'thunderstorm' && on('thunderstorm_discharge')) {
      const others = [0, 1, 2].filter((j) => j !== lane);
      const j = others[Math.floor(rng() * others.length)];
      extraDamage(ctx, attackerSide, defenderSide, j, 2, 'thunderstorm_discharge');
    }
  }

  // Защитные триггеры (элемент защитной пары линии).
  if (defElement === 'earth' && on('earth_armor'))
    addStatus(next[defenderSide], lane, 'armor', 3);
  if (defElement === 'ice' && on('ice_weaken_atk'))
    addStatus(next[attackerSide], lane, 'weakenAttack', 15);
  if (defElement === 'thunderstorm' && on('thunderstorm_charge') && hit > 0)
    addStatus(next[defenderSide], lane, 'attackBoost', 2);
  if (hit === 0 && defElement === 'steam' && on('steam_dampen'))
    healTarget(ctx, defenderSide, lane, 2, 'steam_dampen');
  if (hit === 0 && defElement === 'fire' && on('fire_retaliation'))
    extraDamage(ctx, defenderSide, attackerSide, lane, 2, 'fire_retaliation');
  if (hit === 0 && defElement === 'air' && on('air_reflect'))
    extraDamage(ctx, defenderSide, attackerSide, lane, 2, 'air_reflect');
  if (hit > 0 && defElement === 'lava' && on('lava_counter'))
    extraDamage(ctx, defenderSide, attackerSide, lane, 2, 'lava_counter');
}

// Доп. урон (ответный, отражённый, разряд) — по текущей цели линии,
// со щитом Нексуса получающей стороны на начало раунда.
function extraDamage(ctx, bySide, targetSide, lane, amount, ability) {
  const board = ctx.state[targetSide];
  const before = ctx.io.snapshot(board), stage = ctx.io.damageStage(board, lane);
  ctx.io.damage(board, lane, amount, ctx.nexusPct[targetSide]);
  const dealt = ctx.io.recordDamage(before, board, lane);
  if (dealt > 0) ctx.events.push({ side: targetSide, l: lane, stage, amount: dealt, element: '⚡', ability, extra: true });
  ctx.abilityEvents.push({ ability, side: bySide, lane, effect: 'damage', amount: dealt, target: targetSide });
}

// Лечение текущей цели линии с капом по максимуму структуры.
function healTarget(ctx, side, lane, amount, ability) {
  const board = ctx.state[side];
  const healed = ctx.io.healStructure(board, lane, amount);
  if (healed > 0) {
    const stage = ctx.io.damageStage(board, lane);
    ctx.events.push({ side, l: lane, stage, amount: healed, element: '💧', ability, heal: true });
  }
  ctx.abilityEvents.push({ ability, side, lane, effect: 'heal', amount: healed, target: side });
}
