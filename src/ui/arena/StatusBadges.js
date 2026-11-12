// Бейджи активных статусов на башнях/этажах Нексуса.
// Статусы публичны (сервер отдаёт их в get-state) — рисуем обеим сторонам.
const BADGES = [
  ['burn', '🔥', 'Поджог: урон в начале раунда'],
  ['armor', '🪨', 'Временная броня (Земля)'],
  ['weakenAttack', '📉⚔', 'Атака линии ослаблена'],
  ['weakenDefense', '📉🛡', 'Защита линии ослаблена'],
  ['attackBoost', '⚡', 'Атака линии усилена (Гроза)'],
];

export function statusBadgesHTML(statuses) {
  const chips = BADGES.filter(([key]) => statuses?.[key])
    .map(([key, icon]) => `<span class="status-badge status-${key}" data-status="${key}">${icon}${statuses[key]}</span>`);
  return chips.length ? `<div class="status-badges">${chips.join('')}</div>` : '';
}

// target — элемент башни или этажа Нексуса; statuses — статусы этой линии.
function mount(target, statuses) {
  if (!target) return;
  target.querySelector(':scope > .status-badges')?.remove();
  const html = statusBadgesHTML(statuses);
  if (!html) return;
  target.insertAdjacentHTML('beforeend', html);
}

// Куда крепить бейдж линии: живая внешняя → внутренняя → этаж Нексуса.
function structureTarget(root, lane, mine) {
  const outerSel = `.tower[data-arena-id="tower-${mine ? 'ally-def' : 'enemy-atk'}-${lane}-outer"]`;
  const innerSel = `.tower[data-arena-id="tower-${mine ? 'ally-def' : 'enemy-atk'}-${lane}-inner"]`;
  const nexusSel = `.nexus-fortress.${mine ? 'ally' : 'enemy'} .nexus-floor[data-lane="${lane}"]`;
  const pick = (sel) => {
    const el = root.querySelector(sel);
    return el && !el.classList.contains('dead') ? el : null;
  };
  return pick(outerSel) ?? pick(innerSel) ?? root.querySelector(nexusSel);
}

export function renderStatusBadges(root, boardMe, boardOpp) {
  if (!root) return;
  root.querySelectorAll('.status-badges').forEach((el) => el.remove());
  const meStatuses = boardMe?.statuses ?? [{}, {}, {}];
  const oppStatuses = boardOpp?.statuses ?? [{}, {}, {}];
  for (let lane = 0; lane < 3; lane++) {
    mount(structureTarget(root, lane, true), meStatuses[lane]);
    mount(structureTarget(root, lane, false), oppStatuses[lane]);
  }
}
