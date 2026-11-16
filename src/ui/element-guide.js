import {ELEMENTS} from '../../shared/elements.js';
import {ABILITIES,COUNTERS,RECOMMENDED} from '../../shared/abilities.js';
import {abilityDescription} from '../../shared/ability-description.js';

const later=new Set(['fire_burn','earth_armor','air_weaken_def','steam_weaken_def','fire_vortex_spread','ice_weaken_def','ice_weaken_atk','thunderstorm_charge','sandstorm_weaken_atk']);
const chip=id=>`<button type="button" class="counter-chip" data-counter-element="${id}">${ELEMENTS[id].icon} ${ELEMENTS[id].name}</button>`;
export function elementGuide(element){
 const roles=['attack','defense'].map(role=>{
  const a=Object.values(ABILITIES).find(a=>a.element===element&&a.role===role);
  const timing=later.has(a.id)?'Эффект действует в следующем раунде, затем исчезает. ':a.id==='water_cleanse'?'В начале расчёта раунда, до тика горения.':'Во время расчёта текущего раунда.';
  return `<article class="effect-card"><h4>${role==='attack'?'⚔ В атаке':'🛡 В защите'} · ${a.name}</h4><p>${abilityDescription(a,RECOMMENDED)}.</p><small>⏳ ${timing}</small></article>`;
 }).join('');
 const counters=COUNTERS[element]??[],beats=Object.keys(COUNTERS).filter(id=>COUNTERS[id].includes(element));
 const cleanse=['fire','water','lava','fire_vortex','air','steam','ice','sandstorm'].includes(element)?'<p class="guide-cleansing">💧 Уже наложенное горение или ослабление снимает защитная Вода на той же линии до тика горения. Очищение отменяется, если противник атакует эту же линию Грозой.</p>':'';
 return `<div class="guide-label">Способности · рекомендованный баланс, без бонуса атаки Ядра</div><div class="effect-grid">${roles}</div>${element==='earth'?'<p class="guide-cleansing">Временная броня расходуется в следующем раунде. Атакующая Вода может смыть до 2 единиц брони до расчёта урона.</p>':''}<div class="counter-grid"><div><h4>Чем контрить эту стихию</h4>${counters.map(chip).join('')}<p>Защита этой стихией отменяет атакующую способность; атака — защитную. Только при столкновении на одной линии.</p></div><div><h4>Какие стихии она контрит</h4>${beats.length?beats.map(chip).join(''):'<span>Нет прямой контрстихии</span>'}</div></div>${cleanse}<p class="guide-note">Контрстихия отменяет уникальную способность. Базовый урон пары, множитель комбинации и обычные бонусы атаки и защиты сохраняются. Уже наложенные статусы автоматически не снимаются.</p>`;
}

export function coreRules(){
 return `<div class="section-head"><div><div class="kicker">ТРИНАДЦАТАЯ КАРТА</div><h2>Ядро Нексуса</h2></div><p>Постоянная прокачка до конца матча</p></div><div class="glass core-rule-body"><ol><li>Каждый раунд — 13 карт. Размести 12 карт: по атакующей и защитной паре на каждой из трёх линий.</li><li>Оставшуюся карту отправь в Ядро: 2–10 дают свой номинал XP, J — 11, Q — 12, K — 13, A — 14. Масть не влияет.</li><li>XP накапливается до 100. Открытые бонусы сохраняются до конца матча и складываются.</li><li>На 20 XP: +5 текущего и максимального HP Нексуса; на 40 XP: +1 к силе атакующих пар; на 60 XP: +3 постоянного щита Нексуса; на 80 XP: ещё +1 атаки; на 100 XP: ещё +10 HP.</li><li>HP не воскрешает уничтоженный Нексус. Бонус атаки применяется один раз к паре. Постоянный щит поглощает до 3 единиц каждого попадания в Нексус до процентной защиты за прорывы.</li><li>Карта Ядра навсегда сгорает, остальные 12 уходят в сброс и возвращаются после перемешивания. Если на новую руку не хватает 13 карт, победитель определяется по HP Нексусов.</li></ol><p>Прогресс чужого Ядра скрыт. Фактические HP, щиты и результаты атак публичны. Комбинации и стихийные способности на поле сохраняются.</p></div>`;
}
