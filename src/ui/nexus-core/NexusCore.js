import {abilityDescription as description} from '../../../shared/ability-description.js';
import {coreDescriptor,coreAbilityBonus,CORE_TIERS} from '../../../shared/nexus-core.js';
import {ELEMENTS,elementOf} from '../../../shared/elements.js';
import {ABILITIES} from '../../../shared/abilities.js';
import {showEffectInspector,closeEffectInspector} from '../arena/EffectInspector.js';
const assets={closed:new URL('./assets/closed.png',import.meta.url).href,opening:new URL('./assets/opening.webp',import.meta.url).href,
  waiting:new URL('./assets/waiting.webp',import.meta.url).href,open:new URL('./assets/open.png',import.meta.url).href};
let instance=null,instanceKey='',openingTimer=null,absorbTimer=null,phase='',previewNode=null;
const genitive={'♥':'Огня','♦':'Воды','♠':'Земли','♣':'Воздуха'};
let waitingReady;
const preloadWaiting=()=>waitingReady??=(async()=>{const img=new Image();img.src=assets.waiting;await img.decode();})();

export function mountNexusCore(root,{view,slots,remaining,selected,blocked,onActivate,onPrepare}) {
  if(!view.rules?.nexusCoreEnabled){clearNexusCore();return;}
  const key=`${view.matchId}/${view.round}`;
  if(!instance||instanceKey!==key){
    clearTimeout(openingTimer);clearTimeout(absorbTimer);previewNode?.remove();instanceKey=key;phase='';
    instance=document.createElement('section');instance.className='core-console';
    instance.innerHTML=`<button id="nexusCore" type="button" class="core-drop" aria-label="Ядро Нексуса"><img class="core-art" alt="" draggable="false"><span class="core-sacrifice" aria-hidden="true"></span></button><span class="core-state" role="status" aria-live="polite"></span><details class="core-details"><summary>Усиления Ядра</summary><div class="core-preview"></div></details>`;
    previewNode=instance.querySelector('.core-preview');previewNode.id='corePreview';previewNode.setAttribute('role','region');previewNode.setAttribute('aria-label','Предпросмотр усилений Ядра');previewNode.hidden=true;
    const details=instance.querySelector('details');details.querySelector('summary').setAttribute('aria-controls','corePreview');
    details.ontoggle=()=>{
      previewNode.hidden=!details.open;
      if(details.open){
        document.body.append(previewNode);const r=instance.getBoundingClientRect(),width=Math.min(340,innerWidth-20),height=Math.min(440,innerHeight*.6);
        previewNode.style.width=width+'px';previewNode.style.left=Math.max(10,Math.min(innerWidth-width-10,r.left))+'px';previewNode.style.top=Math.max(10,r.top-height-10)+'px';
      }else details.append(previewNode);
    };
  }
  root.querySelector(matchMedia('(max-width:560px)').matches?'.arena-and-hand':'#arenaScene').append(instance);
  const prep=view.me.preparation,ready=!!prep,card=view.me.core?view.me.hand.find(c=>c.id===view.me.core.cardId):selected??remaining;
  const info=coreDescriptor(card),chosen=!!prep?.coreCardId;
  const next=chosen?'absorbed':ready?'waiting':'closed';
  const art=instance.querySelector('.core-art'),drop=instance.querySelector('#nexusCore');
  if(next!==phase){
    const previous=phase;phase=next;instance.dataset.phase=next;
    if(next==='waiting'){
      const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
      art.src=reduced?assets.open:assets.opening;
      clearTimeout(openingTimer);if(!reduced){
        const currentKey=key;preloadWaiting().catch(()=>{});
        art.decode().then(()=>{if(instanceKey!==currentKey||phase!=='waiting')return;
          openingTimer=setTimeout(async()=>{try{await preloadWaiting();}catch{}if(instanceKey===currentKey&&phase==='waiting')art.src=matchMedia('(prefers-reduced-motion: reduce)').matches?assets.open:assets.waiting;},990);
        }).catch(()=>{if(instanceKey===currentKey&&phase==='waiting')art.src=assets.open;});
      }
    }else if(next==='closed')art.src=assets.closed;
    else{
      clearTimeout(openingTimer);art.src=assets.open;
      instance.querySelector('details').open=false;previewNode.hidden=true;
      instance.classList.toggle('core-absorbing',previous==='waiting');
      if(previous==='waiting'){const node=instance;absorbTimer=setTimeout(()=>node.classList.remove('core-absorbing'),800);}
      instance.querySelector('.core-sacrifice').textContent=card?card.r+card.s:'';
    }
  }
  instance.style.setProperty('--core-color',info?.color??'#85dfff');
  const complete=slots.every(s=>s.atk.length===2&&s.def.length===2);
  drop.disabled=!chosen&&(blocked||(!ready&&!complete));
  drop.classList.toggle('drop-target',ready&&!chosen&&!blocked);
  drop.onclick=()=>chosen?showEffectInspector(drop,'Активные усиления Ядра',previewNode.innerHTML):ready?onActivate(card?.id):onPrepare();
  instance.querySelector('.core-state').textContent=chosen?`${info.icon} Ядро ${genitive[info.suit]} ${CORE_TIERS[info.tier-1]}`:ready?'Перенесите карту в Ядро Нексуса':complete?'Открыть Ядро Нексуса':'Ядро · сначала размести 12 карт';
  root.querySelector('.core-own-badge')?.remove();
  if(chosen){const badge=document.createElement('span');badge.className='core-own-badge';badge.textContent=`${info.icon} ${genitive[info.suit]} ${CORE_TIERS[info.tier-1]}`;badge.title=`Усилятся: ${info.elements.map(id=>ELEMENTS[id].name).join(', ')} — при выполнении условий; контрстихии действуют.`;root.querySelector('.nexus-fortress.ally .nexus-fortress-stats').prepend(badge);}
  const preview=previewNode;
  if(info){
    const context={cores:{a:card},coreProfile:view.rules.coreProfile};
    const placed=slots.flatMap(s=>[['attack',s.atk],['defense',s.def]]).filter(([,cards])=>cards.length===2);
    const abilities=chosen?Object.values(ABILITIES).filter(a=>info.elements.includes(a.element)&&placed.some(([role,cards])=>role===a.role&&elementOf(cards)?.id===a.element)):[];
    preview.innerHTML=`<strong>${card.r}${card.s} — Ядро ${genitive[info.suit]}, уровень ${CORE_TIERS[info.tier-1]}</strong><ul>${abilities.map(a=>{
      const present=placed.some(([role,cards])=>role===a.role&&elementOf(cards)?.id===a.element);
      const values=['damage','heal','burn','armor','percent','strip','shield','charge'].map(k=>[k,coreAbilityBonus(context,'a',a.id,k)]).filter(([,v])=>v);
      const labels={damage:'урон',heal:'лечение',burn:'горение',armor:'броня',percent:'п.п.',strip:'снятие брони',shield:'щит',charge:'заряд'};
      return `<li class="${present?'core-present':''}">${present?'✓':'○'} ${ELEMENTS[a.element].name} · ${a.name}: ${values.map(([k,v])=>`+${v} ${labels[k]}`).join(', ')}<small>${description(a,view.rules.variants)}. Контрстихия отменяет усиление.</small></li>`;
    }).join('')}</ul><p>${chosen?(abilities.length?'Усиления действуют на размещённые способности. Срабатывание зависит от условий боя и контрстихий.':'Активных эффектов нет: размещённые стихии не усилены этим Ядром.'):'Активных эффектов нет. Сначала сожгите оставшуюся карту в Ядре.'}</p>`;
  }else preview.textContent='Последняя карта усилит способности четырёх стихий. Масть определяет стихии, достоинство — уровень.';
  for(const target of root.querySelectorAll('.tower.drop-target,.nexus-floor.drop-target')){
    const cards=slots[Number(target.dataset.lane)]?.[target.dataset.kind]??[];
    target.classList.toggle('core-eligible',ready&&cards.length===2&&info?.elements.includes(elementOf(cards)?.id));
    target.style.setProperty('--core-color',info?.color??'#85dfff');
  }
}
export function clearNexusCore(){
  closeEffectInspector();
  clearTimeout(openingTimer);clearTimeout(absorbTimer);instance?.remove();previewNode?.remove();
  document.querySelectorAll('.core-flight-card').forEach(node=>node.remove());instance=null;previewNode=null;instanceKey='';phase='';
}
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&instance)instance.querySelector('details').open=false;});
export function showBattleCores(view){
  if(instance)instance.querySelector('details').open=false;
  if(previewNode)previewNode.hidden=true;
  document.querySelectorAll('.core-own-badge').forEach(el=>el.remove());
  const cores=view.latestRoundReport?.cores;if(!cores)return;
  for(const [side,core]of Object.entries(cores)){
    if(!core)continue;
    const mine=side===(view.seat===1?'a':'b'),nexus=document.querySelector(`.nexus-fortress.${mine?'ally':'enemy'}`);
    if(!nexus)continue;
    nexus.querySelector('.core-battle-badge')?.remove();
    const badge=document.createElement('button');badge.type='button';badge.className='core-battle-badge';
    badge.textContent=`${core.icon} ${core.name} ${CORE_TIERS[core.tier-1]}`;
    badge.title=`Ядро: ${core.elements.map(id=>ELEMENTS[id].name).join(', ')}. Только текущий бой; контрстихии действуют.`;
    const effects=view.latestRoundReport.coreEffects?.filter(e=>e.side===side)??[];
    const labels={damage:'урон',heal:'лечение',burn:'горение',armor:'броня',percent:'п.п.',strip:'снятие брони',shield:'щит',charge:'заряд'};
    const html=effects.map(e=>`<p><b>${['Верх','Центр','Низ'][e.lane]} · ${ABILITIES[e.ability]?.name??e.ability}</b><br>${Object.entries(e.bonuses).map(([key,value])=>`+${value} ${labels[key]??key}`).join(', ')}</p>`).join('');
    badge.onclick=e=>{e.stopPropagation();showEffectInspector(badge,'Сработавшие усиления Ядра',html);};
    if(mine&&instance){
      const drop=instance.querySelector('#nexusCore');drop.disabled=false;drop.onclick=()=>showEffectInspector(drop,'Сработавшие усиления Ядра',html);
      previewNode.innerHTML=html||'<p>Активных эффектов нет</p>';
    }
    (nexus.querySelector('.nexus-fortress-stats')??nexus).prepend(badge);
  }
}
