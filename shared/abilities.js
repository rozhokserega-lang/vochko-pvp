// Стихийные способности, статусы и таблица контрстихий.
// Единственный источник данных для движка, бота, клиента и симулятора.
// Движок (engine.js) передаёт io-хелперы явно — модуль не импортирует engine.js,
// поэтому циклических зависимостей нет.
import { elementOf, pairStats } from './elements.js';

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

// ── Контрстихии (УТВЕРЖДЁННАЯ механика): направленные отношения.
// Контрстихия отменяет СПЕЦИАЛЬНУЮ способность, но не числовой урон.
// Правило A: защитная стихия контрит атакующую → атакующая способность выкл.
// Правило B: атакующая стихия контрит защитную → защитная способность выкл.
// Отношения несимметричны: COUNTERS[target] = список контрстихий.
export const COUNTERS = Object.freeze({
  fire: ['water'],
  water: ['thunderstorm'],
  earth: ['lava'],
  air: ['sandstorm'],
  steam: ['ice'],
  lava: ['water'],
  fire_vortex: ['earth'],
  ice: ['fire'],
  thunderstorm: ['earth'],
  sandstorm: ['water'],
});
export const counterOf = (element) => COUNTERS[element]?.[0] ?? null;
export const isCounter = (element, opposingElement) =>
  (COUNTERS[opposingElement] ?? []).includes(element);

export const abilityIdOf = (element, role) =>
  Object.values(ABILITIES).find((a) => a.element === element && a.role === role)?.id ?? null;

// Какие способности заблокированы контрстихиями в данном столкновении.
export function counterBlocks(atkElement, defElement, enabled) {
  if (!enabled || !atkElement || !defElement) return { atk: false, def: false };
  return {
    atk: isCounter(defElement, atkElement), // Rule A: защита контрит атаку
    def: isCounter(atkElement, defElement), // Rule B: атака контрит защиту
  };
}

// ── Статусы: жизненный цикл 1 раунд ────────────────────────────────────────
// Статусы выставленные в раунде N применяются в начале раунда N+1 и стираются.
// Накопление внутри раунда — через максимум; сверху жёсткие капы.
export const NEGATIVE_STATUSES = Object.freeze(['burn', 'weakenAttack', 'weakenDefense']);
// ── Метаданные статусов для UI (единый источник с движком) ─────────────────
// Статусы в состоянии боя остаются числовыми (обратная совместимость контракта);
// отображение/подсказки собираются из этой таблицы + значения статуса.
export const STATUS_META = Object.freeze({
  burn: {
    icon: '🔥', name: 'Горение', kind: 'debuff', css: 'status-burn',
    effect: (v) => `−${v} HP в начале следующего раунда (тик)`,
    sources: (v) => v >= 2 ? ['fire'] : ['lava', 'fire_vortex'],
    timing: 'в начале следующего раунда',
    duration: '1 раунд (тик гасит горение)',
    counterplay: 'Защитная пара Воды очищает негативные статусы в начале раунда (не сработает, если атака линии — Гроза: контрстихия).',
  },
  weakenAttack: {
    icon: '❄️', name: 'Ослабление атаки', kind: 'debuff', css: 'status-weakenAttack',
    effect: (v) => `атака линии ×(1 − ${v}/100) в следующем раунде`,
    sources: () => ['sandstorm', 'ice'],
    timing: 'в начале следующего раунда',
    duration: '1 раунд',
    counterplay: 'Защитная пара Воды очищает негативные статусы в начале раунда (не сработает против атаки Грозы).',
  },
  weakenDefense: {
    icon: '💨', name: 'Ослабление защиты', kind: 'debuff', css: 'status-weakenDefense',
    effect: (v) => `защита линии ×(1 − ${v}/100) в следующем раунде`,
    sources: () => ['air', 'steam', 'ice'],
    timing: 'в начале следующего раунда',
    duration: '1 раунд',
    counterplay: 'Защитная пара Воды очищает негативные статусы в начале раунда (не сработает против атаки Грозы).',
  },
  armor: {
    icon: '🛡️', name: 'Временная броня', kind: 'buff', css: 'status-armor',
    effect: (v) => `+${v} к защите линии в следующем раунде (сверх базовой)`,
    sources: () => ['earth'],
    timing: 'в начале следующего раунда',
    duration: '1 раунд',
    counterplay: 'Атака Воды смывает до 3 временной брони перед уроном.',
  },
  attackBoost: {
    icon: '⚡', name: 'Заряд атаки', kind: 'buff', css: 'status-attackBoost',
    effect: (v) => `+${v} к атаке линии в следующем раунде`,
    sources: () => ['thunderstorm'],
    timing: 'в начале следующего раунда',
    duration: '1 раунд',
    counterplay: 'Уже накопленный заряд действует один раунд. Контрстихия Земля мешает получить новый заряд, но не снимает существующий.',
  },
});

// Ключи негативных статусов (для очищения Водой) — уже есть NEGATIVE_STATUSES.
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

// ── Варианты баланса (A/B-эксперименты; исходный баланс — дефолт движка) ────
// РЕКОМЕНДОВАННЫЙ баланс (reports/balance_recommendation.md) экспортируется
// отдельно как RECOMMENDED и включается правилами матча (rules.variants,
// см. supabase/functions/create-room). Исходный баланс — значения по умолчанию:
export const VARIANT_DEFAULTS = Object.freeze({
  fireRetaliation: 'blocked', // blocked | onHit | blocked3
  lavaCounter: 'onHit',       // onHit | three | strongHit
  steamDampen: 'pct10',       // pct10 | pct15 | healPartial
  waterCleanse: 'base',       // base | heal1 | single
  lavaPierce: 'pct10',        // pct10 | pct5 | burnArmor
  waterStrip: 'three',        // three | two
  sandstormShield: 'four',    // four | three
});

// Рекомендованный баланс (Этапы 3–7): оживляет мёртвые защитные способности
// и снижает доминацию Воды/Лавы/Бури. Подробности — reports/balance_recommendation.md.
export const RECOMMENDED = Object.freeze({
  fireRetaliation: 'onHit',
  lavaCounter: 'three',
  steamDampen: 'pct15',
  waterCleanse: 'heal1',
  lavaPierce: 'burnArmor',
  waterStrip: 'two',
  sandstormShield: 'three',
});

export function resolveVariants(opts) {
  const v = {};
  for (const [k, d] of Object.entries(VARIANT_DEFAULTS)) v[k] = opts?.[k] ?? d;
  return v;
}

// ── Фаза 0 раунда: очищение (Вода), тик поджога, съём применённых статусов ──
// Порядок: очищение → тик поджога → статусы применены и стёрты (переносится
// только то, что выставят способности в этом раунде).
// io: { damage, damageStage, recordDamage, healStructure, snapshot }
export function applyStatuses(state, opts) {
  const { turnA, turnB, nexusPct, rng, disabled, events, abilityEvents, io, counters = false, variants = {} } = opts;
  const V = resolveVariants(variants);
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
      // Контрстихия (правило B): атакующая Гроза отменяет способность Воды.
      const oppPlacement = (side === 'a' ? turnB : turnA)?.placements?.find((p) => p.lane === l);
      const oppAtkElement = elementOf(oppPlacement?.attack)?.id;
      // Rule B: атакующая Гроза контрит защитную Воду → очищение отменено.
      const cleanseBlocked = counters && isCounter(oppAtkElement, 'water');
      if (defElement === 'water' && on('water_cleanse') && !cleanseBlocked) {
        const negatives = NEGATIVE_STATUSES.filter((k) => s[k]);
        if (negatives.length) {
          const toRemove = V.waterCleanse === 'single' ? negatives.slice(0, 1) : negatives;
          for (const k of toRemove) delete s[k];
          abilityEvents.push({ ability: 'water_cleanse', side, lane: l, effect: 'cleanse', removed: toRemove });
        } else {
          healTarget(ctx, side, l, V.waterCleanse === 'heal1' ? 1 : 2, 'water_cleanse');
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
  const { ctx, attackerSide, lane, atkStat, defStat, atkElement, defElement, counters = false, variants = {} } = p;
  const defenderSide = attackerSide === 'a' ? 'b' : 'a';
  const on = (id) => !ctx.disabled.has(id);
  const blocks = counterBlocks(atkElement, defElement, counters);
  const V = resolveVariants(variants);
  const trace = (ability, amount, side = attackerSide) => ctx.abilityEvents?.push({ ability, side, lane, effect: 'modifier', amount, target: side === attackerSide ? defenderSide : attackerSide });
  const atkS = ctx.applied[attackerSide][lane] || {};
  const defS = ctx.applied[defenderSide][lane] || {};

  let attack = atkStat + (atkS.attackBoost || 0);
  attack = Math.round(attack * (1 - (atkS.weakenAttack || 0) / 100));

  let defense = Math.round(defStat * (1 - (defS.weakenDefense || 0) / 100));
  const armor = defS.armor || 0;
  defense += armor;
  if (defElement === 'sandstorm' && on('sandstorm_shield') && !blocks.def) {
    defense += V.sandstormShield === 'three' ? 3 : 4;
    trace('sandstorm_shield', V.sandstormShield === 'three' ? 3 : 4, defenderSide);
  }

  let armorStripped = 0;
  if (atkElement === 'water' && on('water_strip_armor') && !blocks.atk && armor > 0) {
    armorStripped = Math.min(V.waterStrip === 'two' ? 2 : 3, armor);
    defense = Math.max(0, defense - armorStripped);
    trace('water_strip_armor', armorStripped);
  }
  if (atkElement === 'earth' && on('earth_pierce_def') && !blocks.atk) { defense = Math.round(defense * 0.85); trace('earth_pierce_def', 15); }
  if (atkElement === 'lava' && on('lava_pierce_burn') && !blocks.atk) {
    defense = Math.round(defense * (V.lavaPierce === 'pct5' ? 0.95 : 0.90));
    trace('lava_pierce_burn', V.lavaPierce === 'pct5' ? 5 : 10);
  }

  if (defElement === 'fire_vortex' && on('fire_vortex_zaslon') && !blocks.def &&
      [lane - 1, lane + 1].some((j) => j >= 0 && j < 3 && ctx.burned[defenderSide][j])) {
    attack = Math.round(attack * 0.90);
    trace('fire_vortex_zaslon', 10, defenderSide);
  }

  let hit = Math.max(0, attack - defense);
  if (defElement === 'steam' && on('steam_dampen') && !blocks.def) {
    hit = Math.round(hit * (V.steamDampen === 'pct15' ? 0.85 : 0.90));
    trace('steam_dampen', V.steamDampen === 'pct15' ? 15 : 10, defenderSide);
  }
  return { attack, defense, hit, armorStripped, ...blocks };
}

// ── Последствия попадания и защитные триггеры ───────────────────────────────
// Требуемый порядок: урон уже нанесён → on-hit атакующего → триггеры защиты.
export function hitConsequences(p) {
  const { ctx, state, attackerSide, lane, atkElement, defElement, hit, rng, counters = false, variants = {} } = p;
  const defenderSide = attackerSide === 'a' ? 'b' : 'a';
  const on = (id) => !ctx.disabled.has(id);
  const next = ctx.next;
  const grant = (side, l, key, value, ability) => {
    const before = next[side][l]?.[key] || 0;
    addStatus(next[side], l, key, value);
    if ((next[side][l]?.[key] || 0) > before) ctx.abilityEvents.push({ ability, side: ABILITIES[ability].role === 'defense' ? defenderSide : attackerSide, lane: l, sourceLane: lane, effect: 'status', status: key, amount: value, target: side });
  };
  const blocks = counterBlocks(atkElement, defElement, counters);
  const V = resolveVariants(variants);

  // Нейтрализация — только специальная способность; числовой урон уже нанесён.
  if (blocks.atk && on(abilityIdOf(atkElement, 'attack'))) {
    const canceled = abilityIdOf(atkElement, 'attack');
    ctx.abilityEvents.push({ ability: 'counter_triggered', side: defenderSide, lane,
      effect: 'counter', by: defElement, canceled, target: defenderSide });
  }
  if (blocks.def && on(abilityIdOf(defElement, 'defense'))) {
    const canceled = abilityIdOf(defElement, 'defense');
    ctx.abilityEvents.push({ ability: 'counter_triggered', side: defenderSide, lane,
      effect: 'counter', by: atkElement, canceled, target: defenderSide });
  }

  if (hit > 0 && !blocks.atk) { // способности, требующие попадания
    if (atkElement === 'fire' && on('fire_burn'))
      grant(defenderSide, lane, 'burn', 2, 'fire_burn');
    if (atkElement === 'lava' && on('lava_pierce_burn')) {
      const burnCondition = V.lavaPierce === 'burnArmor' ? ((ctx.applied[defenderSide][lane] || {}).armor || 0) > 0 : true;
      if (burnCondition) grant(defenderSide, lane, 'burn', 1, 'lava_pierce_burn');
    }
    if (atkElement === 'air' && on('air_weaken_def'))
      grant(defenderSide, lane, 'weakenDefense', 10, atkElement === 'ice' ? 'ice_weaken_def' : 'air_weaken_def');
    if (atkElement === 'steam' && on('steam_weaken_def'))
      grant(defenderSide, lane, 'weakenDefense', 15, 'steam_weaken_def');
    if (atkElement === 'ice' && on('ice_weaken_def'))
      grant(defenderSide, lane, 'weakenDefense', 10, atkElement === 'ice' ? 'ice_weaken_def' : 'air_weaken_def');
    if (atkElement === 'sandstorm' && on('sandstorm_weaken_atk'))
      grant(defenderSide, lane, 'weakenAttack', 15, 'sandstorm_weaken_atk');
    if (atkElement === 'fire_vortex' && on('fire_vortex_spread'))
      for (const j of [lane - 1, lane + 1]) grant(defenderSide, j, 'burn', 1, 'fire_vortex_spread');
    if (atkElement === 'thunderstorm' && on('thunderstorm_discharge')) {
      const others = [0, 1, 2].filter((j) => j !== lane);
      const j = others[Math.floor(rng() * others.length)];
      extraDamage(ctx, attackerSide, defenderSide, j, 2, 'thunderstorm_discharge');
    }
  }

  // Защитные триггеры (элемент защитной пары линии).
  if (!blocks.def) {
    if (defElement === 'earth' && on('earth_armor'))
      grant(defenderSide, lane, 'armor', 3, 'earth_armor');
    if (defElement === 'ice' && on('ice_weaken_atk'))
      grant(attackerSide, lane, 'weakenAttack', 15, 'ice_weaken_atk');
    if (defElement === 'thunderstorm' && on('thunderstorm_charge') && hit > 0)
      grant(defenderSide, lane, 'attackBoost', 2, 'thunderstorm_charge');
    if (defElement === 'steam' && on('steam_dampen')) {
      if (hit === 0) healTarget(ctx, defenderSide, lane, 2, 'steam_dampen');
      else if (V.steamDampen === 'healPartial' && hit <= 2) healTarget(ctx, defenderSide, lane, 2, 'steam_dampen');
    }
    if (defElement === 'fire' && on('fire_retaliation')) {
      const blockedMode = V.fireRetaliation !== 'onHit';
      if ((blockedMode && hit === 0) || (!blockedMode && hit > 0)) {
        const retaliation = V.fireRetaliation === 'blocked3' ? 3 : 2;
        extraDamage(ctx, defenderSide, attackerSide, lane, retaliation, 'fire_retaliation');
      }
    }
    if (hit === 0 && defElement === 'air' && on('air_reflect'))
      extraDamage(ctx, defenderSide, attackerSide, lane, 2, 'air_reflect');
    if (hit > 0 && defElement === 'lava' && on('lava_counter')) {
      const trigger = V.lavaCounter === 'strongHit' ? hit >= 3 : true;
      if (trigger) {
        const counter = V.lavaCounter === 'three' ? 3 : 2;
        extraDamage(ctx, defenderSide, attackerSide, lane, counter, 'lava_counter');
      }
    }
  }
}

// Доп. урон (ответный, отражённый, разряд) — по текущей цели линии,
// со щитом Нексуса получающей стороны на начало раунда.
function extraDamage(ctx, bySide, targetSide, lane, amount, ability) {
  if (ctx.effects) { ctx.effects.push({ kind: 'damage', side: targetSide, bySide, lane, amount, ability }); return; }
  const board = ctx.state[targetSide];
  const before = ctx.io.snapshot(board), stage = ctx.io.damageStage(board, lane);
  ctx.io.damage(board, lane, amount, ctx.nexusPct[targetSide]);
  const dealt = ctx.io.recordDamage(before, board, lane);
  if (dealt > 0) ctx.events.push({ side: targetSide, l: lane, stage, amount: dealt, element: '⚡', ability, extra: true });
  ctx.abilityEvents.push({ ability, side: bySide, lane, effect: 'damage', amount: dealt, target: targetSide });
}

// Лечение текущей цели линии с капом по максимуму структуры.
function healTarget(ctx, side, lane, amount, ability) {
  if (ctx.effects) { ctx.effects.push({ kind: 'heal', side, bySide: side, lane, amount, ability }); return; }
  const board = ctx.state[side];
  const healed = ctx.io.healStructure(board, lane, amount);
  if (healed > 0) {
    const stage = ctx.io.damageStage(board, lane);
    ctx.events.push({ side, l: lane, stage, amount: healed, element: '💧', ability, heal: true });
  }
  ctx.abilityEvents.push({ ability, side, lane, effect: 'heal', amount: healed, target: side });
}

// Presentation is derived from the same versioned match variants as combat.
export function statusDetails(key, value, rules = {}) {
  const meta = STATUS_META[key], v = resolveVariants(rules.variants);
  let counterplay = meta.counterplay;
  if (key === 'armor') counterplay = `Атака Воды смывает до ${v.waterStrip === 'two' ? 2 : 3} временной брони перед уроном.`;
  if (NEGATIVE_STATUSES.includes(key)) counterplay = 'Защитная пара Воды очищает негативные статусы этой линии до тика горения.'
    + (rules.counters !== false ? ' Очищение отменяется, только если на эту же линию атакует Гроза противника.' : ' Контрстихии в этом матче выключены.');
  return { ...meta, effect: meta.effect(value), counterplay };
}
export function abilityDescription(id, variants = {}) {
  const v = resolveVariants(variants);
  const descriptions = {
    fire_retaliation: `${v.fireRetaliation === 'blocked3' ? 3 : 2} ответного урона ${v.fireRetaliation === 'onHit' ? 'при пробитии защиты' : 'при полной блокировке'}`,
    lava_counter: `${v.lavaCounter === 'three' ? 3 : 2} ответного урона при попадании врага${v.lavaCounter === 'strongHit' ? ' не слабее 3' : ''}`,
    steam_dampen: `Уменьшает входящий урон на ${v.steamDampen === 'pct15' ? 15 : 10}%; полная блокировка лечит 2 HP`,
    water_cleanse: `Очищает ${v.waterCleanse === 'single' ? 'один негативный статус' : 'все негативные статусы'} до их применения; если их нет — лечит ${v.waterCleanse === 'heal1' ? 1 : 2} HP`,
    lava_pierce_burn: `Игнорирует ${v.lavaPierce === 'pct5' ? 5 : 10}% защиты; поджог 1 при попадании${v.lavaPierce === 'burnArmor' ? ' только по цели с временной бронёй' : ''}`,
    water_strip_armor: `Смывает до ${v.waterStrip === 'two' ? 2 : 3} временной брони до удара`,
    sandstorm_shield: `Добавляет ${v.sandstormShield === 'three' ? 3 : 4} к защите текущего раунда`,
  };
  return descriptions[id] ?? ABILITIES[id]?.desc ?? '';
}
// Known own modifiers only: opposing unrevealed cards can still counter them.
export function planningStats(placement, statuses = {}, rules = {}) {
  const result = { attack: 0, shield: 0 };
  const atk = placement.attack?.length === 2 ? placement.attack : null;
  const def = placement.defense?.length === 2 ? placement.defense : null;
  if (atk) result.attack = pairStats(atk).attack;
  if (def) result.shield = pairStats(def).defense;
  if (rules.abilities !== true) return result;
  const s = { ...statuses };
  if (def && elementOf(def).id === 'water') for (const key of NEGATIVE_STATUSES) delete s[key];
  if (atk) result.attack = Math.round((result.attack + (s.attackBoost || 0)) * (1-(s.weakenAttack||0)/100));
  if (def) {
    result.shield = Math.round(result.shield*(1-(s.weakenDefense||0)/100))+(s.armor||0);
    if (elementOf(def).id==='sandstorm') result.shield += resolveVariants(rules.variants).sandstormShield==='three'?3:4;
  }
  return result;
}
