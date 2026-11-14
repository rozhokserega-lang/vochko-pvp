import {RECOMMENDED} from '../../../shared/abilities.js';
export function roomRules(rules){
  if(!rules)return {balance:'Загрузка правил…',deal:'Загрузка раздачи…'};
  const recommended=Object.entries(RECOMMENDED).every(([key,value])=>rules.variants?.[key]===value);
  return {balance:recommended?'Рекомендованный баланс':Object.keys(rules.variants??{}).length?'Особые правила':'Базовый баланс',deal:rules.nexusCoreEnabled?'13 карт + Ядро Нексуса':'14 карт · 12 в игре'};
}
