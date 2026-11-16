const blue=new URL('../waiting-room/assets/avatar-blue.webp',import.meta.url).href;
const red=new URL('../waiting-room/assets/avatar-red.webp',import.meta.url).href;
export const desktopBackground = `${import.meta.env.BASE_URL}assets/arena/canyon-battlefield-v1.webp`;
export function desktopMatchHeader(view) {
  return `<header class="battle-topbar"><div class="battle-player"><img src="${blue}" alt="Синий рыцарь" draggable="false"><div><strong>Ты</strong><small>Комната ${view.roomCode} · ${view.seat===1?'создатель':'участник'}</small></div></div><div class="battle-brand"><h1>VOCHKO</h1><span>MOBA · ТРИ ЛИНИИ</span><small>Раунд ${view.round}</small></div><div class="battle-topbar-right"><div class="battle-player enemy"><div><strong>${view.opponent?.isBot?'Бот':'Соперник'}</strong><small>${view.opponent?.isBot?'Тренировочная дуэль':'Онлайн-дуэль'}</small></div><img src="${red}" alt="Красный рыцарь" draggable="false"></div><div class="battle-header-actions"><button type="button" id="fullscreenBtn" aria-label="Включить полноэкранный режим" title="На весь экран">⛶ Экран</button><button type="button" id="exitBtn" aria-label="Выйти в лобби">Выйти</button></div></div></header>`;
}
