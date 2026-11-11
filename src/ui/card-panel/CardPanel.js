import panel from './assets/panel-unified.png';
import readyNormal from './assets/ready_normal.png';
import readyPressed from './assets/ready_pressed.png';
import { pairStats, elementOf, ELEMENTS } from '../../../shared/elements.js';
import { elementAnimHTML } from '../arena/ElementEffect.js';

// Зоны приложенного арта 2172×724. Одна рука, без разделения по цвету.
export const cardPanelLayout = {
  round: { x: 2.5, y: 60, w: 11.8, h: 15 },
  cards: { x: 17.2, y: 56, w: 65.6, h: 25.8 },
  elementCircle: { x: 44.2, y: 11.2, w: 11.6, h: 33.6 },
  powerLabel: { x: 36, y: 47.5, w: 28, h: 6.5 },
  readyButton: { x: 86, y: 61, w: 11.5, h: 12.5 },
};

export const PANEL_LANES = ['Верх', 'Центр', 'Низ'];
const elementIcons = {
  '♠': `<svg viewBox="0 0 32 32" aria-hidden="true">
    <path fill="#9b643d" stroke="#563520" stroke-width="1.6" stroke-linejoin="round" d="M2 22l5-11 9-8 9 4 5 14-5 7H10z"/>
    <path fill="#d7ac76" d="M7 11l9-8 9 4-9 6-3 8-11 1z"/>
    <path fill="#69462f" d="M25 7l5 14-5 7H10l3-7 3-8z"/>
    <path fill="none" stroke="#eed3ab" stroke-width="1.4" stroke-linecap="round" d="m16 13 3 5-2 5"/>
  </svg>`,
  '♣': `<svg viewBox="0 0 32 32" aria-hidden="true">
    <g fill="none" stroke="#087b91" stroke-width="2.8" stroke-linecap="round">
      <path d="M3 12h17a3.5 3.5 0 1 0-3.5-3.5M6 18h20a3.5 3.5 0 1 0-3.5-3.5M3 24h12a3 3 0 1 1-3 3"/>
    </g>
    <path fill="none" stroke="#5ac3ce" stroke-width="1.2" stroke-linecap="round" d="M4 10h7m-4 6h9m-11 6h5"/>
  </svg>`,
};
const debug = new URLSearchParams(location.search).get('panelDebug') === '1';
const layout = structuredClone(cardPanelLayout);

function applyZone(element, box) {
  for (const key of ['x', 'y', 'w', 'h']) element.style.setProperty('--zone-' + key, box[key] + '%');
}

export function cardPanelHTML({ round, blocked, ready, progress }) {
  return `
    <div id="hand" class="card-panel${debug ? ' panel-debug' : ''}"
      style="--panel-art:url('${panel}')" aria-label="Управление картами">
      <img class="panel-art" src="${panel}" alt="" aria-hidden="true" draggable="false">
      <div class="panel-zone panel-round" data-zone="round" id="roundBadge">Раунд <b>${round}</b></div>
      <div class="panel-zone panel-cards" data-zone="cards" role="group" aria-label="Все карты руки"></div>
      <div class="panel-zone panel-sphere" data-zone="elementCircle"><div id="panelEffect"></div></div>
      <div class="panel-zone panel-power" data-zone="powerLabel" id="panelPower" role="status"></div>
      <button type="button" class="panel-zone panel-ready" data-zone="readyButton" id="fightBtn"
        aria-label="${ready ? 'Ход отправлен' : 'Готово'}" ${blocked ? 'disabled' : ''}>
        <img src="${readyNormal}" alt="" draggable="false">
        <img src="${readyPressed}" alt="" draggable="false">
      </button>
      ${progress ? `<div class="panel-progress" role="group" aria-label="Готовность хода" ${blocked ? 'aria-hidden="true"' : ''}>
        <span>Пара 1 ${progress.attack}/${progress.total}</span>
        <span>Пара 2 ${progress.defense}/${progress.total}</span>
      </div>` : ''}
    </div>`;
}

export function cardPanelToolsHTML({ blocked, ready, hint = '' }) {
  return `
    <div class="panel-tools">
      <button type="button" class="btn" id="clearBtn" ${blocked ? 'disabled' : ''}>↩ Очистить</button>
      <div class="panel-status" id="status" role="status" data-hint="${hint}">${ready ? 'Ход отправлен. Ждём соперника.' : hint}</div>
    </div>`;
}

export function renderPanelCards(hand, cards, selected, used, blocked, animateDeal = false) {
    hand.querySelector('[data-zone="cards"]').replaceChildren(...cards.map((card, index) => {
      const red = '♥♦'.includes(card.s);
      const button = document.createElement('button');
      const chosen = selected.includes(card.id);
      const placed = used.has(card.id);
      button.type = 'button';
      button.className = `card panel-card${red ? ' red' : ''}${chosen ? ' selected' : ''}${placed ? ' used' : ''}`;
      button.dataset.card = card.id;
      if (animateDeal) {
        button.classList.add('dealing');
        button.style.setProperty('--deal-delay', `${index * 24}ms`);
        button.addEventListener('animationend', () => button.classList.remove('dealing'), { once: true });
      }
      button.disabled = blocked || placed;
      button.setAttribute('aria-label', card.r + card.s);
      button.setAttribute('aria-pressed', chosen);
      button.innerHTML = `<span class="panel-card-corner">${card.r}<span>${card.s}</span></span>
        <span class="panel-card-element" aria-hidden="true">${elementIcons[card.s] ?? (card.s === '♥' ? '🔥' : '💧')}</span>`;
      return button;
    }));
}

export function renderPanelPreview(hand, cards) {
  const effect = hand.querySelector('#panelEffect');
  const power = hand.querySelector('#panelPower');
  const info = pairStats(cards);
  const element = info ? ELEMENTS[info.element].icon : '';
  if (effect.dataset.element !== element) {
    effect.dataset.element = element;
    effect.innerHTML = elementAnimHTML(element);
  }
  power.textContent = info ? `⚔ ${info.attack} · 🛡 ${info.defense}` : '';
  power.dataset.kind = info ? 'pair' : '';
  power.title = info ? `${elementOf(cards)?.name} · База ${info.basePower} · ×${info.m}` : '';
}

export function initCardPanel(hand) {
  for (const el of hand.querySelectorAll('[data-zone]')) applyZone(el, layout[el.dataset.zone]);
  if (!debug || document.getElementById('panelEditor')) return;
  const editor = document.createElement('aside');
  editor.id = 'panelEditor';
  editor.className = 'arena-debug-panel panel-editor';
  editor.innerHTML = `<div class="dbg-title">Координаты панели (%)</div>
    <select aria-label="Зона панели">${Object.keys(layout).map((key) => `<option>${key}</option>`).join('')}</select>
    <div class="dbg-grid">${['x', 'y', 'w', 'h'].map((key) =>
      `<label class="dbg-field"><span>${key}</span><input type="number" min="0" max="100" step="0.01" name="${key}"></label>`).join('')}</div>
    <div class="dbg-row"><button type="button" class="dbg-btn">Экспорт JSON</button></div>`;
  const select = editor.querySelector('select');
  const inputs = [...editor.querySelectorAll('input')];
  const sync = () => inputs.forEach((input) => { input.value = layout[select.value][input.name]; });
  select.onchange = sync;
  editor.oninput = ({ target }) => {
    if (!inputs.includes(target) || !target.value || !target.validity.valid) return;
    layout[select.value][target.name] = target.valueAsNumber;
    const zone = document.querySelector(`#hand [data-zone="${select.value}"]`);
    if (zone) applyZone(zone, layout[select.value]);
  };
  editor.querySelector('button').onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: 'cardPanelLayout.json' });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  sync();
  document.body.append(editor);
}
