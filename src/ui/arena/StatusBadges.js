// Индикаторы и панель активных статусов на башнях/этажах Нексуса.
// Данные — из серверного состояния (board.statuses, числовые значения);
// описания/подсказки — из STATUS_META (shared/abilities.js, единый источник).
import { STATUS_META } from '../../../shared/abilities.js';
import { ELEMENTS } from '../../../shared/elements.js';

const elName = (id) => ELEMENTS[id]?.name ?? id;
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

// Панель подробностей: фактические данные из игрового состояния.
// Не обещает гарантированное очищение — учитывает контрстихии (см. counterplay).
export function statusPanelHTML(statuses, { mine = true } = {}) {
  const active = Object.entries(statuses ?? {}).filter(([, v]) => v);
  if (!active.length) return '';
  const items = active.map(([key, value]) => {
    const m = STATUS_META[key];
    if (!m) return '';
    const sources = m.sources(value).map(elName).join(' или ');
    return `<div class="status-detail status-detail-${key}">
      <div class="status-detail-title"><span class="st-ico">${m.icon}</span><b>${m.name}</b><span class="st-val">${value}</span></div>
      <div class="status-detail-row"><span>Действие:</span> ${m.effect(value)}</div>
      <div class="status-detail-row"><span>Источник:</span> ${sources}</div>
      <div class="status-detail-row"><span>Срабатывание:</span> ${m.timing}</div>
      <div class="status-detail-row"><span>Осталось:</span> ${m.duration}</div>
      <div class="status-detail-row status-counterplay"><span>Противодействие:</span> ${m.counterplay}</div>
    </div>`;
  }).join('');
  return `<div class="status-panel" role="tooltip" data-owner="${mine ? 'me' : 'opp'}">
    <div class="status-panel-head">Активные эффекты линии ${mine ? '(ваша сторона)' : '(соперник)'}</div>
    ${items}
    <div class="status-panel-note">Эффекты пересчитываются сервером в начале каждого раунда.</div>
  </div>`;
}

// Кнопка закрытия для мобильных — через tap-обработчик (см. bindStatusPanels).


// target — элемент башни или этажа Нексуса; statuses — статусы этой линии.
function mount(target, statuses, mine) {
  if (!target) return;
  target.querySelector(':scope > .status-badges')?.remove();
  target.querySelector(':scope > .status-panel')?.remove();
  const html = statusBadgesHTML(statuses);
  if (!html) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = html + statusPanelHTML(statuses, { mine });
  const node = wrap.firstElementChild;
  target.appendChild(node);
  target.classList.toggle('has-status', true);
  // Точные значения — в data-атрибуты (для пересчёта панелей при hover-делегировании).
  node.dataset.statuses = JSON.stringify(statuses);
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

// Основной рендер: бейджи + панели (панели скрыты CSS, открываются hover/tap).
export function renderStatusBadges(root, boardMe, boardOpp) {
  if (!root) return;
  root.querySelectorAll('.status-badges, .status-panel').forEach((el) => el.remove());
  root.querySelectorAll('.tower.has-status, .nexus-floor.has-status').forEach((el) =>
    el.classList.remove('has-status', 'status-burning', 'status-armored', 'status-weakened', 'status-boosted'));
  const meStatuses = boardMe?.statuses ?? [{}, {}, {}];
  const oppStatuses = boardOpp?.statuses ?? [{}, {}, {}];
  for (let lane = 0; lane < 3; lane++) {
    mount(structureTarget(root, lane, true), meStatuses[lane], true);
    mount(structureTarget(root, lane, false), oppStatuses[lane], false);
  }
  // Визуальные классы для анимаций (горение/броня/ослабление/заряд).
  root.querySelectorAll('[data-statuses]').forEach((node) => {
    try {
      const st = JSON.parse(node.dataset.statuses);
      const owner = node.closest('.tower, .nexus-floor');
      if (st.burn) owner?.classList.add('status-burning');
      if (st.armor) owner?.classList.add('status-armored');
      if (st.weakenAttack || st.weakenDefense) owner?.classList.add('status-weakened');
      if (st.attackBoost) owner?.classList.add('status-boosted');
    } catch { /* повреждённые данные игнорируются */ }
  });
  // Clicks are handled on the structure by EffectInspector, including badges.
  // A selected pair must reach the placement handler instead of being swallowed.
}

// Tap-взаимодействие (мобильные): короткое нажатие на бейджи линии открывает
// панель; нажатие вне панели закрывает. ПК использует CSS hover — не мешает.
export function bindStatusInteractions(root) {
  if (!root) return;
  root.querySelectorAll('.status-badges').forEach((badges) => {
    if (badges.dataset.bound === '1') return;
    badges.dataset.bound = '1';
    badges.addEventListener('click', (e) => {
      e.stopPropagation();
      const panel = badges.parentElement?.querySelector(':scope > .status-panel');
      if (!panel) return;
      const wasOpen = panel.classList.contains('open');
      document.querySelectorAll('.status-panel.open').forEach((p) => p.classList.remove('open'));
      if (!wasOpen) panel.classList.add('open');
    });
  });
}

// Закрытие открытых панелей по клику вне (вешается один раз на документ).
let outsideBound = false;
export function bindStatusOutsideClose() {
  if (outsideBound || typeof document === 'undefined') return;
  outsideBound = true;
  document.addEventListener('click', () => {
    document.querySelectorAll('.status-panel.open').forEach((p) => p.classList.remove('open'));
  });
}
