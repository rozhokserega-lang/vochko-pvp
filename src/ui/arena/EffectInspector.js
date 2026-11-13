import {statusPanelHTML} from './StatusBadges.js';
let panel=null,anchor=null;
export function closeEffectInspector(){panel?.remove();panel=null;anchor=null;}
export function showEffectInspector(target,title,html){
  if(anchor===target){closeEffectInspector();return;}
  closeEffectInspector();anchor=target;
  panel=document.createElement('section');panel.className='effects-inspector';
  panel.setAttribute('role','dialog');panel.setAttribute('aria-label',title);
  const heading=document.createElement('strong');heading.textContent=title;
  const close=document.createElement('button');close.type='button';close.textContent='×';close.className='effects-close';close.setAttribute('aria-label','Закрыть эффекты');close.onclick=closeEffectInspector;
  const content=document.createElement('div');content.innerHTML=html||'<p class="effects-empty">Активных эффектов нет</p>';
  panel.append(heading,close,content);document.body.append(panel);
  const rect=target.getBoundingClientRect(),width=Math.min(360,innerWidth-24);
  panel.style.width=width+'px';panel.style.left=Math.max(12,Math.min(innerWidth-width-12,rect.left+rect.width/2-width/2))+'px';
  panel.style.top=Math.max(12,Math.min(innerHeight-panel.offsetHeight-12,rect.bottom+8))+'px';
  close.focus({preventScroll:true});
}
export function bindStructureInspection(root,{selected,boardMe,boardOpp}){
  const inspect=e=>{
    if(selected().length||e.target.closest('.core-console,.core-own-badge,.core-battle-badge'))return;
    const target=e.target.closest('.tower,.nexus-floor,.nexus-fortress');if(!target)return;
    e.preventDefault();e.stopImmediatePropagation();
    const mine=target.classList.contains('ally')||!!target.closest('.nexus-fortress.ally'),board=mine?boardMe:boardOpp;
    const id=target.dataset.arenaId??'',lane=target.dataset.lane!=null?Number(target.dataset.lane):Number(id.match(/-(\d)-/)?.[1]);
    const current=l=>board?.outer?.[l]>0?'outer':board?.inner?.[l]>0?'inner':'nexus';
    const lanes=target.matches('.nexus-fortress')?[0,1,2].filter(l=>current(l)==='nexus'):[lane];
    const isCurrent=l=>target.matches('.tower')?target.classList.contains(current(l)):current(l)==='nexus';
    const html=lanes.filter(l=>isCurrent(l)&&Object.values(board?.statuses?.[l]??{}).some(Boolean)).map(l=>
      `<h4>${['Верх','Центр','Низ'][l]}</h4>${statusPanelHTML(board.statuses[l],{mine})}`).join('');
    const title=target.matches('.tower')?(mine?'Моя башня':'Вражеская башня'):(mine?'Мой Нексус':'Вражеский Нексус');
    showEffectInspector(target,title,html);
  };
  root.addEventListener('click',inspect,true);
  root.querySelectorAll('.tower,.nexus-floor,.nexus-fortress').forEach(target=>{
    target.tabIndex=0;
    target.setAttribute('role','button');
    if(!target.hasAttribute('aria-label'))target.setAttribute('aria-label',`${target.title||'Строение'} · показать эффекты`);
    target.onkeydown=e=>{if(e.target===target&&(e.key==='Enter'||e.key===' ')){e.preventDefault();target.click();}};
  });
}
document.addEventListener('pointerdown',e=>{if(panel&&!panel.contains(e.target)&&!anchor?.contains(e.target))closeEffectInspector();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeEffectInspector();});
