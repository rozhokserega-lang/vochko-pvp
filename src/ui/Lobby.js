// Экран лобби: создать комнату / войти по коду или ссылке ?room=CODE.
export function Lobby({ onCreate, onJoin, joinError }) {
  const root = document.createElement('div');
  root.className = 'lobby';
  root.innerHTML = `
    <h2>ВОЧКО · Три линии</h2>
    <div class="sub">Онлайн-дуэль 1×1. Создай комнату и отправь ссылку сопернику.</div>
    <div class="row"><button class="btn btn-gold" data-act="create">➕ Создать комнату</button></div>
    <div class="row"><button class="btn" data-act="bot">🤖 Играть с ботом</button></div>
    <div class="sub" style="margin:14px 0 6px">…или войти по коду</div>
    <input id="roomInput" maxlength="6" placeholder="КОД" autocomplete="off" />
    <div class="row"><button class="btn" data-act="join">🔗 Войти по коду</button></div>
    <div class="status" id="lobbyStatus">${joinError ?? ''}</div>`;
  root.querySelector('[data-act="create"]').onclick = () => onCreate();
  root.querySelector('[data-act="bot"]').onclick = () => onBot();
  root.querySelector('[data-act="join"]').onclick = () => {
    const code = root.querySelector('#roomInput').value.trim().toUpperCase();
    if (code.length < 4) return;
    onJoin(code);
  };
  root.querySelector('#roomInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') root.querySelector('[data-act="join"]').click();
  });
  // Ошибку видно сразу и в консоли: молчаливые отбои путают игроков.
  if (joinError) console.error('[lobby]', joinError);
  return root;
}

export function waitingRoom(matchId, roomCode, getLink) {
  const root = document.createElement('div');
  root.className = 'lobby';
  const link = getLink(roomCode);
  root.innerHTML = `
    <h2>Комната готова</h2>
    <div class="sub">Отправь ссылку или код сопернику. Как только он войдёт — начнётся партия.</div>
    <div class="code">${roomCode}</div>
    <div class="sub"><a href="${link}">${link}</a></div>
    <div class="row"><span class="toast">⏳ Ждём второго игрока…</span></div>
    <div class="status" data-info="match">${matchId}</div>`;
  return root;
}
