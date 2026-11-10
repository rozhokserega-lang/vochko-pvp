import './styles.css';
import './combat-v5.css';
import './ui/arena/arena.css';
import { ensureSession, supabase } from './lib/supabase.js';
import { api } from './lib/api.js';
import { watchMatch } from './lib/realtime.js';
import { Lobby, waitingRoom } from './ui/Lobby.js';
import { battleHTML as Board, nexusPhaseBar } from './ui/arena/ArenaScene.js';
import { applyArenaLayout } from './ui/arena/ArenaScene.js';
import { initArenaLayoutEditor, isArenaDebugEnabled } from './ui/arena/ArenaLayoutEditor.js';
import { loadLayoutOverrides } from './ui/arena/arenaLayout.js';
import { renderPreview, roundReportHTML, wireReportClicks } from './ui/PairPreview.js';
import { clearFloats, playRoundAnimation, bindCombatUI, isCombatPlaying } from './ui/animations.js';
import { animateMeters, METER_LAST } from './ui/meters.js';
import { nextReportRound, hasNewBattle as hasNewBattleReport, fortifyLaneForSubmit } from './ui/combat-logic.js';
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
let lastReportRound = 0; // номер уже показанного отчёта (для постановки у обоих игроков)
let refreshEpoch = 0;    // защита от «зависшего» get-state при смене экрана/матча

const cardById = (id) => myHand.find((c) => c.id === id);
const usedIds = () => new Set(slots.flatMap((s) => [...s.atk, ...s.def].map((c) => c.id)));

// ── Лобби ──────────────────────────────────────────────────────────────────
async function boot() {
  loadLayoutOverrides(); // локальные правки геометрии арены (режим редактора)
  try { await ensureSession(); } catch (e) { return renderError('Не удалось войти: ' + e.message); }
  const roomParam = new URLSearchParams(location.search).get('room');
  // Аудит п.4: восстановление матча после F5 — и для создателя комнаты тоже.
  const saved = localStorage.getItem('vochko_match');
  if (roomParam) return joinRoom(roomParam);
  if (saved) {
    try {
      const v = await api.getState(saved);
      if (v && v.seat && v.status !== 'finished') { lastReportRound = v.latestRoundReport?.report?.[0]?.round ?? 0; return enterMatch(saved); }
    } catch { localStorage.removeItem('vochko_match'); }
  }
  renderLobby();
}

function renderLobby(joinError) {
  app.replaceChildren(Lobby({
    onCreate: async () => { try { const r = await api.createRoom(); app.replaceChildren(waitingRoom(r.matchId, r.roomCode, link, { onExit: () => exitMatch(r.matchId, 'Отменить комнату и вернуться в лобби?') })); await enterMatch(r.matchId); } catch (e) { renderLobby(e.message); } },
    onBot: async () => {
      try {
        const r = await api.createRoom({ vsBot: true });
        lastReportRound = 0; slots = resetSlots(); slotsState.round = 0;
        await enterMatch(r.matchId);
      } catch (e) { renderLobby(e.message); }
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
  refreshEpoch++;
  clearFloats();
  if (unwatch) unwatch();
  localStorage.setItem('vochko_match', matchId); // реконнект после F5 (аудит п.4)
  unwatch = watchMatch(matchId, () => refresh(matchId));
  await refresh(matchId);
}

// ── Выход из матча ─────────────────────────────────────────────────────────
// Кнопка в шапке + кнопка на экране ожидания. Чистит localStorage и ?room= —
// иначе F5 (реконнект по п.4) вернул игрока в покинутый матч.
function exitMatch(matchId = view?.matchId, confirmText) {
  const isBot = view?.opponent?.isBot;
  const text = confirmText ?? (isBot
    ? 'Выйти из матча с ботом? Прогресс раунда будет потерян.'
    : 'Выйти из матча? Соперник увидит «отключился»; у него будет 10 минут на возврат.');
  if (!window.confirm(text)) return;
  refreshEpoch++;
  localStorage.removeItem('vochko_match');
  history.replaceState(null, '', location.pathname);
  if (unwatch) { unwatch(); unwatch = null; }
  clearFloats();
  lastVersion = 0; lastReportRound = 0;
  selected = []; fortifyLane = null; fortifyMode = false;
  slots = resetSlots(); slotsState.round = 0;
  myHand = []; view = null;
  if (matchId) api.leaveRoom(matchId).catch(() => { /* finished/нет участия — не критично */ });
  renderLobby();
}

async function refresh(matchId, afterEvents = false) {
  const epoch = refreshEpoch; // сменился pantalla/матч — устаревший get-state игнорируем
  view = await api.getState(matchId);
  if (epoch !== refreshEpoch) return;
  (window.__animLog = window.__animLog || []).push({ fn: 'refresh', ver: view.version, round: view.round, repRound: view.latestRoundReport?.round ?? 0, afterEvents, playing: isCombatPlaying(), at: Date.now() % 100000 });
  // Хореография боя захватывает UI: новое состояние применяется после неё.
  if (isCombatPlaying()) return;
  const finished = view.status === 'finished' || !!view.winner;
  const rep = view.latestRoundReport;
  // Анимация играет обоим, когда появляется НОВЫЙ отчёт раунда.
  const repRound = nextReportRound(rep, { finished, round: view.round });
  const hasNewBattle = hasNewBattleReport(rep, repRound, lastReportRound);
  if (view.version <= lastVersion && !afterEvents && !hasNewBattle && !finished) return render();
  lastVersion = view.version;
  // Второй ещё не вошёл — показываем экран ожидания вместо поля.
  if (view.status === 'waiting') {
    app.replaceChildren(waitingRoom(view.matchId, view.roomCode, link, { onExit: () => exitMatch(view.matchId, 'Отменить комнату и вернуться в лобби?') }));
    return;
  }
  myHand = view.me.hand;
  // Укрепление — строго 1 раз ЗА МАТЧ. Если сервер уже засчитал его, локальный
  // выбор снимаем: иначе он уходил бы в каждый следующий submit, и сервер
  // отвечал бы 400 fortify-used до конца матча (игрок «застревал»).
  if (view.me.fortifyUsed && (fortifyLane !== null || fortifyMode)) { fortifyLane = null; fortifyMode = false; }
  if (view.round !== slotsState.round) { slots = resetSlots(); METER_LAST.clear(); slotsState.round = view.round; }
  // Финал без нового боя: переход в реванш или финальный экран.
  if (finished && !hasNewBattle) {
    // Аудит п.5: оба игрока автоматически уходят в новый матч после реванша.
    if (view.nextMatchId && view.nextMatchId !== view.matchId) {
      lastVersion = 0; lastReportRound = 0; slots = resetSlots(); slotsState.round = 0;
      return enterMatch(view.nextMatchId);
    }
    render();
    showEndScreen(view);
    return;
  }
  render();
  if (hasNewBattle) {
    // Финальный бой тоже играется полностью ДО экрана победы (v19 §6).
    lastReportRound = repRound;
    playRoundAnimation(view);
    return;
  }
  // Флажок «только что положено» гаснет — повторные перерисовки не переигрывают прилёт.
  setTimeout(() => { for (const s of slots) for (const c of [...s.atk, ...s.def]) c.justPlaced = false; }, 500);
}

const slotsState = { round: 0 };
const resetSlots = () => Array.from({ length: 3 }, () => ({ atk: [], def: [] }));

function doRematch(btn) {
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Ждём соперника…'; }
  api.rematch(view.matchId).then((r) => {
    if (!r.waiting) { lastVersion = 0; lastReportRound = 0; slots = resetSlots(); slotsState.round = 0; enterMatch(r.matchId); }
  }).catch(() => { if (btn) { btn.disabled = false; btn.textContent = '🔁 Реванш'; } });
}

function render() {
  if (isCombatPlaying()) return; // UI заморожен на время боевой хореографии
  const root = document.createElement('div');
  root.innerHTML = `
    <header><div><h1>ВОЧКО <span style="color:#e7ecf6">/ ТРИ ЛИНИИ</span></h1>
      <div class="sub">PvP · сид ${view.seat} · комната ${view.roomCode}${view.opponent?.isBot ? ' · против бота' : ''}</div></div>
      <div class="head-right"><div class="pill" id="roundBadge">Раунд ${view.round}</div>
      <button class="exit-btn" id="exitBtn" title="Выйти в лобби" aria-label="Выйти в лобби">🚪 Выйти</button></div></header>
    <div class="wrap">
      <div class="battle" id="lanes">${Board(view, slots, myHand)}</div>
      <div class="score" id="nexusScore">${nexusPhaseBar(view)}</div>
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
  applyArenaLayout();
  initArenaLayoutEditor();

  renderHand();
  animateMeters();
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

  root.querySelectorAll('.tower.drop-target, .nexus-floor.drop-target').forEach((t) => t.addEventListener('click', () => {
    if (view.me.ready) return;
    const lane = +t.dataset.lane, kind = t.dataset.kind;
    if (!selected.length) { slots[lane][kind] = []; render(); return; } // клик по башне без выбора — снять пару
    const allowed = kind === 'atk' ? '♥♦' : '♠♣';
    if (selected.some((id) => !allowed.includes(cardById(id).s))) return setStatus('Не та масть для этой башни.');
    const pair = slots[lane][kind];
    const before = pair.length;
    if (pair.length + selected.length > 2) { slots[lane][kind] = []; }
    selected.forEach((id) => { const c = cardById(id); if (c && slots[lane][kind].length < 2) { slots[lane][kind].push(c); c.justPlaced = true; } });
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
  byId('exitBtn').onclick = () => exitMatch();
  wireDrag();
}

function setStatus(text) { const el = byId('status'); if (el) el.textContent = text; }

// Экран финала — вызывается и из refresh, и из хореографии боя.
// Идемпотентный: повторные Realtime-события не наслаивают оверлеи.
function showEndScreen(v) {
  if (document.querySelector('.end-overlay')) return;
  const title = v.winner === 'draw' ? '🤝 Ничья' : v.winner === 'me' ? '🏆 Победа!' : '💀 Поражение';
  const message = v.winner === 'draw'
    ? 'Оба Нексуса разрушены или лимит раундов.'
    : v.winner === 'me' ? 'Нексус соперника разрушен.' : 'Твой Нексус разрушен.';
  app.appendChild(EndScreen({
    title,
    message,
    canRematch: v.canRematch,
    onRematch: doRematch,
    onLeave: () => { api.leaveRoom(v.matchId); localStorage.removeItem('vochko_match'); location.href = location.pathname; },
  }));
}

// Хореография боя рендерит финальное состояние и финальный экран сама.
bindCombatUI({ render, showEndScreen });

function renderHand() {
  const hand = byId('hand');
  if (!hand) return;
  const used = usedIds();
  // Стихия выбранной пары: обе карты «оживают» — огонь горит, вода льётся и т.д.
  const pairEl = selected.length === 2 ? elementOfPair(selected) : '';
  hand.replaceChildren(...myHand.map((c) => {
    const b = document.createElement('button');
    const glow = pairEl && selected.includes(c.id) ? ` el-${pairEl}` : '';
    b.className = `card ${'♥♦'.includes(c.s) ? 'red' : ''} ${used.has(c.id) ? 'used' : ''} ${selected.includes(c.id) ? 'selected' : ''}${glow}`;
    b.dataset.card = c.id;
    b.draggable = false;
    b.innerHTML = `<i class="rank">${c.r}</i><span class="suit">${c.s}</span>`;
    return b;
  }));
}

// Стихия пары по мастям (та же логика, что и в бою).
function elementOfPair(ids) {
  if (ids.length !== 2) return '';
  const a = cardById(ids[0]), b = cardById(ids[1]);
  if (!a || !b) return '';
  if (a.s === b.s) return { '♥': 'fire', '♦': 'water', '♠': 'earth', '♣': 'air' }[a.s];
  return (a.s === '♥' || a.s === '♦') ? 'steam' : 'storm';
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
    // Укрепление отправляем только если сервер ещё не засчитал его за матч.
    const r = await api.submitTurn({ matchId: view.matchId, round: view.round, expectedVersion: view.version, placements, fortifyLane: fortifyLaneForSubmit({ fortifyUsed: view.me.fortifyUsed, lane: fortifyLane }) });
    // Укрепление ушло этим ходом — повторно не отправляем (оно 1 раз за матч).
    if (fortifyLane !== null) { fortifyLane = null; fortifyMode = false; }
    lastVersion = 0;
    await refresh(view.matchId, !!r.resolved);
  } catch (e) {
    const msg = String(e.message ?? '');
    // Самовосстановление: если сервер говорит «укрепление уже использовано»,
    // снимаем локальный выбор и просим отправить раунд ещё раз. Иначе игрок
    // застревал бы до конца матча на каждом submit.
    if (msg === 'fortify-used') {
      fortifyLane = null; fortifyMode = false;
      await refresh(view.matchId);
      setStatus('Укрепление уже использовано в этом матче — оно снято. Нажми «Готов» ещё раз.');
      return;
    }
    const retryable = msg.includes('stale') || msg.includes('таймаут') || msg.includes('timeout') || e.name === 'AbortError';
    if (retryable && attempt < 2) {
      if (e.name === 'AbortError') await refresh(view.matchId); // ход мог доехать — сверимся (идемпотентно)
      return submit(attempt + 1);
    }
    setStatus('Ошибка: ' + (msg || 'повтори попытку'));
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
      const allowed = kind === 'atk' ? '♥♦' : '♠♣';
      if (!view.me.ready) {
        // Пара выбрана заранее — переносим обе карты разом; иначе тащим одиночную.
        const ids = selected.length === 2 ? [...selected] : [dragId];
        const cardsOk = ids.map(cardById).every((c) => c && allowed.includes(c.s));
        if (cardsOk) {
          const pair = slots[lane][kind];
          if (!(ids.length === 1 && pair.some((x) => x.id === dragId))) {
            if (pair.length + ids.length > 2) slots[lane][kind] = [];
            ids.forEach((id) => { const c = cardById(id); if (c && slots[lane][kind].length < 2) { slots[lane][kind].push(c); c.justPlaced = true; } });
            selected = [];
            render();
          }
        }
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
