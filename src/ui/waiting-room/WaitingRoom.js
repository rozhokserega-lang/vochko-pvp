import {roomRules} from './roomRules.js';
import './waiting-room.css';
const art=Object.fromEntries(['background','logo','panel','player','opponent','vs','button','avatar-blue','avatar-red','avatar-blue-still','avatar-red-still'].map(name=>[name,new URL(`./assets/${name}.webp`,import.meta.url).href]));
const paths={copy:'M9 9h11v12H9zM15 9V3H3v12h6',link:'M10 14l4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',hash:'M9 2 6 22M18 2l-3 20M3 8h19M2 16h19',crown:'m3 7 5 4 4-8 4 8 5-4-3 13H6ZM7 17h10',person:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM3 22v-2a9 9 0 0 1 18 0v2',check:'m5 12 4 4L20 5',users:'M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM1 22v-2a8 8 0 0 1 16 0v2m1-17a4 4 0 0 1 0 8m2 4a6 6 0 0 1 3 5',layers:'m12 2 10 6-10 6L2 8ZM2 12l10 6 10-6M2 16l10 6 10-6',cards:'M5 5h13v17H5ZM9 5l1-4 12 3-3 13M9 11l3-3 3 3-3 4Z',hourglass:'M5 2h14M5 22h14M7 2v4l10 12v4M17 2v4L7 18v4',exit:'M9 3H3v18h6M7 12h15m-5-5 5 5-5 5'};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[name]}"/></svg>`;
const laurel='<svg viewBox="0 0 40 64" aria-hidden="true"><path d="M29 61C6 48 5 21 29 3" fill="none" stroke="currentColor" stroke-width="2"/><path fill="currentColor" d="M26 8q-11 1-12 12 10-1 12-12m-13 9Q3 22 7 33q9-5 6-16M8 31Q0 39 8 47q7-8 0-16m2 15Q5 57 17 61q3-11-7-15m9-26q11-5 12-15-11 2-12 15m-6 14q12-1 16-11-11-2-16 11m1 15q12 3 19-5-10-5-19 5m9 11q10 5 17-1-10-7-17 1"/></svg>';
export function setRoomConnection(root,status='online'){
  if(!root?.matches('.pvp-room'))return;
  root.dataset.connection=status;
  const box=root.querySelector('.room-connection'),message=root.querySelector('[data-connection-message]'),retry=root.querySelector('[data-room-retry]');
  box.hidden=status==='online';retry.disabled=status==='reconnecting';
  message.textContent=status==='offline'?'Нет соединения с интернетом. Комната сохранена.':status==='reconnecting'?'Восстанавливаем соединение…':'Не удалось обновить комнату. Пробуем восстановить соединение.';
}
export function waitingRoom(matchId,roomCode,getLink,{onExit,onRetry,rules,connected=false,starting=false,seat=1,connection='online'}={}){
  const root=document.createElement('main');root.className='pvp-room';root.dataset.state=starting?'starting':connected?'connected':'waiting';root.dataset.matchId=matchId;
  const info=roomRules(rules),link=getLink(roomCode);
  root.innerHTML=`<div class="room-backdrop" aria-hidden="true"></div><div class="room-shell">
    <img class="room-logo" src="${art.logo}" width="1536" height="1024" alt="ВОЧКО МОБА" fetchpriority="high">
    <section class="room-panel" aria-labelledby="roomTitle">
      <header class="room-heading"><span class="room-laurel" aria-hidden="true">${laurel}</span><h1 id="roomTitle">${starting?'Начинаем партию':connected?'Соперник подключился':'Комната готова'}</h1><span class="room-laurel" aria-hidden="true">${laurel}</span></header>
      <p class="room-subtitle">${starting?'Оба игрока на месте. Переносимся на поле боя…':'Отправь ссылку или код сопернику. Как только он войдёт — начнётся партия.'}</p>
      <div class="room-invites">
        <div class="room-invite room-invite-link"><label for="roomInvite">${icon('link')}Ссылка на комнату</label><div class="room-copy-line"><input id="roomInvite" readonly aria-label="Ссылка на комнату"><button class="room-copy" type="button" data-copy="link" aria-label="Скопировать ссылку">${icon('copy')}</button></div></div>
        <div class="room-invite room-invite-code"><span class="room-field-label">${icon('hash')}Код комнаты</span><div class="room-copy-line"><strong class="code room-code"></strong><button class="room-copy" type="button" data-copy="code" aria-label="Скопировать код">${icon('copy')}</button></div></div>
      </div>
      <div class="room-players" aria-label="Участники матча">
        <section class="room-player room-player-own"><img class="room-player-art" src="${art.player}" alt="" width="2094" height="751"><span class="room-avatar room-avatar-own"><picture><source media="(prefers-reduced-motion: reduce)" srcset="${art['avatar-blue-still']}"><img class="room-avatar-image" src="${art['avatar-blue']}" alt="Синий рыцарь" width="256" height="256"></picture></span><div class="room-player-text"><h2>Ты</h2><p>${seat===1?'Создатель комнаты':'Участник комнаты'}</p></div><span class="room-player-ready" aria-label="Подключён">${icon('check')}</span></section>
        <img class="room-vs" src="${art.vs}" width="1312" height="1199" alt="VS">
        <section class="room-player room-player-opponent"><img class="room-player-art" src="${art.opponent}" alt="" width="2172" height="724"><span class="room-avatar room-avatar-opponent"><picture><source media="(prefers-reduced-motion: reduce)" srcset="${art['avatar-red-still']}"><img class="room-avatar-image" src="${art['avatar-red']}" alt="Красный рыцарь" width="256" height="256"></picture></span><div class="room-player-text"><h2>${connected?'Соперник':'Ожидаем соперника…'}</h2><p>${connected?'Подключён и готов к игре':'Место свободно'}</p>${connected?'':'<span class="room-spinner" role="img" aria-label="Ожидание подключения"></span>'}</div></section>
      </div>
      <dl class="room-rules"><div>${icon('users')}<dt>Режим</dt><dd>PvP 1×1 · Три линии</dd></div><div>${icon('layers')}<dt>Правила</dt><dd data-rule="balance"></dd></div><div>${icon('cards')}<dt>Раздача</dt><dd data-rule="deal"></dd></div><div>${icon('hourglass')}<dt>Запуск</dt><dd>Автоматически после входа</dd></div></dl>
      <div class="room-connection" role="status" hidden><span data-connection-message></span><button type="button" data-room-retry>Повторить</button></div>
      <div class="room-feedback" role="status" aria-live="polite"></div>
      ${onExit?`<button class="room-cancel" type="button" data-act="exit">${icon('exit')}<span>${starting?'Вернуться в лобби':'Отменить комнату и вернуться в лобби'}</span></button>`:''}
    </section>
    <div class="room-id"><span>ID комнаты:</span><span data-info="match"></span><button type="button" class="room-copy" data-copy="id" aria-label="Скопировать ID комнаты">${icon('copy')}</button></div>
  </div>`;
  root.querySelector('#roomInvite').value=link;root.querySelector('.room-code').textContent=roomCode;root.querySelector('[data-info="match"]').textContent=matchId;
  for(const key of ['balance','deal'])root.querySelector(`[data-rule="${key}"]`).textContent=info[key];
  root.querySelector('[data-act="exit"]')?.addEventListener('click',()=>onExit());
  root.querySelector('[data-room-retry]').onclick=()=>onRetry?.();
  let copyGeneration=0;
  for(const button of root.querySelectorAll('[data-copy]'))button.onclick=async()=>{
    const generation=++copyGeneration;
    const type=button.dataset.copy,value=type==='link'?link:type==='code'?roomCode:matchId;
    try{
      if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(value);
      else {const field=document.createElement('textarea');field.value=value;field.style.cssText='position:fixed;opacity:0;pointer-events:none';root.append(field);field.select();const copied=document.execCommand('copy');field.remove();button.focus();if(!copied)throw Error('copy');}
      root.querySelector('.room-feedback').textContent=type==='link'?'Ссылка скопирована':type==='code'?'Код скопирован':'ID комнаты скопирован';
      button.dataset.copied='true';setTimeout(()=>delete button.dataset.copied,1600);
      setTimeout(()=>{if(generation===copyGeneration)root.querySelector('.room-feedback').textContent='';},2500);
    }catch{root.querySelector('.room-feedback').textContent='Не удалось скопировать. Выдели значение и скопируй вручную.';}
  };
  setRoomConnection(root,connection);return root;
}
