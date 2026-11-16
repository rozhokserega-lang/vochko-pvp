import {xpRingSegments} from './xp-ring.js';
import { CORE_UPGRADES, cardXp } from '../../../shared/core-progression.js';
const dockAssets={closed:new URL('./assets/closed.png',import.meta.url).href,waiting:new URL('./assets/waiting.webp',import.meta.url).href,open:new URL('./assets/open.png',import.meta.url).href};
const base = `${import.meta.env.BASE_URL}assets/nexus-core/`;
let panel, compact, key='', lastXp=0, flashTimer;
const image = (name, cls) => `<img class="${cls}" src="${base}${name}.png" alt="" draggable="false">`;
export function mountNexusCorePanel(root, {view, slots, remaining, selected, blocked, onActivate, onPrepare}) {
  const progress=view.me.coreProgress??{xp:0,level:0};
  if(!panel || key!==view.matchId) {
    clearNexusCorePanel();key=view.matchId;lastXp=progress.xp;
    panel=document.createElement('section');panel.className='nexus-core-panel';panel.setAttribute('aria-label','Ядро Нексуса');
    panel.innerHTML=`${image('panel-bg','core-panel-background')}<button type="button" class="core-panel-close" aria-label="Закрыть панель Ядра">×</button><div class="core-panel-heading">${image('header-plate','core-header-art')}<h2>ЯДРО НЕКСУСА</h2></div><button type="button" id="corePanelDrop" data-core-target class="core-xp-drop" aria-label="Отправить последнюю карту в Ядро">${image('ring-base','core-ring-art')}<svg class="core-xp-ring" style="mask-image:url('${base}ring-track-mask.png')" viewBox="0 0 200 200" aria-hidden="true"><defs><linearGradient id="core-xp-fill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#138de6" stop-opacity=".65"/><stop offset=".5" stop-color="#55ecff" stop-opacity=".8"/><stop offset="1" stop-color="#1477d2" stop-opacity=".7"/></linearGradient></defs>${xpRingSegments(0).map((segment,i)=>`<path d="${segment.path}" pathLength="1" data-segment="${i}" style="stroke-dashoffset:1;opacity:0"/>`).join('')}</svg>${image('crystal-blue','core-crystal-art')}<span class="core-gain"></span><span class="core-xp-value"></span></button><div class="core-level-plate">${image('level-plate','core-level-art')}<strong class="core-level-text"></strong></div><p class="core-xp-state" role="status" aria-live="polite"></p><h3>УСИЛЕНИЯ ЯДРА</h3><ol class="core-upgrades">${CORE_UPGRADES.map(u=>`<li data-level="${u.level}">${image('row-locked','core-row-art')}${image('icon-'+u.icon,'core-upgrade-icon')}<span class="core-upgrade-copy"><b>Уровень ${u.level} · ${u.xp} XP</b><span>${u.text}</span></span>${image('icon-lock','core-unlock-icon')}</li>`).join('')}</ol>${image('bottom-deco','core-bottom-art')}`;
    compact=document.createElement('button');compact.type='button';compact.className='core-xp-dock';compact.id='nexusCore';compact.dataset.coreTarget='';compact.setAttribute('aria-label','Ядро Нексуса — открыть прокачку');compact.innerHTML='<img class="core-dock-art" alt="" draggable="false"><span class="core-dock-gain"></span><span class="core-dock-xp"></span>';compact.setAttribute('aria-expanded','false');
    compact.onclick=e=>{e.stopPropagation();panel.classList.toggle('is-open');compact.setAttribute('aria-expanded',String(panel.classList.contains('is-open')));};
    panel.querySelector('.core-panel-close').onclick=()=>{panel.classList.remove('is-open');compact.setAttribute('aria-expanded','false');compact.focus();};
    panel.onkeydown=e=>{if(e.key==='Escape')panel.querySelector('.core-panel-close').click();};
  }
  root.append(panel);
  root.querySelector('.nexus-fortress.ally .nexus-fortress-stats').append(compact);
  const prep=view.me.preparation, chosen=!!prep?.coreCardId, complete=slots.every(s=>s.atk.length===2&&s.def.length===2), card=selected??remaining;
  const drop=panel.querySelector('#corePanelDrop');drop.disabled=blocked||chosen||(!prep&&!complete);drop.classList.toggle('drop-target',!!prep&&!chosen&&!blocked);
  compact.classList.toggle('drop-target',!!prep&&!chosen&&!blocked);
  drop.onclick=()=>prep?onActivate(card?.id):onPrepare();
  panel.querySelector('.core-gain').textContent=prep&&!chosen&&card?`+${cardXp(card)} XP`:'';
  panel.querySelector('.core-xp-value').textContent=`${progress.xp} / 100 XP`;
  panel.querySelector('.core-level-text').textContent=`УРОВЕНЬ ${progress.level} / 5`;
  panel.querySelector('.core-xp-state').textContent=chosen?'Карта поглощена. Усиления сохраняются до конца матча.':prep?'Перенеси оставшуюся карту в Ядро':complete?'Подтверди расстановку — затем отправь карту в Ядро':'Сначала размести 12 карт';
  compact.dataset.gain=prep&&!chosen&&card?`+${cardXp(card)} XP`:'';
  compact.querySelector('.core-dock-xp').textContent=`${progress.xp}/100 XP`;
  compact.querySelector('.core-dock-gain').textContent=compact.dataset.gain;
  const phase=chosen?'open':prep?'waiting':'closed',art=compact.querySelector('.core-dock-art');
  const source=dockAssets[phase==='waiting'&&matchMedia('(prefers-reduced-motion: reduce)').matches?'open':phase];
  if(art.getAttribute('src')!==source)art.src=source;
  compact.dataset.phase=phase;compact.title=prep&&!chosen?'Перенеси последнюю карту сюда. Нажми, чтобы открыть прокачку.':'Ядро Нексуса — показать XP и усиления';
  const segments=xpRingSegments(progress.xp);
  for(const path of panel.querySelectorAll('[data-segment]')){const {fraction}=segments[Number(path.dataset.segment)];path.style.strokeDashoffset=String(1-fraction);path.style.opacity=fraction>0?'1':'0';}
  for(const row of panel.querySelectorAll('[data-level]')){
    const active=progress.level>=Number(row.dataset.level),was=row.classList.contains('is-unlocked');row.classList.toggle('is-unlocked',active);
    row.querySelector('.core-row-art').src=base+(active?'row-active':'row-locked')+'.png';row.querySelector('.core-unlock-icon').src=base+(active?'icon-check':'icon-lock')+'.png';
    if(active&&!was&&progress.xp>lastXp){row.classList.remove('just-unlocked');void row.offsetWidth;row.classList.add('just-unlocked');}
  }
  if(progress.xp>lastXp){panel.classList.remove('core-xp-flash');void panel.offsetWidth;panel.classList.add('core-xp-flash');compact.classList.add('core-dock-flash');clearTimeout(flashTimer);flashTimer=setTimeout(()=>{panel?.classList.remove('core-xp-flash');compact?.classList.remove('core-dock-flash');},850);}
  lastXp=progress.xp;
}
export function clearNexusCorePanel(){clearTimeout(flashTimer);panel?.remove();compact?.remove();panel=null;compact=null;key='';lastXp=0;}
