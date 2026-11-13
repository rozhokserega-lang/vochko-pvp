// Стихийные способности, статусы и таблица контрстихий.
// Единственный источник данных для движка, бота, клиента и симулятора.
// Движок (engine.js) передаёт io-хелперы явно — модуль не импортирует engine.js,
// поэтому циклических зависимостей нет.
import { elementOf } from './elements.js';
import { coreAbilityBonus } from './nexus-core.js';

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

function collisionBlocks(ctx, attackerSide, lane, atkElement, defElement, enabled) {
  const blocks = counterBlocks(atkElement, defElement, enabled);
  const defenderSide = attackerSide === 'a' ? 'b' : 'a';
  if (ctx.unblocked?.includes(`${attackerSide}:${lane}:attack`)) blocks.atk = false;
  if (ctx.unblocked?.includes(`${defenderSide}:${lane}:defense`)) blocks.def = false;
  return blocks;
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
    counterplay: 'Действует до конца следующего раунда; контрстихия Вода (у Грозы) не влияет на буст.',
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
export function addStatus(statuses, lane, key, value, limit) {
  if (lane < 0 || lane > 2) return;
  const cap = limit ?? STATUS_CAPS[key] ?? 99;
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
  const ctx = {
    state, rng, nexusPct, disabled: disabled ?? new Set(), events, abilityEvents, io,
    applied: { a: emptyStatuses(), b: emptyStatuses() },
    next: { a: emptyStatuses(), b: emptyStatuses() },
    burned: { a: [false, false, false], b: [false, false, false] },
    disabledBySide: opts.disabledBySide ?? {},
    unblocked: opts.unblocked ?? [],
    cores:opts.cores??{},coreProfile:opts.coreProfile??'balanced',coreDisabled:opts.coreDisabled??[],
  };
  const burns = [];
  for (const side of ['a', 'b']) {
    const V = resolveVariants(opts.variantsBySide?.[side] ?? variants);
    const on = id => !ctx.disabled.has(id) && !(ctx.disabledBySide[side] ?? []).includes(id);
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
      const cleanseBlocked = counters && isCounter(oppAtkElement, 'water') && !ctx.unblocked.includes(`${side}:${l}:defense`);
      if (defElement === 'water' && on('water_cleanse') && !cleanseBlocked) {
        const negatives = NEGATIVE_STATUSES.filter((k) => s[k]);
        if (negatives.length && V.waterCleanse !== 'noCleanse') {
          const toRemove = V.waterCleanse === 'single' ? negatives.slice(0, 1) : negatives;
          for (const k of toRemove) delete s[k];
          abilityEvents.push({ ability: 'water_cleanse', side, lane: l, effect: 'cleanse', removed: toRemove });
        } else if (!negatives.length && V.waterCleanse !== 'noHeal') {
          healTarget(ctx, side, l, (V.waterCleanse === 'heal1' ? 1 : 2)+coreAbilityBonus(ctx,side,'water_cleanse','heal'), 'water_cleanse');
        }
      } else if (defElement === 'water' && on('water_cleanse') && cleanseBlocked) {
        abilityEvents.push({ ability: 'counter_triggered', side, lane: l, effect: 'counter',
          by: oppAtkElement, canceled: 'water_cleanse', target: side });
      }
      // Тик поджога: урон по текущей цели, затем поджог погашен.
      if (s.burn) {
        ctx.burned[side][l] = true;
        burns.push({ side, l, amount: s.burn });
      }
      // Статусы этого раунда применены — съём; новые выставит разрешение раунда.
      ctx.applied[side][l] = { ...s };
      board.statuses[l] = {};
    }
  }
  // Complete every cleanse/heal before any burn tick: Nexus healing must not
  // depend on whether a burning lane happens to be above or below the healer.
  for (const {side, l, amount} of burns) {
    const board = state[side], before = io.snapshot(board), stage = io.damageStage(board, l);
    io.damage(board, l, amount, nexusPct[side]);
    const dealt = io.recordDamage(before, board, l);
    events.push({ side, l, stage, amount: dealt, element:'🔥', burn:dealt, burnTick:true, requested:amount });
    abilityEvents.push({ability:'burn_tick',side,lane:l,effect:'damage',amount:dealt,target:side});
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
  const on = id => !ctx.disabled.has(id) && !(ctx.disabledBySide?.[ABILITIES[id].role === 'attack' ? attackerSide : defenderSide] ?? []).includes(id);
  const blocks = collisionBlocks(ctx,attackerSide,lane,atkElement,defElement,counters);
  const VA = resolveVariants(p.atkVariants ?? variants), V = resolveVariants(p.defVariants ?? variants);
  const atkS = ctx.applied[attackerSide][lane] || {};
  const defS = ctx.applied[defenderSide][lane] || {};

  let attack = atkStat + (atkS.attackBoost || 0);
  attack = Math.round(attack * (1 - (atkS.weakenAttack || 0) / 100));

  let defense = Math.round(defStat * (1 - (defS.weakenDefense || 0) / 100));
  const armor = defS.armor || 0;
  defense += armor;
  if (defElement === 'sandstorm' && on('sandstorm_shield') && !blocks.def) {
    defense += (V.sandstormShield === 'three' ? 3 : 4)+coreAbilityBonus(ctx,defenderSide,'sandstorm_shield','shield');
  }

  let armorStripped = 0;
  if (atkElement === 'water' && on('water_strip_armor') && !blocks.atk && armor > 0) {
    armorStripped = Math.min((VA.waterStrip === 'two' ? 2 : 3)+coreAbilityBonus(ctx,attackerSide,'water_strip_armor','strip'), armor);
    defense = Math.max(0, defense - armorStripped);
  }
  if (atkElement === 'earth' && on('earth_pierce_def') && !blocks.atk) defense = Math.round(defense * (1-(15+coreAbilityBonus(ctx,attackerSide,'earth_pierce_def','percent'))/100));
  if (atkElement === 'lava' && on('lava_pierce_burn') && !blocks.atk) {
    defense = Math.round(defense * (1-((VA.lavaPierce === 'pct5' ? 5 : 10)+coreAbilityBonus(ctx,attackerSide,'lava_pierce_burn','percent'))/100));
  }

  if (defElement === 'fire_vortex' && on('fire_vortex_zaslon') && !blocks.def &&
      [lane - 1, lane + 1].some((j) => j >= 0 && j < 3 && ctx.burned[defenderSide][j])) {
    attack = Math.round(attack * (1-(10+coreAbilityBonus(ctx,defenderSide,'fire_vortex_zaslon','percent'))/100));
  }

  let hit = Math.max(0, attack - defense);
  if (defElement === 'steam' && on('steam_dampen') && !blocks.def) {
    hit = Math.round(hit * (1-((V.steamDampen === 'pct15' ? 15 : 10)+coreAbilityBonus(ctx,defenderSide,'steam_dampen','percent'))/100));
  }
  return { attack, defense, hit, armorStripped, ...blocks };
}

// ── Последствия попадания и защитные триггеры ───────────────────────────────
// Требуемый порядок: урон уже нанесён → on-hit атакующего → триггеры защиты.
export function hitConsequences(p) {
  const { ctx, state, attackerSide, lane, atkElement, defElement, hit, rng, counters = false, variants = {} } = p;
  const defenderSide = attackerSide === 'a' ? 'b' : 'a';
  const on = id => !ctx.disabled.has(id) && !(ctx.disabledBySide?.[ABILITIES[id].role === 'attack' ? attackerSide : defenderSide] ?? []).includes(id);
  const next = ctx.next;
  const blocks = collisionBlocks(ctx,attackerSide,lane,atkElement,defElement,counters);
  const VA = resolveVariants(p.atkVariants ?? variants), V = resolveVariants(p.defVariants ?? variants);

  const bonus=(side,id,key)=>coreAbilityBonus(ctx,side,id,key);
  const status=(side,l,key,value,id,owner)=>addStatus(next[side],l,key,value+bonus(owner,id,key==='burn'?'burn':key==='armor'?'armor':key==='attackBoost'?'charge':'percent'),key==='burn'&&ctx.cores?.[owner]?6:undefined);

  // Нейтрализация — только специальная способность; числовой урон уже нанесён.
  if (blocks.atk && on(abilityIdOf(atkElement,'attack'))) {
    const canceled = abilityIdOf(atkElement, 'attack');
    ctx.abilityEvents.push({ ability: 'counter_triggered', side: defenderSide, lane,
      effect: 'counter', by: defElement, canceled, target: defenderSide });
  }
  // Water's round-start counter was already recorded by applyStatuses.
  if (blocks.def && defElement !== 'water' && on(abilityIdOf(defElement,'defense'))) {
    const canceled = abilityIdOf(defElement, 'defense');
    ctx.abilityEvents.push({ ability: 'counter_triggered', side: defenderSide, lane,
      effect: 'counter', by: atkElement, canceled, target: defenderSide });
  }

  if (hit > 0 && !blocks.atk) { // способности, требующие попадания
    if (atkElement === 'fire' && on('fire_burn'))
      status(defenderSide, lane, 'burn', 2,'fire_burn',attackerSide);
    if (atkElement === 'lava' && on('lava_pierce_burn')) {
      const burnCondition = VA.lavaPierce === 'burnArmor' ? ((ctx.applied[defenderSide][lane] || {}).armor || 0) > 0 : true;
      if (burnCondition) status(defenderSide,lane,'burn',1,'lava_pierce_burn',attackerSide);
    }
    if (atkElement === 'air' && on('air_weaken_def'))
      status(defenderSide,lane,'weakenDefense',10,'air_weaken_def',attackerSide);
    if (atkElement === 'steam' && on('steam_weaken_def'))
      status(defenderSide,lane,'weakenDefense',15,'steam_weaken_def',attackerSide);
    if (atkElement === 'ice' && on('ice_weaken_def'))
      status(defenderSide,lane,'weakenDefense',10,'ice_weaken_def',attackerSide);
    if (atkElement === 'sandstorm' && on('sandstorm_weaken_atk'))
      status(defenderSide,lane,'weakenAttack',15,'sandstorm_weaken_atk',attackerSide);
    if (atkElement === 'fire_vortex' && on('fire_vortex_spread'))
      for (const j of [lane - 1, lane + 1]) status(defenderSide,j,'burn',1,'fire_vortex_spread',attackerSide);
    if (atkElement === 'thunderstorm' && on('thunderstorm_discharge')) {
      const others = [0, 1, 2].filter((j) => j !== lane);
      const j = others[Math.floor(rng() * others.length)];
      extraDamage(ctx, attackerSide, defenderSide, j, 2+bonus(attackerSide,'thunderstorm_discharge','damage'), 'thunderstorm_discharge');
    }
  }

  // Защитные триггеры (элемент защитной пары линии).
  if (!blocks.def) {
    if (defElement === 'earth' && on('earth_armor'))
      status(defenderSide,lane,'armor',3,'earth_armor',defenderSide);
    if (defElement === 'ice' && on('ice_weaken_atk'))
      status(attackerSide,lane,'weakenAttack',15,'ice_weaken_atk',defenderSide);
    if (defElement === 'thunderstorm' && on('thunderstorm_charge') && hit > 0)
      status(defenderSide,lane,'attackBoost',2,'thunderstorm_charge',defenderSide);
    if (defElement === 'steam' && on('steam_dampen')) {
      if (hit === 0) healTarget(ctx, defenderSide, lane, 2+bonus(defenderSide,'steam_dampen','heal'), 'steam_dampen');
      else if (V.steamDampen === 'healPartial' && hit <= 2) healTarget(ctx, defenderSide, lane, 2+bonus(defenderSide,'steam_dampen','heal'), 'steam_dampen');
    }
    if (defElement === 'fire' && on('fire_retaliation')) {
      const blockedMode = V.fireRetaliation !== 'onHit';
      if ((blockedMode && hit === 0) || (!blockedMode && p.absorbed > 0)) {
        const retaliation = (V.fireRetaliation === 'blocked3' ? 3 : 2)+bonus(defenderSide,'fire_retaliation','damage');
        extraDamage(ctx, defenderSide, attackerSide, lane, retaliation, 'fire_retaliation');
      }
    }
    if (hit === 0 && defElement === 'air' && on('air_reflect'))
      extraDamage(ctx, defenderSide, attackerSide, lane, 2+bonus(defenderSide,'air_reflect','damage'), 'air_reflect');
    if (hit > 0 && defElement === 'lava' && on('lava_counter')) {
      const trigger = V.lavaCounter === 'strongHit' ? hit >= 3 : true;
      if (trigger) {
        const counter = (V.lavaCounter === 'three' ? 3 : 2)+bonus(defenderSide,'lava_counter','damage');
        extraDamage(ctx, defenderSide, attackerSide, lane, counter, 'lava_counter');
      }
    }
  }
}

// Доп. урон (ответный, отражённый, разряд) — по текущей цели линии,
// со щитом Нексуса получающей стороны на начало раунда.
function extraDamage(ctx, bySide, targetSide, lane, amount, ability) {
  if (ctx.effects) { ctx.effects.push({kind:'damage',bySide,targetSide,lane,amount,ability}); return; }
  const board = ctx.state[targetSide];
  const before = ctx.io.snapshot(board), stage = ctx.io.damageStage(board, lane);
  ctx.io.damage(board, lane, amount, ctx.nexusPct[targetSide]);
  const dealt = ctx.io.recordDamage(before, board, lane);
  if (dealt > 0) ctx.events.push({ side: targetSide, l: lane, stage, amount: dealt, element: '⚡', ability, extra: true });
  ctx.abilityEvents.push({ ability, side: bySide, lane, effect: 'damage', amount: dealt, requested:stage==='nexus'?Math.round(amount*ctx.nexusPct[targetSide]/100):amount, target: targetSide });
}

// Лечение текущей цели линии с капом по максимуму структуры.
function healTarget(ctx, side, lane, amount, ability) {
  if (ctx.effects) { ctx.effects.push({kind:'heal',side,lane,amount,ability}); return; }
  const board = ctx.state[side];
  const healed = ctx.io.healStructure(board, lane, amount);
  if (healed > 0) {
    const stage = ctx.io.damageStage(board, lane);
    ctx.events.push({ side, l: lane, stage, amount: healed, element: '💧', ability, heal: true });
  }
  ctx.abilityEvents.push({ ability, side, lane, effect: 'heal', amount: healed, target: side });
}

export function flushAbilityEffects(ctx) {
  const effects = ctx.effects;
  ctx.effects = null;
  // Healing checks the surviving primary target before secondary hits. Every
  // secondary hit is pinned to that same structure; none resurrects a ruin.
  for (const e of effects.filter(e => e.kind === 'heal')) healTarget(ctx,e.side,e.lane,e.amount,e.ability);
  for (const e of effects.filter(e => e.kind === 'damage')) extraDamage(ctx,e.bySide,e.targetSide,e.lane,e.amount,e.ability);
}
