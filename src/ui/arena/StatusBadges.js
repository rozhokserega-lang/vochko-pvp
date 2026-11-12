// One public-state inspector for allied/enemy towers and Nexus lanes.
import { STATUS_META, statusDetails } from '../../../shared/abilities.js';
import { ELEMENTS } from '../../../shared/elements.js';
const LANES = ['Верх', 'Центр', 'Низ'];
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const active = statuses => Object.entries(statuses ?? {}).filter(([key,value]) => STATUS_META[key] && Number.isFinite(value) && value > 0);
export function statusBadgesHTML(statuses) {
  const chips = active(statuses).map(([key,value]) => `<span class="status-badge status-${key}" data-status="${key}">${STATUS_META[key].icon}${value}${key.startsWith('weaken') ? '%' : ''}</span>`);
  return chips.length ? `<button type="button" class="status-badges" aria-label="Прочитать активные эффекты">${chips.join('')}</button>` : '';
}
export function statusPanelHTML(statuses, { mine = true, structure = null, rules = {} } = {}) {
  const entries = structure?.effects ?? active(statuses).map(([key,value]) => ({key,value}));
  if (!entries.length && !structure) return '';
  const items = entries.map(({key,value,lane}) => {
    const m = statusDetails(key,value,rules);
    return `<section class="status-detail status-detail-${key}">
      <div class="status-detail-title"><span>${m.icon}</span><b>${m.name}</b><span class="st-val">${key === 'burn' ? '−' + value + ' HP' : key.startsWith('weaken') ? '−' + value + '%' : '+' + value}</span></div>
      ${lane != null ? `<div class="status-line-name">Линия: ${LANES[lane]}</div>` : ''}
      <div class="status-detail-row">${escape(m.effect)}</div>
      <div class="status-detail-row status-source">Источник: ${m.sources(value).map(id => ELEMENTS[id]?.name ?? id).join(" или ")}</div>
      <div class="status-detail-row status-timing">Срабатывание: ${escape(m.timing)}. Осталось: ${escape(m.duration)}.</div>
      <div class="status-counterplay">${escape(m.counterplay)}</div>
    </section>`;
  }).join('');
  return `<div class="status-panel" role="tooltip" data-owner="${mine ? 'me' : 'opp'}">
    <button type="button" class="status-close" aria-label="Закрыть сведения">×</button>
    <div class="structure-summary">${structure?.image ? `<img class="structure-portrait" src="${escape(structure.image)}" alt="" draggable="false">` : ''}<div>
      <div class="structure-owner">${mine ? 'Ваша постройка' : 'Постройка соперника'}${structure?.lane != null ? ' · ' + LANES[structure.lane] : ''}</div>
      <div class="status-panel-head">${escape(structure?.name ?? 'Активные эффекты линии')}</div>
      ${structure ? `<div class="structure-hp">♡ <b>${structure.hp} / ${structure.max}</b> HP</div>` : ''}
      ${!entries.length ? `<div class="status-empty">${structure?.hp === 0 ? 'Постройка разрушена.' : 'Активных эффектов нет.'}</div>` : ''}
    </div></div>${items}
    ${structure?.canClear ? '<button type="button" class="status-clear">Убрать мои карты с этой цели</button>' : ''}
  </div>`;
}
let current = null, popup = null, closeTimer, pinned = false, dispose;
export function closeStatusInspector() {
  clearTimeout(closeTimer); current?.target.removeAttribute('aria-describedby'); popup?.remove(); popup=null; current=null; pinned=false;
}
function position() {
  if (!popup || !current?.target.isConnected) return closeStatusInspector();
  const r=current.target.getBoundingClientRect(), p=popup.getBoundingClientRect();
  const left=Math.max(8,Math.min(innerWidth-p.width-8,r.left+r.width/2-p.width/2));
  const top=r.top-p.height-12 >= 8 ? r.top-p.height-12 : Math.min(innerHeight-p.height-8,r.bottom+12);
  popup.style.left=left+'px';popup.style.top=Math.max(8,top)+'px';
}
function openInspector(model, pin=false) {
  if (model.target.closest('.is-resolving')) return;
  clearTimeout(closeTimer);
  if (current?.target===model.target && popup) { pinned ||= pin; return; }
  closeStatusInspector();current=model;pinned=pin;
  const wrap=document.createElement('div');wrap.innerHTML=statusPanelHTML({},model);popup=wrap.firstElementChild;
  popup.id='structure-status-inspector';popup.classList.add('open');document.body.append(popup);
  model.target.setAttribute('aria-describedby',popup.id);
  popup.querySelector('.status-close').onclick=closeStatusInspector;
  popup.querySelector('.status-clear')?.addEventListener('click',()=>{model.onClear?.(model.target);closeStatusInspector();});
  popup.addEventListener('pointerenter',()=>clearTimeout(closeTimer));
  popup.addEventListener('pointerleave',()=>{if(!pinned)closeTimer=setTimeout(closeStatusInspector,180);});
  popup.addEventListener('click',e=>e.stopPropagation());position();
}
function bind(model, options) {
  const target=model.target;
  target.removeAttribute('title');
  if (!target.hasAttribute('tabindex')) target.tabIndex=0;
  target.setAttribute('aria-label',`${model.mine?'Ваша':'Вражеская'} ${model.structure.name}, ${model.structure.hp}/${model.structure.max} HP. ${model.structure.effects.length ? 'Есть активные эффекты.' : 'Без эффектов.'}`);
  target.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch')openInspector(model);});
  target.addEventListener('pointerleave',()=>{if(!pinned)closeTimer=setTimeout(closeStatusInspector,180);});
  target.addEventListener('focus',()=>openInspector(model));
  target.addEventListener('click',e=>{
    const badge=e.target.closest('.status-badges');
    const inspecting=badge || (!options.hasSelection?.() && (matchMedia('(hover: none)').matches || !target.classList.contains('drop-target')));
    if (!inspecting) return;
    e.preventDefault();e.stopImmediatePropagation();
    if(pinned && current?.target===target)closeStatusInspector();else openInspector(model,true);
  },true);
  target.querySelector('.status-badges')?.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();openInspector(model,true);}});
}
// Both teams are traversed by this same renderer. Only public board data is read.
export function renderStatusBadges(root, boardMe, boardOpp, options={}) {
  if (!root) return;
  const reopen=current?.target.dataset.inspectorKey, wasPinned=pinned;
  closeStatusInspector();dispose?.();
  root.querySelectorAll('.status-badges').forEach(el=>el.remove());
  const models=[];
  for (const [mine,board] of [[true,boardMe],[false,boardOpp]]) {
    if(!board)continue;
    const team=mine?'ally':'enemy', statuses=board.statuses??[{},{},{}];
    const add=(target,structure,st={})=>{
      if(!target)return;
      const key=`${team}:${structure.name}:${structure.lane??'all'}`;
      target.dataset.inspectorKey=key;
      target.classList.remove('has-status','status-burning','status-armored','status-weakened','status-boosted');
      if(active(st).length){
        target.insertAdjacentHTML('beforeend',statusBadgesHTML(st));target.classList.add('has-status');
        if(st.burn)target.classList.add('status-burning');if(st.armor)target.classList.add('status-armored');
        if(st.weakenAttack||st.weakenDefense)target.classList.add('status-weakened');if(st.attackBoost)target.classList.add('status-boosted');
      }
      structure.canClear=!!options.onClear && target.classList.contains('drop-target') && !!target.querySelector('.slot-card') && !options.isLocked?.();
      const model={target,structure,mine,rules:options.rules??{},onClear:options.onClear};models.push(model);bind(model,options);
    };
    for(let lane=0;lane<3;lane++){
      const stage=board.outer[lane]>0?'outer':board.inner[lane]>0?'inner':'nexus';
      for(const size of ['outer','inner']){
        const target=root.querySelector(`[data-arena-id="tower-${team}-${mine?'def':'atk'}-${lane}-${size}"]`);
        const st=stage===size?statuses[lane]:{};
        add(target,{name:size==='outer'?'Внешняя башня':'Внутренняя башня',hp:board[size][lane],max:size==='outer'?12:18,lane,image:target?.querySelector('.tower-sprite')?.src,effects:active(st).map(([key,value])=>({key,value}))},st);
      }
      const nexus=root.querySelector(`.nexus-fortress.${team}`), floor=nexus?.querySelector(`.nexus-floor[data-lane="${lane}"]`);
      const st=stage==='nexus'&&board.nexus>0?statuses[lane]:{};
      add(floor,{name:'Нексус',hp:board.nexus,max:80,lane,image:nexus?.querySelector('.nexus-sprite')?.src,effects:active(st).map(([key,value])=>({key,value}))},st);
    }
    const nexus=root.querySelector(`.nexus-fortress.${team}`);
    const effects=statuses.flatMap((st,lane)=>board.outer[lane]<=0&&board.inner[lane]<=0&&board.nexus>0?active(st).map(([key,value])=>({key,value,lane})):[]);
    // Root inspection is only for the sprite/readout; a floor has its own model.
    if(nexus){const model={target:nexus,mine,rules:options.rules??{},structure:{name:'Нексус',hp:board.nexus,max:80,image:nexus.querySelector('.nexus-sprite')?.src,effects}};
      nexus.dataset.inspectorKey=team+':Нексус:all';models.push(model);
      nexus.addEventListener('pointerover',e=>{if(!e.target.closest('.nexus-floor')&&e.pointerType!=='touch')openInspector(model);});
      nexus.addEventListener('pointerleave',()=>{if(!pinned)closeTimer=setTimeout(closeStatusInspector,180);});
      nexus.addEventListener('click',e=>{if(!e.target.closest('.nexus-floor')){e.stopPropagation();openInspector(model,true);}});
      nexus.addEventListener('focus',()=>openInspector(model));
    }
  }
  const outside=e=>{if(!e.target.closest('.status-panel,.tower,.nexus-fortress'))closeStatusInspector();};
  const key=e=>{if(e.key==='Escape')closeStatusInspector();};
  document.addEventListener('click',outside);document.addEventListener('keydown',key);window.addEventListener('resize',position);window.addEventListener('scroll',position,true);
  dispose=()=>{document.removeEventListener('click',outside);document.removeEventListener('keydown',key);window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);};
  if(wasPinned&&reopen){const model=models.find(m=>m.target.dataset.inspectorKey===reopen);if(model)openInspector(model,true);}
}
