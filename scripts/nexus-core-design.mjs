import {mkdirSync,writeFileSync} from 'node:fs';
import {CORE_ABILITIES,coreAbilityBonus} from '../shared/nexus-core.js';
import {ABILITIES,RECOMMENDED} from '../shared/abilities.js';
import {ELEMENTS} from '../shared/elements.js';
import {deck} from '../shared/cards.js';
mkdirSync('reports',{recursive:true});
const labels={burn:'горение',damage:'урон',heal:'лечение',armor:'броня',percent:'п.п.',strip:'снятие брони',charge:'заряд',shield:'щит'};
let text=`# Ядро Нексуса — дизайн 20 усилений

Версия механики: 1. Контроль — существующий rules.variants (RECOMMENDED), а не скрытая замена его параметров. Ядро включается только в новых матчах с rules.nexusCoreEnabled=true. Профили B (base) и C (balanced) сравниваются отдельно.

Бонусы ниже **прибавляются к уникальной способности**, не к силе пары, множителям комбинации или обычному стихийному модификатору. Триггер остаётся прежним; контрстихия отменяет и способность, и весь её бонус. Условия не гарантируют активацию.

Тиры: 2–6 → I, 7–10 → II, J/Q/K → III, A → IV. Усиливаются четыре стихии, содержащие масть сожжённой карты; обе роли. Карта определяется сервером по физическому id из руки.

Исходные параметры rules.variants: ${JSON.stringify(RECOMMENDED)}.

| Способность | Исходный эффект / условие | C I | C II | C III | C IV | B I / II / III / IV |
|---|---|---|---|---|---|---|
`;
const bases={fire_burn:'Попадание → горение 2 на следующий раунд',fire_retaliation:'Поглощение щитом → ответка 2 (recommended onHit)',water_strip_armor:'Снять до 2 временной брони',water_cleanse:'Очистить негативы; при их отсутствии лечение 1 HP',earth_pierce_def:'Игнорировать 15% защиты',earth_armor:'Перенести броню 3 на следующий раунд',air_weaken_def:'Попадание → −10% следующей защиты',air_reflect:'Полная блокировка → отражение 2',steam_weaken_def:'Попадание → −15% следующей защиты',steam_dampen:'−15% входящего урона; полная блокировка → лечение 2',lava_pierce_burn:'Пробой 10%; попадание по временной броне → горение 1',lava_counter:'Попадание противника → ответка 3',fire_vortex_spread:'Попадание → по 1 горению на соседние линии',fire_vortex_zaslon:'Горящий сосед → −10% входящей атаки',ice_weaken_def:'Попадание → −10% следующей защиты',ice_weaken_atk:'Ослабить следующую атаку на 15%',thunderstorm_discharge:'Попадание → 2 урона другой случайной башне',thunderstorm_charge:'Успешный удар противника → +2 следующей атаки',sandstorm_weaken_atk:'Попадание → −15% следующей атаки',sandstorm_shield:'+3 щита текущего раунда'};
for(const [id,design]of Object.entries(CORE_ABILITIES)){
  const tiers=['2','7','J','A'].map(rank=>{
    const card=deck().find(c=>c.s===ELEMENTS[design.element].suits[0]&&c.r===rank);
    const values=profile=>Object.keys(design).filter(k=>k!=='element').map(k=>`+${coreAbilityBonus({cores:{a:card},coreProfile:profile},'a',id,k)} ${labels[k]}`).join('; ');
    return {c:values('balanced'),b:values('base')};
  });
  text+=`| ${ELEMENTS[design.element].name} — ${ABILITIES[id].name} (${ABILITIES[id].role}) | ${bases[id]} | ${tiers.map(t=>t.c).join(' | ')} | ${tiers.map(t=>t.b).join(' / ')} |\n`;
}
text+=`
## Лимиты и длительность

- Core-specific горение ограничено 6 (Огонь IV: 2+4), обычный лимит без Ядра остаётся 5. На одной линии источники совмещаются через max, не бесконечную сумму. Обычный поджог длится один следующий раунд.
- Броня ≤9, ослабления ≤30%, заряд атаки ≤6. У профиля B высокие тиры могут упираться в существующий кап — это явно не обещание гарантированного прироста после капа.
- Лечение ограничено HP конкретной живой постройки; руины не воскрешаются. Щит/ответка/разряд не запускают новые цепочки способностей.
- Выбор Ядра очищается сразу после расчёта; статус, созданный усиленной способностью, сохраняет свою обычную отложенную длительность. Например, усиленный поджог срабатывает в следующем раунде, но само Ядро повторно ничего не усиливает.
- Сгоревшая карта исключается только из следующей раздачи своего владельца. Исключения заменяются, не накапливаются. Между игроками одинаковые физические id по-прежнему допустимы — у каждого своя колода.

Профиль C является кандидатом для включения на feature-ветке; обоснование выбора и доверительные интервалы — nexus-core-balance.md. До публикации следует сохранить эту таблицу как версию 1; последующие изменения требуют нового coreVersion и сохранения интерпретации уже созданных матчей.
`;
writeFileSync('reports/nexus-core-ability-design.md',text);
console.log('Wrote 20-ability design table');
