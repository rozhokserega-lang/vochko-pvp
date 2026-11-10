import './styles.css';
import './combat-v5.css';
import './ui/arena/arena.css';
import './ui/card-panel/card-panel.css';
import { ensureSession, supabase } from './lib/supabase.js';
import { api } from './lib/api.js';
import { watchMatch } from './lib/realtime.js';
import { Lobby, waitingRoom } from './ui/Lobby.js';
import { battleHTML as Board, nexusPhaseBar } from './ui/arena/ArenaScene.js';
import { applyArenaLayout } from './ui/arena/ArenaScene.js';
import { initArenaLayoutEditor, isArenaDebugEnabled } from './ui/arena/ArenaLayoutEditor.js';
import { loadLayoutOverrides } from './ui/arena/arenaLayout.js';
import { cardPanelHTML, cardPanelToolsHTML, initCardPanel, isAttackCard, PANEL_LANES, renderPanelCards, renderPanelPreview } from './ui/card-panel/CardPanel.js';
import { clearFloats, playRoundAnimation, bindCombatUI, isCombatPlaying } from './ui/animations.js';
import { animateMeters, METER_LAST } from './ui/meters.js';
import { nextReportRound, hasNewBattle as hasNewBattleReport } from './ui/combat-logic.js';
import { EndScreen } from './ui/EndScreen.js';

const app = document.getElementById('app');
const byId = (c) => document.getElementById(c);

let view = null;          // персональный PlayerView с сервера
let myHand = [];          // объекты карт моей руки
let slots = [];           // локальная раскладка: [{atk:[card,card], def:[card,card]}×3]
let selected = [];        // id выбранных карт (0..2)
let submission = null;
let unwatch = null;
let lastReportRound = 0; // номер уже показанного отчёта (для постановки у обоих игроков)
let refreshEpoch = 0;    // защита от «зависшего» get-state при смене экрана/матча

const cardById = (id) => myHand.find((c) => c.id === id);
const usedIds = () => new Set(slots.flatMap((s) => [...s.atk, ...s.def].map((c) => c.id)));
const currentSubmission = () => submission?.matchId === view?.matchId && submission?.round === view?.round ? submission : null;
const turnLocked = () => view.status !== 'planning' || view.me.ready || !!currentSubmission() || isCombatPlaying();
const missingCardPrefix = 'Карты нет в руке: ';

function keepDraftCards(keep) {
  selected = selected.filter(keep);
  for (const slot of slots) {
    slot.atk = slot.atk.filter((card) => keep(card.id));
    slot.def = slot.def.filter((card) => keep(card.id));
  }
}

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
  byId('panelEditor')?.remove();
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
    const params = new URLSearchParams(location.search);
    params.set('room', code.toUpperCase());
    history.replaceState(null, '', '?' + params);
    await enterMatch(r.matchId);
  } catch (e) { renderLobby('Не удалось войти: ' + (e.message ?? 'комната недоступна')); }
}

// ── Экран матча ────────────────────────────────────────────────────────────
async function enterMatch(matchId) {
  refreshEpoch++;
  submission = null;
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
  const params = new URLSearchParams(location.search);
  params.delete('room');
  history.replaceState(null, '', location.pathname + (params.size ? '?' + params : ''));
  if (unwatch) { unwatch(); unwatch = null; }
  clearFloats();
  lastReportRound = 0;
  selected = [];
  submission = null;
  slots = resetSlots(); slotsState.round = 0;
  myHand = []; view = null;
  if (matchId) api.leaveRoom(matchId).catch(() => { /* finished/нет участия — не критично */ });
  renderLobby();
}

async function refresh(matchId) {
  const epoch = refreshEpoch; // сменился pantalla/матч — устаревший get-state игнорируем
  const next = await api.getState(matchId);
  if (epoch !== refreshEpoch || (view?.matchId === matchId && next.version < view.version)) return;
  view = next;
  (window.__animLog = window.__animLog || []).push({ fn: 'refresh', ver: view.version, round: view.round, repRound: view.latestRoundReport?.round ?? 0, playing: isCombatPlaying(), at: Date.now() % 100000 });
  // Хореография боя захватывает UI: новое состояние применяется после неё.
  if (isCombatPlaying()) return;
  const finished = view.status === 'finished' || !!view.winner;
  const rep = view.latestRoundReport;
  // Анимация играет обоим, когда появляется НОВЫЙ отчёт раунда.
  const repRound = nextReportRound(rep, { finished, round: view.round });
  const hasNewBattle = hasNewBattleReport(rep, repRound, lastReportRound);
  // Второй ещё не вошёл — показываем экран ожидания вместо поля.
  if (view.status === 'waiting') {
    app.replaceChildren(waitingRoom(view.matchId, view.roomCode, link, { onExit: () => exitMatch(view.matchId, 'Отменить комнату и вернуться в лобби?') }));
    return;
  }
  myHand = view.me.hand;
  if (view.matchId !== slotsState.matchId || view.round !== slotsState.round) {
    slots = resetSlots(); selected = [];
    METER_LAST.clear(); slotsState.matchId = view.matchId; slotsState.round = view.round;
  } else {
    const handIds = new Set(myHand.map((card) => card.id));
    keepDraftCards((id) => handIds.has(id));
  }
  // Финал без нового боя: переход в реванш или финальный экран.
  if (finished && !hasNewBattle) {
    // Аудит п.5: оба игрока автоматически уходят в новый матч после реванша.
    if (view.nextMatchId && view.nextMatchId !== view.matchId) {
      lastReportRound = 0; slots = resetSlots(); slotsState.round = 0;
      return enterMatch(view.nextMatchId);
    }
    render();
    showEndScreen(view);
    return;
  }
  render(hasNewBattle);
  if (hasNewBattle) {
    // Финальный бой тоже играется полностью ДО экрана победы (v19 §6).
    lastReportRound = repRound;
    playRoundAnimation(view);
    return;
  }
  // Флажок «только что положено» гаснет — повторные перерисовки не переигрывают прилёт.
  setTimeout(() => { for (const s of slots) for (const c of [...s.atk, ...s.def]) c.justPlaced = false; }, 500);
}

const slotsState = { matchId: null, round: 0 };
const resetSlots = () => Array.from({ length: 3 }, () => ({ atk: [], def: [] }));

function doRematch(btn) {
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Ждём соперника…'; }
  api.rematch(view.matchId).then((r) => {
    if (!r.waiting) { lastReportRound = 0; slots = resetSlots(); slotsState.round = 0; enterMatch(r.matchId); }
  }).catch(() => { if (btn) { btn.disabled = false; btn.textContent = '🔁 Реванш'; } });
}

function render(resolving = false) {
  if (isCombatPlaying()) return; // UI заморожен на время боевой хореографии
  const panelState = { round: view.round, blocked: resolving || turnLocked(),
    ready: view.status === 'planning' && (view.me.ready || currentSubmission()?.accepted) };
  const root = document.createElement('div');
  root.innerHTML = `
    <header><div><h1>ВОЧКО <span style="color:#e7ecf6">/ ТРИ ЛИНИИ</span></h1>
      <div class="sub">PvP · сид ${view.seat} · комната ${view.roomCode}${view.opponent?.isBot ? ' · против бота' : ''}</div></div>
      <button class="exit-btn" id="exitBtn" title="Выйти в лобби" aria-label="Выйти в лобби">🚪 Выйти</button></header>
    <div class="wrap">
      <div class="score" id="nexusScore">${nexusPhaseBar(view)}</div>
      <div class="arena-and-hand">
        <div class="battle" id="lanes">${Board(view, slots, myHand)}</div>
        ${cardPanelHTML(panelState)}
      </div>
      <section class="hand-area card-panel-area">
        ${cardPanelToolsHTML(panelState)}
      </section>
    </div>`;
  app.replaceChildren(root);
  applyArenaLayout();
  initArenaLayoutEditor();

  const hand = byId('hand');
  initCardPanel(hand);
  renderPanelCards(hand, myHand, selected, usedIds(), panelState.blocked);
  animateMeters();
  updatePreview();

  hand.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-card]');
    if (!btn || turnLocked() || dragId) return;
    const id = btn.dataset.card;
    if (selected.includes(id)) selected = selected.filter((x) => x !== id);
    else if (selected.length === 2) return setStatus('Можно выбрать только две карты.');
    else if (selected.length && isAttackCard(cardById(selected[0])) !== isAttackCard(cardById(id)))
      return setStatus('Выбери две карты одного цвета.');
    else selected.push(id);
    btn.classList.toggle('selected', selected.includes(id));
    btn.setAttribute('aria-pressed', selected.includes(id));
    setStatus('');
    updatePreview();
  });

  root.querySelectorAll('.tower.drop-target, .nexus-floor.drop-target').forEach((target) => {
    const { lane, kind } = target.dataset;
    target.tabIndex = panelState.blocked ? -1 : 0;
    target.setAttribute('role', 'button');
    target.setAttribute('aria-label', `${kind === 'atk' ? 'Атака' : 'Защита'}, ${PANEL_LANES[lane]}`);
    target.onclick = () => placeCards(target, selected);
    target.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); target.click(); }
    };
  });

  byId('clearBtn').onclick = () => { if (turnLocked()) return; selected = []; slots = resetSlots(); render(); };
  byId('fightBtn').onclick = submit;
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

function updatePreview() {
  renderPanelPreview(byId('hand'), selected.map(cardById));
}

function placeCards(target, ids) {
  if (turnLocked()) return;
  const lane = +target.dataset.lane, kind = target.dataset.kind;
  const cards = ids.map(cardById);
  const used = usedIds();
  if (cards.some((card) => !card || used.has(card.id) || isAttackCard(card) !== (kind === 'atk')))
    return setStatus('Не та масть для этой башни.');
  const pair = slots[lane][kind];
  slots[lane][kind] = !cards.length || pair.length + cards.length > 2 ? cards : [...pair, ...cards];
  cards.forEach((card) => { card.justPlaced = true; });
  selected = [];
  render();
}

async function submit() {
  if (turnLocked()) return;
  const placements = slots.map((s, l) => ({
    lane: l,
    attack: s.atk.map((c) => c.id),
    defense: s.def.map((c) => c.id),
  }));
  if (placements.some((p) => p.attack.length !== 2 || p.defense.length !== 2))
    return setStatus('Собери 3 атакующие и 3 защитные пары.');
  const { matchId, round, version: expectedVersion } = view;
  const turn = { matchId, round, expectedVersion, placements };
  const pending = submission = { matchId, round, accepted: false };
  render();
  setStatus('Отправляем ход…');
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        await api.submitTurn(turn);
        pending.accepted = true;
        break;
      } catch (e) {
        const retryable = /stale|таймаут|timeout/i.test(e.message) || e.name === 'AbortError';
        if (!retryable || attempt >= 2 || currentSubmission() !== pending) throw e;
        await refresh(matchId);
        if (currentSubmission() !== pending || view.status !== 'planning' || view.me.ready) return;
      }
    }
    if (submission !== pending) return;
    setStatus('Ход отправлен. Ждём обновления матча.');
    await refresh(matchId);
  } catch (e) {
    if (currentSubmission() !== pending || isCombatPlaying()) return;
    if (pending.accepted) {
      setStatus('Ход принят. Обнови страницу, чтобы получить состояние матча.');
    } else {
      const missingCard = e.message?.startsWith(missingCardPrefix) ? e.message.slice(missingCardPrefix.length) : null;
      if (missingCard) {
        await refresh(matchId).catch(() => {});
        if (currentSubmission() !== pending) return;
        if (!view.me.ready) keepDraftCards((id) => id !== missingCard);
      }
      submission = null;
      render();
      if (view.me.ready) return;
      if (missingCard) setStatus(`Сервер отклонил карту ${missingCard}. Выбери другую карту для освободившегося места.`);
      else setStatus('Ошибка отправки: ' + (e.message || 'повтори попытку'));
    }
  }
}

// ── Drag & drop (мышь + тач, v1.5) ─────────────────────────────────────────
let dragId = null, ghost = null, dragStart = null;

function wireDrag() {
  const hand = byId('hand');
  hand.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-card]');
    if (!el || el.disabled || turnLocked()) return;
    dragStart = { id: el.dataset.card, x: e.clientX, y: e.clientY, pointerId: e.pointerId, el };
  });
}
window.addEventListener('pointermove', (e) => {
  if (!dragStart || e.pointerId !== dragStart.pointerId) return;
  if (!dragId && Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y) > 9) {
    dragId = dragStart.id;
    ghost = dragStart.el.cloneNode(true);
    ghost.classList.add('panel-card-ghost');
    ghost.style.cssText = `position:fixed;z-index:13000;width:53px;left:${e.clientX - 26}px;top:${e.clientY - 37}px;pointer-events:none;opacity:.9`;
    document.body.appendChild(ghost);
  }
  if (dragId) {
    e.preventDefault();
    ghost.style.left = (e.clientX - 26) + 'px';
    ghost.style.top = (e.clientY - 37) + 'px';
    document.querySelectorAll('.drag-over').forEach((x) => x.classList.remove('drag-over'));
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.drop-target');
    target?.classList.add('drag-over');
  }
}, { passive: false });
window.addEventListener('pointerup', (e) => {
  if (!dragStart || e.pointerId !== dragStart.pointerId) return;
  if (dragId) {
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.drop-target');
    if (target) placeCards(target, selected.length === 2 && selected.includes(dragId) ? selected : [dragId]);
    else setStatus('Перетащи карту на доступную башню.');
  }
  ghost?.remove(); ghost = null; dragId = null; dragStart = null;
  document.querySelectorAll('.drag-over').forEach((x) => x.classList.remove('drag-over'));
});
window.addEventListener('pointercancel', () => { ghost?.remove(); ghost = null; dragId = null; dragStart = null; });

function renderError(message) {
  app.replaceChildren(Object.assign(document.createElement('div'), { className: 'lobby', innerHTML: `<h2>Ошибка</h2><div class="sub">${message}</div>` }));
}

boot();
