import { type, elementName } from '../../shared/elements.js';
import { combo } from '../../shared/combos.js';

// Поле: 3 линии × башни, Нексусы, входы в Нексус (базовые цели).
// Рендер идентичен v1.5, но данные приходят из персонального PlayerView.
const LANE_NAMES = ['ВЕРХ', 'ЦЕНТР', 'НИЗ'];

const cardHTML = (c) => `<span class="mini ${'♥♦'.includes(c.s) ? 'red' : ''}">${c.r}<span class="suit">${c.s}</span></span>`;

function tower({ hp, max, icon, label, lane, kind, active, slots }) {
  const cards = active ? slots[lane][kind] : [];
  const element = active && hp > 0 && cards.length === 2 ? ` element-${{ '🔥': 'fire', '💧': 'water', '🪨': 'earth', '🌪️': 'air', '♨️': 'steam', '🌫️': 'storm' }[type(cards)]}` : '';
  return `<div class="tower ${hp <= 0 ? 'dead' : ''}${active && hp > 0 ? ' drop-target' : ''}${element}" ${active ? `data-lane="${lane}" data-kind="${kind}"` : ''}>
    <div class="em">${hp <= 0 ? '💥' : icon}</div>
    <div class="tag">${label}</div>
    <div class="value">${Math.max(0, hp)} / ${max}</div>
    <div class="tinybar"><i style="width:${Math.max(0, (hp / max) * 100)}%"></i></div>
    ${active ? `<div class="tower-cards">${cards.map((c) => `<span class="mini ${'♥♦'.includes(c.s) ? 'red' : ''}${c.justPlaced ? ' landed' : ''}">${c.r}<span class="suit">${c.s}</span></span>`).join('')}</div>
    <div class="element-label">${cards.length === 2 ? elementName(cards) : ''}</div>
    <div class="drop-hint">${cards.length ? `${combo(cards)} · ${type(cards)} · ↺` : (kind === 'atk' ? '♥♦ АТАКА' : '♠♣ ЗАЩИТА')}</div>` : ''}
  </div>`;
}

export function Board(view, mySlots, myHand) {
  // mySlots: локальная раскладка [{atk:[card,card], def:[card,card]}×3] из руки (объекты карт).
  const me = view.board.me, opp = view.board.opponent;
  let html = `<div class="battle-head"><div>◀ МОИ ЛИНИИ</div><div>ЛИНИЯ</div><div>ЛИНИИ СОПЕРНИКА ▶</div></div>`;
  for (let l = 0; l < 3; l++) {
    const defIcon = type(mySlots[l].def), atkIcon = type(mySlots[l].atk);
    const oppAtk = opp?.outer[l] > 0;
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
