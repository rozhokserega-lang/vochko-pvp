import { retainAttackCharges } from './ui/arena/AttackCharge.js';
import './ui/arena/attack-charge.css';
import { retainTowerMeters } from './ui/arena/TowerHealth.js';
import { shuffled } from '../shared/cards.js';
import {coreDescriptor} from '../shared/nexus-core.js';
import {mountNexusCore,showBattleCores,clearNexusCore} from './ui/nexus-core/NexusCore.js';
import './ui/nexus-core/nexus-core.css';
import './styles.css';
import './ui/arena/tower-crystal.css';
import './combat-v5.css';
import './ui/arena/arena.css';
import './ui/arena/nexus-crystal.css';
import './ui/card-panel/card-panel.css';
import { ensureSession, supabase } from './lib/supabase.js';
import { api } from './lib/api.js';
import { watchMatch } from './lib/realtime.js';
import { ARENA_ASSETS } from './ui/arena/arena-assets.js';
import { Lobby, waitingRoom } from './ui/Lobby.js';
import {setRoomConnection} from './ui/waiting-room/WaitingRoom.js';
import { battleHTML as Board, nexusPhaseBar } from './ui/arena/ArenaScene.js';
import { applyArenaLayout } from './ui/arena/ArenaScene.js';
import { initArenaLayoutEditor, isArenaDebugEnabled } from './ui/arena/ArenaLayoutEditor.js';
import { loadLayoutOverrides } from './ui/arena/arenaLayout.js';
import { cardPanelHTML, initCardPanel, PANEL_LANES, renderPanelCards, renderPanelPreview } from './ui/card-panel/CardPanel.js';
import { clearFloats, playRoundAnimation, bindCombatUI, isCombatPlaying } from './ui/animations.js';
import { nextReportRound, hasNewBattle as hasNewBattleReport } from './ui/combat-logic.js';
import { renderStatusBadges } from './ui/arena/StatusBadges.js';
import {bindStructureInspection,closeEffectInspector} from './ui/arena/EffectInspector.js';
import './ui/arena/status-badges.css';import { EndScreen } from './ui/EndScreen.js';

const app = document.getElementById('app');
const byId = (c) => document.getElementById(c);

let view = null;          // персональный PlayerView с сервера
let dealAnimationPending = false;
let myHand = [];          // объекты карт моей руки
let slots = [];           // локальная раскладка: [{atk:[card,card], def:[card,card]}×3]
let selected = [];        // id выбранных карт (0..2)
let submission = null;
let unwatch = null;
let lastReportRound = 0; // номер уже показанного отчёта (для постановки у обоих игроков)
let refreshEpoch = 0;    // защита от «зависшего» get-state при смене экрана/матча
let coreBusy=false;
let roomConnection='online';
const roomIntros=new Set();

const cardById = (id) => myHand.find((c) => c.id === id);
const usedIds = () => new Set([...slots.flatMap((s) => [...s.atk, ...s.def].map((c) => c.id)),...(view?.me?.preparation?.coreCardId?[view.me.preparation.coreCardId]:[])]);
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
  if (saved) {
    try {
      const v = await api.getState(saved);
      if (v && v.seat && v.status !== 'finished'&&(!roomParam||v.roomCode===roomParam.trim().toUpperCase())) { lastReportRound = v.latestRoundReport?.report?.[0]?.round ?? 0; return enterMatch(saved); }
    } catch { localStorage.removeItem('vochko_match'); }
  }
  if (roomParam) return joinRoom(roomParam);
  renderLobby();
}

function renderLobby(joinError) {
  byId('panelEditor')?.remove();
  app.replaceChildren(Lobby({
    onCreate: async () => { try { const r = await api.createRoom(); app.replaceChildren(waitingRoom(r.matchId, r.roomCode, link, { onExit: () => cancelWaitingRoom(r.matchId) })); await enterMatch(r.matchId); } catch (e) { renderLobby(e.message); } },
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
  roomConnection=navigator.onLine===false?'offline':'online';
  submission = null;
  clearFloats();
  if (unwatch) unwatch();
  localStorage.setItem('vochko_match', matchId); // реконнект после F5 (аудит п.4)
  unwatch = watchMatch(matchId, () => refresh(matchId),{onConnectionChange:status=>{
    roomConnection=status;setRoomConnection(app.querySelector('.pvp-room'),status);
  }});
  await refresh(matchId);
  if(view?.matchId===matchId&&new URLSearchParams(location.search).has('room')){
    const params=new URLSearchParams(location.search);params.set('room',view.roomCode);
    history.replaceState(null,'','?'+params);
  }
}

// ── Выход из матча ─────────────────────────────────────────────────────────
// Кнопка в шапке + кнопка на экране ожидания. Чистит localStorage и ?room= —
// иначе F5 (реконнект по п.4) вернул игрока в покинутый матч.
function exitMatch(matchId = view?.matchId, confirmText, {confirmed=false,notify=true}={}) {
  const isBot = view?.opponent?.isBot;
  const text = confirmText ?? (isBot
    ? 'Выйти из матча с ботом? Прогресс раунда будет потерян.'
    : 'Выйти из матча? Соперник увидит «отключился»; у него будет 10 минут на возврат.');
  if (!confirmed&&!window.confirm(text)) return;
  refreshEpoch++;
  localStorage.removeItem('vochko_match');
  const params = new URLSearchParams(location.search);
  params.delete('room');
  history.replaceState(null, '', location.pathname + (params.size ? '?' + params : ''));
  if (unwatch) { unwatch(); unwatch = null; }
  clearNexusCore();
  clearFloats();
  lastReportRound = 0;
  selected = [];
  submission = null;
  slots = resetSlots(); slotsState.round = 0;
  myHand = []; view = null;
  if (matchId&&notify) api.leaveRoom(matchId).catch(() => { /* finished/нет участия — не критично */ });
  renderLobby();
}

async function refresh(matchId) {
  const epoch = refreshEpoch; // сменился pantalla/матч — устаревший get-state игнорируем
  const next = await api.getState(matchId);
  if (epoch !== refreshEpoch || (view?.matchId === matchId && next.version < view.version)) return;
  if(view?.matchId===matchId&&next.version===view.version)return;
  view = next;
  if(view.status==='finished'&&!view.board?.me){
    if(unwatch){unwatch();unwatch=null;}
    localStorage.removeItem('vochko_match');
    renderLobby('Комната закрыта создателем. Создай новую или войди по другому коду.');return;
  }
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
    showWaitingRoom();
    return;
  }
  if(view.status==='planning'&&!view.opponent?.isBot&&view.round===1&&!roomIntros.has(matchId)&&slotsState.matchId!==matchId){
    roomIntros.add(matchId);showWaitingRoom({connected:true,starting:true});
    await new Promise(resolve=>setTimeout(resolve,matchMedia('(prefers-reduced-motion: reduce)').matches?0:500));
    if(epoch!==refreshEpoch||view?.matchId!==matchId)return;
  }
  const newDeal = view.matchId !== slotsState.matchId || view.round !== slotsState.round;
  const previousOrder = new Map(myHand.map((card,i) => [card.id,i]));
  myHand = newDeal ? shuffled(view.me.hand) : [...view.me.hand].sort((a,b) =>
    (previousOrder.get(a.id) ?? 99) - (previousOrder.get(b.id) ?? 99));
  if (newDeal) dealAnimationPending = true;
  if (view.matchId !== slotsState.matchId || view.round !== slotsState.round) {
    slots = resetSlots(); selected = [];
    slotsState.matchId = view.matchId; slotsState.round = view.round;
  } else {
    const handIds = new Set(myHand.map((card) => card.id));
    keepDraftCards((id) => handIds.has(id));
  }
  if(view.me.preparation?.round===view.round){
    slots=view.me.preparation.placements.map(p=>({atk:p.attack.map(cardById),def:p.defense.map(cardById)}));
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
  if (hasNewBattle) {
    // Финальный бой тоже играется полностью ДО экрана победы (v19 §6).
    lastReportRound = repRound;
    showBattleCores(view);
    playRoundAnimation(view);
    return;
  }
  render();
  // Флажок «только что положено» гаснет — повторные перерисовки не переигрывают прилёт.
  setTimeout(() => { for (const s of slots) for (const c of [...s.atk, ...s.def]) c.justPlaced = false; }, 500);
}

const slotsState = { matchId: null, round: 0 };
function showWaitingRoom(extra={}){
  const matchId=view.matchId;
  // Перерисовка только при смене комнаты/состояния: каждое get-state иначе
  // перезапускало бы зацикленные webp-анимации аватаров и спиннер.
  const state=extra.starting?'starting':extra.connected?'connected':'waiting';
  const shown=app.querySelector('.pvp-room');
  if(roomConnection==='online'&&Object.keys(extra).length===0&&shown?.dataset.matchId===matchId&&shown?.dataset.state===state) return;
  app.replaceChildren(waitingRoom(matchId,view.roomCode,link,{
    rules:view.rules,seat:view.seat,connection:roomConnection,...extra,
    onExit:()=>extra.starting?exitMatch(matchId):cancelWaitingRoom(matchId),
    onRetry:async()=>{
      roomConnection='reconnecting';setRoomConnection(app.querySelector('.pvp-room'),roomConnection);
      try{await refresh(matchId);roomConnection='online';}catch{roomConnection='error';}
      setRoomConnection(app.querySelector('.pvp-room'),roomConnection);
    },
  }));
}
async function cancelWaitingRoom(matchId){
  if(!window.confirm('Отменить комнату и вернуться в лобби?'))return;
  const epoch=refreshEpoch;
  const root=app.querySelector('.pvp-room'),button=root?.querySelector('[data-act="exit"]');
  const label=button?.querySelector('span'),originalLabel=label?.textContent;
  if(button){button.disabled=true;button.setAttribute('aria-busy','true');}if(label)label.textContent='Отменяем комнату…';
  try{await api.leaveRoom(matchId);if(epoch!==refreshEpoch)return;exitMatch(matchId,undefined,{confirmed:true,notify:false});}
  catch(error){
    if(epoch!==refreshEpoch)return;
    if(/nothing to leave|match not found/.test(error.message)){exitMatch(matchId,undefined,{confirmed:true,notify:false});return;}
    if(button){button.disabled=false;button.removeAttribute('aria-busy');}if(label)label.textContent=originalLabel;
    const feedback=root?.querySelector('.room-feedback');if(feedback)feedback.textContent='Не удалось отменить комнату. Проверь соединение и попробуй ещё раз.';
  }
}
const resetSlots = () => Array.from({ length: 3 }, () => ({ atk: [], def: [] }));

function doRematch(btn) {
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Ждём соперника…'; }
  api.rematch(view.matchId).then((r) => {
    if (!r.waiting) { lastReportRound = 0; slots = resetSlots(); slotsState.round = 0; enterMatch(r.matchId); }
  }).catch(() => { if (btn) { btn.disabled = false; btn.textContent = '🔁 Реванш'; } });
}

function render(force = false) {
  if (!force && isCombatPlaying()) return; // UI заморожен на время боевой хореографии
  closeEffectInspector();
  const blocked = turnLocked();
  const panelState = { round: view.round, blocked, hint: blocked ? '' : missingPairHint(),
    progress: { attack: slots.filter((s) => s.atk.length === 2).length,
      defense: slots.filter((s) => s.def.length === 2).length, total: slots.length },
    ready: view.status === 'planning' && (view.me.ready || currentSubmission()?.accepted) };
  const root = document.createElement('div');
  root.className = 'match-screen';
  root.dataset.meterContext = `${view.matchId}:${view.round}`;
  // Фон-подложка для боковых полей вокруг сцены (кинематографичные бары).
  root.style.setProperty('--arena-bg', `url('${ARENA_ASSETS.bg}')`);
  root.innerHTML = `
    <header><div><h1>ВОЧКО <span style="color:#e7ecf6">/ ТРИ ЛИНИИ</span></h1>
      <div class="sub">PvP · сид ${view.seat} · комната ${view.roomCode}${view.opponent?.isBot ? ' · против бота' : ''}</div></div>
      <button class="exit-btn" id="exitBtn" title="Выйти в лобби" aria-label="Выйти в лобби">🚪 Выйти</button></header>
    <div class="wrap">
      <div class="score" id="nexusScore">${nexusPhaseBar(view)}</div>
      <div class="arena-and-hand">
        <div class="battle" id="lanes">${Board(view, slots, { showProgress: !blocked })}</div>
        ${cardPanelHTML(panelState)}
      </div>
    </div>`;
  const restoreChargeAnimations = retainAttackCharges(app.firstElementChild, root);
  const restoreMeterAnimations = retainTowerMeters(app.firstElementChild, root);
  app.replaceChildren(root);
  applyArenaLayout();
  renderStatusBadges(root, view.board.me, view.board.opponent);
  restoreMeterAnimations();
  restoreChargeAnimations();
  // Consume placement flags once; another tower placement must not replay them.
  for (const slot of slots) for (const card of [...slot.atk, ...slot.def]) card.justPlaced = false;
  initArenaLayoutEditor();

  const hand = byId('hand');
  initCardPanel(hand);
  renderPanelCards(hand, myHand.filter(card=>card.id!==view.me.preparation?.coreCardId), selected, usedIds(), turnLocked(), dealAnimationPending);
  dealAnimationPending = false;
  updatePreview();

  hand.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-card]');
    if (!btn || btn.disabled || turnLocked() || dragId || usedIds().has(btn.dataset.card)) return;
    const id = btn.dataset.card;
    if (selected.includes(id)) selected = selected.filter((x) => x !== id);
    else if (selected.length === 2) return setStatus('Можно выбрать только две карты.');
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

  byId('fightBtn').onclick = submit;
  bindStructureInspection(root,{selected:()=>selected,boardMe:view.board.me,boardOpp:view.board.opponent});
  if(view.rules?.nexusCoreEnabled)byId('fightBtn').disabled=blocked||coreBusy||!view.me.preparation?.coreCardId;
  byId('exitBtn').onclick = () => exitMatch();
  wireDrag();
}

function missingPairHint() {
  const lane = slots.findIndex((s) => s.atk.length !== 2 || s.def.length !== 2);
  if (lane < 0) return '';
  const { atk, def } = slots[lane];
  const missing = [atk.length !== 2 && 'атака', def.length !== 2 && 'защита'].filter(Boolean);
  return `Линия «${PANEL_LANES[lane]}» — осталось заполнить: ${missing.join(' и ')}.`;
}

function setStatus(text) { const el = byId('status'); if (el) el.textContent = text || ''; }

// Экран финала — вызывается и из refresh, и из хореографии боя.
// Идемпотентный: повторные Realtime-события не наслаивают оверлеи.
function showEndScreen(v) {
  if (document.querySelector('.end-overlay')) return;
  const title = v.winner === 'draw' ? '🤝 Ничья' : v.winner === 'me' ? '🏆 Победа!' : '💀 Поражение';
  const message = v.endReason==='deck_exhaustion' ? 'Колода истощена: осталось меньше 13 несожжённых карт. Итог определён по HP Нексусов.' : v.winner === 'draw'
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
// render(true) пересобирает поле и стирает бейджи Ядра — возвращаем их сразу,
// если отчёт раунда уже есть (иначе они пропадают до конца раунда).
const renderWithBattleCores = (force) => {
  render(force);
  if (view?.latestRoundReport?.cores) showBattleCores(view);
};
bindCombatUI({ render: renderWithBattleCores, showEndScreen, renderFinal: () => renderWithBattleCores(true) });

function updatePreview() {
  const cards = selected.map(cardById);
  renderPanelPreview(byId('hand'), cards);
  byId('lanes').querySelectorAll('.drop-target[data-kind]').forEach((target) => {
    target.classList.toggle('pair-target', !turnLocked() && cards.length === 2);
  });
  syncCoreView();
}

function syncCoreView(){
  if(!view||!app.firstElementChild?.querySelector('#arenaScene'))return;
  const remaining=myHand.filter(c=>!usedIds().has(c.id));
  mountNexusCore(app.firstElementChild,{view,slots,remaining:remaining.length===1?remaining[0]:null,
    selected:selected.length===1?cardById(selected[0]):null,blocked:turnLocked()||coreBusy,onActivate:activateCore,onPrepare:()=>prepareCore()});
  if(view.rules?.nexusCoreEnabled&&!isCombatPlaying())byId('phase').textContent=view.me.ready?'Ждём соперника':view.me.preparation?.coreCardId?'Готов к бою':view.me.preparation?'Ядро Нексуса':'Расстановка карт';
}
window.addEventListener('resize',syncCoreView);
const placementIds=()=>slots.map((s,l)=>({lane:l,attack:s.atk.map(c=>c.id),defense:s.def.map(c=>c.id)}));
async function prepareCore(coreCardId,origin){
  if(coreBusy||turnLocked()||!view.rules?.nexusCoreEnabled)return;
  const {matchId,round}=view;let coreError='';coreBusy=true;syncCoreView();
  try{
    const result=await api.prepareCore({matchId,round,placements:placementIds(),...(coreCardId?{coreCardId}:{})});
    if(view?.matchId!==matchId||view.round!==round)return;
    view.me.preparation=result.preparation;
    view.me.core=coreDescriptor(cardById(result.preparation.coreCardId));
    view.version=Math.max(view.version,result.version);selected=[];
    if(coreCardId&&origin&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
      const card=cardById(coreCardId),target=document.querySelector('#nexusCore').getBoundingClientRect(),ghost=document.createElement('span');
      ghost.className='core-flight-card';ghost.textContent=card.r+card.s;ghost.style.color='♥♦'.includes(card.s)?'#bf243c':'#162e4b';
      ghost.style.left=origin.left+origin.width/2+'px';ghost.style.top=origin.top+origin.height/2+'px';document.body.append(ghost);
      ghost.animate([{transform:'translate(-50%,-50%) scale(1)'},{transform:`translate(calc(-50% + ${target.left+target.width/2-origin.left-origin.width/2}px),calc(-50% + ${target.top+target.height/2-origin.top-origin.height/2}px)) scale(.15)`,opacity:0}],{duration:450,easing:'ease-in',fill:'forwards'}).finished.then(()=>ghost.remove(),()=>ghost.remove());
    }
  }catch(e){coreError=e.message;}
  finally{coreBusy=false;if(view?.matchId===matchId&&view.round===round){render();if(coreError)setStatus(coreError+' Нажми Ядро, чтобы повторить.');}}
}
function activateCore(cardId){
  if(!cardId||usedIds().has(cardId)||!view.me.preparation)return;
  const card=[...document.querySelectorAll('#hand [data-card]')].find(el=>el.dataset.card===cardId);
  prepareCore(cardId,card?.getBoundingClientRect());
}

function placeCards(target, ids) {
  if (turnLocked()) return;
  if(view.rules?.nexusCoreEnabled&&view.me.preparation)return;
  const lane = +target.dataset.lane, kind = target.dataset.kind;
  const cards = ids.map(cardById);
  const used = usedIds();
  if (cards.some((card) => !card || used.has(card.id)))
    return setStatus('Карта уже использована или отсутствует в руке.');
  const pair = slots[lane][kind];
  slots[lane][kind] = !cards.length || pair.length + cards.length > 2 ? cards : [...pair, ...cards];
  cards.forEach((card) => { card.justPlaced = true; });
  selected = [];
  render();
  if(view.rules?.nexusCoreEnabled&&!missingPairHint())prepareCore();
}

async function submit() {
  if (turnLocked()) return;
  const missing = missingPairHint();
  if (missing) return setStatus(missing);
  if(view.rules?.nexusCoreEnabled&&!view.me.preparation?.coreCardId)return setStatus('Перенесите последнюю карту в Ядро Нексуса');
  const placements = slots.map((s, l) => ({
    lane: l,
    attack: s.atk.map((c) => c.id),
    defense: s.def.map((c) => c.id),
  }));
  const { matchId, round, version: expectedVersion } = view;
  const turn = { matchId, round, expectedVersion, placements, fortifyLane: null,...(view.rules?.nexusCoreEnabled?{coreCardId:view.me.preparation.coreCardId}:{}) };
  const pending = submission = { matchId, round, accepted: false };
  render();
  setStatus(view.opponent?.isBot ? '' : 'Отправляем ход…');
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
    setStatus(view.opponent?.isBot ? '' : 'Ход отправлен. Ждём обновления матча.');
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
    if(target?.id==='nexusCore')activateCore(dragId);
    else if (target) placeCards(target, selected.length === 2 && selected.includes(dragId) ? selected : [dragId]);
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
