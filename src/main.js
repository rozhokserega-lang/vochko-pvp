import './styles.css';
import { ensureSession, supabase } from './lib/supabase.js';
import { api } from './lib/api.js';
import { watchMatch } from './lib/realtime.js';
import { Lobby, waitingRoom } from './ui/Lobby.js';
import { Board, nexusPanel } from './ui/Board.js';
import { renderPreview, roundReportHTML, wireReportClicks } from './ui/PairPreview.js';
import { showRoundDamage, clearFloats } from './ui/animations.js';
import { EndScreen } from './ui/EndScreen.js';

const app = document.getElementById('app');
const byId = (c) => document.getElementById(c);

let view = null;          // персональный PlayerView с сервера
let myHand = [];          // объекты карт моей руки
let slots = [];           // локальная раскладка: [{atk:[card,card], def:[card,card]}×3]
let selected = [];        // id выбранных карт (0..2)
let fortifyLane = null;   // выбранная линия укрепления до submit
let fortifyMode = false;
let unwatch = null;
let lastVersion = 0;

const cardById = (id) => myHand.find((c) => c.id === id);
const usedIds = () => new Set(slots.flatMap((s) => [...s.atk, ...s.def].map((c) => c.id)));

// ── Лобби ──────────────────────────────────────────────────────────────────
async function boot() {
  try { await ensureSession(); } catch (e) { return renderError('Не удалось войти: ' + e.message); }
  const roomParam = new URLSearchParams(location.search).get('room');
  if (roomParam) return joinRoom(roomParam);
  renderLobby();
}

function renderLobby(joinError) {
  app.replaceChildren(Lobby({
    onCreate: async () => {
      try { const r = await api.createRoom(); app.replaceChildren(waitingRoom(r.matchId, r.roomCode, link)); await enterMatch(r.matchId); }
      catch (e) { renderLobby(e.message); }
    },
    onJoin: (code) => joinRoom(code),
    joinError,
  }));
}

function link(code) { return `${location.origin}${location.pathname}?room=${code}`; }

async function joinRoom(code) {
  try {
    const r = await api.joinRoom(code);
    history.replaceState(null, '', `?room=${code.toUpperCase()}`);
    await enterMatch(r.matchId);
  } catch (e) { renderLobby('Не удалось войти: ' + (e.message ?? 'комната недоступна')); }
}

// ── Экран матча ────────────────────────────────────────────────────────────
async function enterMatch(matchId) {
  clearFloats();
  if (unwatch) unwatch();
  unwatch = watchMatch(matchId, () => refresh(matchId));
  await refresh(matchId);
}

async function refresh(matchId, afterEvents = false) {
  view = await api.getState(matchId);
  if (view.version <= lastVersion && !afterEvents) return render();
  lastVersion = view.version;
  myHand = view.me.hand;
  if (view.round !== slotsState.round) { slots = resetSlots(); slotsState.round = view.round; }
  if (view.status === 'finished' || view.winner) {
    render();
    const title = view.winner === 'draw' ? '🤝 Ничья' : view.winner === 'me' ? '🏆 Победа!' : '💀 Поражение';
    app.appendChild(EndScreen({
      title,
      message: view.winner === 'draw' ? 'Оба Нексуса разрушены или лимит раундов.' :
        view.winner === 'me' ? 'Нексус соперника разрушен.' : 'Твой Нексус разрушен.',
      canRematch: view.canRematch,
      onRematch: doRematch,
      onLeave: () => { api.leaveRoom(view.matchId); location.href = location.pathname; },
    }));
    return;
  }
  if (afterEvents && view.latestRoundReport) showRoundDamage(view.latestRoundReport.events, view.seat);
  render();
}

const slotsState = { round: 0 };
const resetSlots = () => Array.from({ length: 3 }, () => ({ atk: [], def: [] }));

function doRematch(btn) {
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Ждём соперника…'; }
  api.rematch(view.matchId).then((r) => {
    if (!r.waiting) { lastVersion = 0; slots = resetSlots(); slotsState.round = 0; enterMatch(r.matchId); }
  }).catch(() => { if (btn) { btn.disabled = false; btn.textContent = '🔁 Реванш'; } });
}

function render() {
  const root = document.createElement('div');
  root.innerHTML = `
    <header><div><h1>ВОЧКО <span style="color:#e7ecf6">/ ТРИ ЛИНИИ</span></h1>
      <div class="sub">PvP · сид ${view.seat} · комната ${view.roomCode}</div></div>
      <div class="pill" id="roundBadge">Раунд ${view.round}</div></header>
    <div class="wrap">
      <div class="score" id="nexusScore">${nexusPanel(view)}</div>
      <div class="battle" id="lanes">${Board(view, slots, myHand)}</div>
      <section class="hand-area">
        <div class="hand-head"><div><strong>МОЯ РУКА</strong>
          <div class="sub">Тяни карту на башню или выбери две карты и нажми на цель.</div></div>
          <span class="toast" id="selectedInfo">Выбрано: ${selected.length} / 2</span></div>
        <div class="hand" id="hand"></div>
        <div class="pair-preview" id="pairPreview"></div>
        <div class="tactic-panel">
          <button class="btn ${fortifyMode || fortifyLane !== null ? 'gold' : ''}" id="fortifyBtn" ${view.me.fortifyUsed || view.status !== 'planning' ? 'disabled' : ''}>
            ${view.me.fortifyUsed ? '🛡 Укрепление использовано' : fortifyLane !== null ? `🛡 Укрепить: ${['ВЕРХ', 'ЦЕНТР', 'НИЗ'][fortifyLane]} (можно снять)` : '🛡 Укрепить линию (1/1)'}</button>
          <div class="fortify-lanes" ${fortifyMode ? '' : 'hidden'}>
            <button data-fort="0">ВЕРХ</button><button data-fort="1">ЦЕНТР</button><button data-fort="2">НИЗ</button><button data-fort="cancel">Отмена</button>
          </div>
          <button class="btn" id="clearBtn" ${view.me.ready ? 'disabled' : ''}>↩ Очистить</button>
          <button class="btn gold" id="fightBtn" ${view.status !== 'planning' ? 'disabled' : ''}>${view.me.ready ? '⏳ Ждём соперника' : '⚔ Готов'}</button>
        </div>
        <div class="status" id="status">${view.me.ready && !view.opponent.ready ? 'Ход отправлен. Ждём соперника — карты скрыты от него.' : ''}</div>
        <div class="battle-reports" id="battleReports">${roundReportHTML(view, view.seat)}</div>
        <div class="legend">♥♥ 🔥 · ♦♦ 💧 · ♠♠ 🪨 · ♣♣ 🌪️ · ♥♦ ♨️ Пар · ♠♣ 🌫️ Буря · Огонь&Пар жгут: 4/2</div>
      </section>
    </div>`;
  app.replaceChildren(root);

  renderHand();
  renderPreview(byId('pairPreview'), selected.map(cardById));
  wireReportClicks(byId('battleReports'), view, view.seat);

  byId('hand').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-card]');
    if (!btn || view.me.ready) return;
    const id = btn.dataset.card;
    if (selected.includes(id)) selected = selected.filter((x) => x !== id);
    else if (selected.length < 2) selected.push(id);
    render();
  });

  root.querySelectorAll('.tower.drop-target').forEach((t) => t.addEventListener('click', () => {
    if (view.me.ready) return;
    const lane = +t.dataset.lane, kind = t.dataset.kind;
    if (!selected.length) { slots[lane][kind] = []; render(); return; } // клик по башне без выбора — снять пару
    const allowed = kind === 'atk' ? '♥♦' : '♠♣';
    if (selected.some((id) => !allowed.includes(cardById(id).s))) return setStatus('Не та масть для этой башни.');
    const pair = slots[lane][kind];
    if (pair.length + selected.length > 2) { slots[lane][kind] = []; }
    selected.forEach((id) => { const c = cardById(id); if (c && slots[lane][kind].length < 2) slots[lane][kind].push(c); });
    selected = [];
    render();
  }));

  byId('fortifyBtn').onclick = () => { if (view.me.fortifyUsed) return; fortifyMode = !fortifyMode; render(); };
  root.querySelectorAll('[data-fort]').forEach((b) => b.onclick = () => {
    fortifyLane = b.dataset.fort === 'cancel' ? null : +b.dataset.fort;
    fortifyMode = false; render();
  });

  byId('clearBtn').onclick = () => { selected = []; slots = resetSlots(); render(); };
  byId('fightBtn').onclick = () => submit();
  wireDrag();
}

function setStatus(text) { const el = byId('status'); if (el) el.textContent = text; }

function renderHand() {
  const hand = byId('hand');
  if (!hand) return;
  const used = usedIds();
  hand.replaceChildren(...myHand.map((c) => {
    const b = document.createElement('button');
    b.className = `card ${'♥♦'.includes(c.s) ? 'red' : ''} ${used.has(c.id) ? 'used' : ''} ${selected.includes(c.id) ? 'selected' : ''}`;
    b.dataset.card = c.id;
    b.draggable = false;
    b.innerHTML = `${c.r}<small>${c.s}</small>`;
    return b;
  }));
}

async function submit(attempt = 0) {
  const placements = slots.map((s, l) => ({
    lane: l,
    attack: s.atk.map((c) => c.id),
    defense: s.def.map((c) => c.id),
  }));
  if (placements.some((p) => p.attack.length !== 2 || p.defense.length !== 2))
    return setStatus('Собери 3 атакующие и 3 защитные пары.');
  byId('fightBtn').disabled = true;
  try {
    const r = await api.submitTurn({ matchId: view.matchId, round: view.round, expectedVersion: view.version, placements, fortifyLane });
    lastVersion = 0;
    await refresh(view.matchId, !!r.resolved);
  } catch (e) {
    const stale = String(e.message ?? '').includes('stale');
    if (stale && attempt < 1) {
      await refresh(view.matchId);   // соперник успел раньше: берём свежую версию и повторяем
      return submit(attempt + 1);
    }
    setStatus('Ошибка: ' + (e.message ?? 'повтори попытку'));
    const btn = byId('fightBtn'); if (btn) btn.disabled = false;
  }
}

// ── Drag & drop (мышь + тач, v1.5) ─────────────────────────────────────────
let dragId = null, ghost = null, dragStart = null;

function wireDrag() {
  const hand = byId('hand');
  hand.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-card]');
    if (!el || el.classList.contains('used') || view.me.ready) return;
    dragStart = { id: el.dataset.card, x: e.clientX, y: e.clientY, pointerId: e.pointerId, el };
  });
}
window.addEventListener('pointermove', (e) => {
  if (!dragStart || e.pointerId !== dragStart.pointerId) return;
  if (!dragId && Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y) > 9) {
    dragId = dragStart.id;
    ghost = dragStart.el.cloneNode(true);
    ghost.style.cssText = `position:fixed;z-index:13000;width:53px;left:${e.clientX - 26}px;top:${e.clientY - 37}px;pointer-events:none;opacity:.9`;
    document.body.appendChild(ghost);
  }
  if (dragId) {
    e.preventDefault();
    ghost.style.left = (e.clientX - 26) + 'px';
    ghost.style.top = (e.clientY - 37) + 'px';
    document.querySelectorAll('.drag-over').forEach((x) => x.classList.remove('drag-over'));
    document.elementFromPoint(e.clientX, e.clientY)?.closest('.drop-target')?.classList.add('drag-over');
  }
}, { passive: false });
window.addEventListener('pointerup', (e) => {
  if (!dragStart || e.pointerId !== dragStart.pointerId) return;
  if (dragId) {
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.drop-target');
    if (target) {
      const lane = +target.dataset.lane, kind = target.dataset.kind;
      const c = cardById(dragId);
      const allowed = kind === 'atk' ? '♥♦' : '♠♣';
      if (c && allowed.includes(c.s) && !view.me.ready) {
        const pair = slots[lane][kind];
        if (pair.some((x) => x.id === dragId)) {} // уже там
        else if (pair.length >= 2) slots[lane][kind] = [c];
        else pair.push(c);
        render();
      }
    } else setStatus('Перетащи карту на доступную башню.');
  }
  ghost?.remove(); ghost = null; dragId = null; dragStart = null;
  document.querySelectorAll('.drag-over').forEach((x) => x.classList.remove('drag-over'));
});
window.addEventListener('pointercancel', () => { ghost?.remove(); ghost = null; dragId = null; dragStart = null; });

function renderError(message) {
  app.replaceChildren(Object.assign(document.createElement('div'), { className: 'lobby', innerHTML: `<h2>Ошибка</h2><div class="sub">${message}</div>` }));
}

boot();
