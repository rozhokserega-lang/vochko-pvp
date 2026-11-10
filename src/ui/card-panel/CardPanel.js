import panel from './assets/panel.png';
import readyNormal from './assets/ready_normal.png';
import readyPressed from './assets/ready_pressed.png';
import { attackInfo, elementName, SUIT_ELEMENT } from '../../../shared/elements.js';
import { fortifiedAttack, fortifiedDefense } from '../../../shared/engine.js';
import { elementAnimHTML } from '../arena/ElementEffect.js';

// Percentages of panel.png, measured after trimming its transparent padding.
export const cardPanelLayout = {
  round: { x: 2.6, y: 43, w: 10.4, h: 31 },
  defenseCards: { x: 16.1, y: 43, w: 26.9, h: 37 },
  elementCircle: { x: 46.18, y: 34.6, w: 7.8, h: 47.06 },
  powerLabel: { x: 46.4, y: 8.8, w: 7.2, h: 15 },
  attackCards: { x: 56.95, y: 43, w: 26.9, h: 37 },
  reinforceButton: { x: 85.75, y: 36.5, w: 12.05, h: 18.5 },
  readyButton: { x: 86, y: 60, w: 11.55, h: 23.2 },
};

export const PANEL_LANES = ['Верх', 'Центр', 'Низ'];
export const isAttackCard = (card) => card.s === '♥' || card.s === '♦';
const debug = new URLSearchParams(location.search).get('panelDebug') === '1';
const layout = structuredClone(cardPanelLayout);

function applyZone(element, box) {
  for (const key of ['x', 'y', 'w', 'h']) element.style.setProperty('--zone-' + key, box[key] + '%');
}

export function cardPanelHTML({ round, blocked, ready, fortifyUsed, fortifyMode, fortifyLane }) {
  const fortifyHint = fortifyUsed ? 'Укрепление уже использовано в этом матче'
    : blocked ? 'Укрепление доступно во время раскладки'
    : fortifyLane === null ? 'Укрепить линию (1 из 1)'
    : 'Укрепление: ' + PANEL_LANES[fortifyLane];
  return `
    <div id="hand" class="card-panel${debug ? ' panel-debug' : ''}"
      style="--panel-art:url('${panel}')" aria-label="Управление картами">
      <div class="panel-zone panel-round" data-zone="round" id="roundBadge">Раунд <b>${round}</b></div>
      <div class="panel-zone panel-cards" data-zone="defenseCards" role="group" aria-label="Защита"></div>
      <div class="panel-zone panel-sphere" data-zone="elementCircle"><div id="panelEffect"></div></div>
      <div class="panel-zone panel-power" data-zone="powerLabel" id="panelPower" role="status"></div>
      <div class="panel-zone panel-cards" data-zone="attackCards" role="group" aria-label="Атака"></div>
      <button type="button" class="panel-zone panel-reinforce" data-zone="reinforceButton" id="fortifyBtn"
        title="${fortifyHint}" aria-label="${fortifyHint}" aria-expanded="${fortifyMode}"
        aria-pressed="${fortifyLane !== null}" aria-disabled="${blocked || fortifyUsed}"></button>
      <button type="button" class="panel-zone panel-ready" data-zone="readyButton" id="fightBtn"
        aria-label="${ready ? 'Ход отправлен' : 'Готово'}" ${blocked ? 'disabled' : ''}>
        <img src="${readyNormal}" alt="" draggable="false">
        <img src="${readyPressed}" alt="" draggable="false">
      </button>
    </div>`;
}

export function cardPanelToolsHTML({ blocked, ready, fortifyMode, fortifyLane }) {
  return `
    <div class="panel-tools">
      <button type="button" class="btn" id="clearBtn" ${blocked ? 'disabled' : ''}>↩ Очистить</button>
      <div class="panel-fortify-options" ${fortifyMode && !blocked ? '' : 'hidden'} aria-label="Линия укрепления">
        ${PANEL_LANES.map((label, lane) => `<button type="button" class="btn" data-fort="${lane}">${label}</button>`).join('')}
        <button type="button" class="btn" data-fort="cancel">Снять</button>
      </div>
      ${fortifyLane === null ? '' : `<span>🛡 ${PANEL_LANES[fortifyLane]}</span>`}
      <div class="panel-status" id="status" role="status">${ready ? 'Ход отправлен. Ждём соперника.' : ''}</div>
    </div>`;
}

export function renderPanelCards(hand, cards, selected, used, blocked) {
  for (const [zone, attack] of [['defenseCards', false], ['attackCards', true]]) {
    hand.querySelector(`[data-zone="${zone}"]`).replaceChildren(...cards.filter((c) => isAttackCard(c) === attack).map((card) => {
      const button = document.createElement('button');
      const chosen = selected.includes(card.id);
      const placed = used.has(card.id);
      button.type = 'button';
      button.className = `card panel-card${attack ? ' red' : ''}${chosen ? ' selected' : ''}${placed ? ' used' : ''}`;
      button.dataset.card = card.id;
      button.disabled = blocked || placed;
      button.setAttribute('aria-label', card.r + card.s);
      button.setAttribute('aria-pressed', chosen);
      button.innerHTML = `<span class="panel-card-corner">${card.r}<span>${card.s}</span></span>
        <span class="panel-card-element" aria-hidden="true">${SUIT_ELEMENT[card.s]}</span>`;
      return button;
    }));
  }
}

export function renderPanelPreview(hand, cards, fortified = false) {
  const effect = hand.querySelector('#panelEffect');
  const power = hand.querySelector('#panelPower');
  const pair = cards.length === 2 && isAttackCard(cards[0]) === isAttackCard(cards[1]);
  const attack = pair && isAttackCard(cards[0]);
  const info = pair ? attackInfo(attack ? cards : [], attack ? [] : cards) : null;
  const element = info ? (attack ? info.at : info.dt) : '';
  if (effect.dataset.element !== element) {
    effect.dataset.element = element;
    effect.innerHTML = elementAnimHTML(element);
  }
  const value = !info ? '' : attack ? (fortified ? fortifiedAttack(info.a) : info.a)
    : (fortified ? fortifiedDefense(info.d) : info.d);
  power.textContent = info ? `${attack ? '⚔' : '🛡'} ${value}` : '';
  power.dataset.kind = info ? (attack ? 'attack' : 'defense') : '';
  power.title = info ? `${elementName(cards)} · Сила до учёта скрытых карт соперника` : '';
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
