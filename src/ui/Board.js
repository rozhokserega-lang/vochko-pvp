import { type, elementName } from '../../shared/elements.js';
import { combo, comboDetails } from '../../shared/combos.js';

// Поле: 3 линии × башни, Нексусы, входы в Нексус (базовые цели).
// Рендер идентичен v1.5, но данные приходят из персонального PlayerView.
const LANE_NAMES = ['ВЕРХ', 'ЦЕНТР', 'НИЗ'];

export const cardHTML = (c) => `<span class="mini ${'♥♦'.includes(c.s) ? 'red' : ''}">${c.r}<span class="suit">${c.s}</span></span>`;

// Шкалы силы над башнями: последняя ширина запоминается для плавной анимации.
export const METER_LAST = new Map();

export function meterHTML(cards, kind, lane) {
  const complete = cards.length === 2;
  const power = complete ? combo(cards) : 0;
  const element = complete ? type(cards) : '';
  const key = lane + '-' + kind;
  const pct = complete ? 100 : 0;
  const previous = METER_LAST.has(key) ? METER_LAST.get(key) : 0;
  METER_LAST.set(key, pct);
  const caption = kind === 'atk' ? '⚔ АТАКА' : '🛡 ЗАЩИТА';
  return `<div class="power-meter ${kind === 'atk' ? 'power-attack' : 'power-defense'}" aria-label="${caption}: ${power} из ${power} (полная шкала)">
    <div class="power-meter-head"><span>${caption}</span><strong>${power}</strong><span class="power-element">${element}</span></div>
    <div class="power-meter-track"><i data-meter-target="${pct}" style="width:${previous}%"></i></div>
  </div>`;
}

export function animateMeters() {
  // Без requestAnimationFrame: в перекрытых окнах RAF замирает и шкала
  // остаётся пустой; обычный таймер работает всегда.
  setTimeout(() => {
    document.querySelectorAll('[data-meter-target]').forEach((el) => {
      el.style.width = el.dataset.meterTarget + '%';
    });
  }, 30);
}

export function tower({ hp, max, icon, label, lane, kind, active, slots }) {
  const cards = active ? slots[lane][kind] : [];
  const element = active && hp > 0 && cards.length === 2 ? ` element-${{ '🔥': 'fire', '💧': 'water', '🪨': 'earth', '🌪️': 'air', '♨️': 'steam', '🌫️': 'storm' }[type(cards)]}` : '';
  return `<div class="tower ${hp <= 0 ? 'dead' : ''}${active && hp > 0 ? ' drop-target' : ''}${element}" ${active ? `data-lane="${lane}" data-kind="${kind}"` : ''}>
    ${active ? meterHTML(cards, kind, lane) : ''}
    ${active ? `<div class="tower-cards">${cards.map((c) => `<span class="mini ${'♥♦'.includes(c.s) ? 'red' : ''}${c.justPlaced ? ' landed' : ''}">${c.r}<span class="suit">${c.s}</span></span>`).join('')}</div>` : ''}
    <div class="em">${hp <= 0 ? '💥' : icon}</div>
    <div class="tag">${label}</div>
    <div class="value">${Math.max(0, hp)} / ${max}</div>
    <div class="tinybar"><i style="width:${Math.max(0, (hp / max) * 100)}%"></i></div>
    ${active ? `<div class="element-label">${cards.length === 2 ? elementName(cards) : ''}</div>` : ''}
  </div>`;
}

export function Board(view, mySlots, myHand) {
  // mySlots: локальная раскладка [{atk:[card,card], def:[card,card]}×3] из руки (объекты карт).
  const me = view.board.me, opp = view.board.opponent;
  let html = `<div class="battle-head"><div>◀ МОИ ЛИНИИ</div><div>ЛИНИЯ</div><div>ЛИНИИ СОПЕРНИКА ▶</div></div>`;
  for (let l = 0; l < 3; l++) {
    const defIcon = type(mySlots[l].def), atkIcon = type(mySlots[l].atk);
    html += `<div class="lane">
      <div class="side"><div class="tower-group">
        ${tower({ hp: me.inner[l], max: 18, icon: defIcon, label: 'МОЯ ВНУТРЕННЯЯ', lane: l, kind: 'def', active: me.outer[l] <= 0 && me.inner[l] > 0, slots: mySlots })}
        ${tower({ hp: me.outer[l], max: 12, icon: defIcon, label: 'МОЯ ВНЕШНЯЯ', lane: l, kind: 'def', active: me.outer[l] > 0, slots: mySlots })}
      </div></div>
      <div class="centerlane"><b>${LANE_NAMES[l]}</b><span>⚔</span><small>${l + 1}</small></div>
      <div class="side enemy"><div class="tower-group">
        ${tower({ hp: opp.outer[l], max: 12, icon: '🏰', label: 'ВРАГ: ВНЕШ.', lane: l, kind: 'atk', active: opp.outer[l] > 0, slots: mySlots })}
        ${tower({ hp: opp.inner[l], max: 18, icon: '🏰', label: 'ВРАГ: ВНУТР.', lane: l, kind: 'atk', active: opp.outer[l] <= 0 && opp.inner[l] > 0, slots: mySlots })}
      </div></div>
    </div>`;
  }
  return html;
}

export function nexusPanel(view, mySlots) {
  const me = view.board.me, opp = view.board.opponent;
  // Входы в Нексус: у себя показываем защитную пару (она «переезжает» сюда,
  // когда линия пробита); у соперника раскладка скрыта до разрешения раунда.
  const baseLane = (state, own) => [0, 1, 2].map((l) => {
    const open = state.outer[l] <= 0 && state.inner[l] <= 0;
    const kind = own ? 'def' : 'atk';
    const pair = own && mySlots ? mySlots[l][kind] : [];
    return `<div class="base-lane ${open ? 'open drop-target' : ''}" ${open ? `data-lane="${l}" data-kind="${kind}"` : ''} title="${open ? 'Открытый путь' : 'Сначала разрушить обе башни линии'}"><span>${['Ⅰ','Ⅱ','Ⅲ'][l]} ${open ? '⚡' : '🔒'}</span>${open && pair.length ? `<div class="base-cards">${pair.map(cardHTML).join('')}</div>` : ''}</div>`;
  }).join('');
  return `<div class="nexus"><div class="orb">🔷</div><div style="flex:1">
      <div class="sub">МОЙ НЕКСУС</div><div class="hp">${me.nexus} / 80</div>
      <div class="bar"><div class="fill" style="width:${(me.nexus / 80) * 100}%"></div></div>
      <div class="sub">Щит: ${me.shieldPct ?? 0}%</div>
      <div class="base-targets" id="myBaseTargets">${baseLane(me, true)}</div></div></div>
    <div class="middle"><div class="sub">ПРОТИВ</div><strong>⚔</strong><div class="sub" id="phase">${view.status === 'planning' ? 'Раскладка' : view.status === 'finished' ? 'Финал' : 'Ожидание'}</div></div>
    <div class="nexus enemy"><div class="orb">🔶</div><div style="flex:1">
      <div class="sub">НЕКСУС СОПЕРНИКА</div><div class="hp">${opp.nexus} / 80</div>
      <div class="bar"><div class="fill" style="width:${(opp.nexus / 80) * 100}%"></div></div>
      <div class="sub">Щит: ${opp.shieldPct ?? 0}%</div>
      <div class="base-targets">${baseLane(opp, false)}</div></div></div>`;
}
