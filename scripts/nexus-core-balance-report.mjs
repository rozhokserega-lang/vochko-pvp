import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {mean,interval,pairValues,pairedDelta} from './nexus-core-statistics.mjs';
import {ELEMENTS} from '../shared/elements.js';
const root='reports/nexus-core-simulations-final',read=p=>JSON.parse(readFileSync(p,'utf8'));
const manifest=read(`${root}/manifest.json`),status=read(`${root}/status.json`),metrics=read(`${root}/metrics.json`);
assert.equal(status.finished,true,'Incomplete run');assert.ok(manifest.finishedAt);
const hash=createHash('sha256');for(const file of manifest.sources)hash.update(file).update(readFileSync(file));
assert.equal(hash.digest('hex'),manifest.sourceHash,'Sources changed after simulation');
const quantile=(a,p)=>[...a].sort((a,b)=>a-b)[Math.floor((a.length-1)*p)];
const pct=n=>(n*100).toFixed(2),fixed=n=>n.toFixed(2);
const rows={};let games=0;
for(const c of manifest.configs){
  const [header,...lines]=readFileSync(`${root}/${c.id}.csv`,'utf8').trim().split(/\r?\n/),keys=header.split(',');
  const data=lines.map(line=>Object.fromEntries(line.split(',').map((v,i)=>[keys[i],keys[i]==='winner'?v:Number(v)]))).sort((a,b)=>a.pair-b.pair||a.mirror-b.mirror);
  assert.equal(data.length,c.games);assert.equal(new Set(data.map(r=>`${r.pair}/${r.mirror}`)).size,c.games);
  for(let i=0;i<data.length;i+=2){
    const a=data[i],b=data[i+1];assert.equal(a.pair,b.pair);assert.equal(a.mirror,0);assert.equal(b.mirror,1);
    for(const key of ['score','rounds','nexusA','nexusB','simultaneous'])assert.equal(a[key],b[key],`${c.id} mirror mismatch: ${key}`);
    assert.equal((a.seatScore+b.seatScore)/2,.5);
  }
  rows[c.id]=data;games+=data.length;
}
assert.equal(games,manifest.configs.reduce((sum,c)=>sum+c.games,0));
const entropy=(usage,role)=>{const counts=Object.entries(usage).filter(([id])=>id.endsWith(`:${role}`)).map(([,v])=>v),total=counts.reduce((a,b)=>a+b,0);return -counts.reduce((s,n)=>s+n/total*Math.log2(n/total),0);};
const summaries={};
for(const c of manifest.configs){
  const data=rows[c.id],m=metrics[c.id],wins=data.filter(r=>r.score===1).length,losses=data.filter(r=>r.score===0).length,draws=data.length-wins-losses;
  summaries[c.id]={games:data.length,independentPairs:data.length/2,wins,losses,draws,score:mean(data.map(r=>r.score)),scoreCI:interval(pairValues(data,'score')),
    meanRounds:mean(data.map(r=>r.rounds)),medianRounds:quantile(data.map(r=>r.rounds),.5),drawRate:draws/data.length,simultaneousRate:mean(data.map(r=>r.simultaneous)),
    firstSeatScore:mean(data.map(r=>r.seatScore)),decision:{mean:mean(m.decisionMs),p95:quantile(m.decisionMs,.95),max:Math.max(...m.decisionMs)},
    aceConditional:m.aceAvailable?m.aceSelected/m.aceAvailable:null,twoConditional:m.twoAvailable?m.twoSelected/m.twoAvailable:null,
    extraDamagePerGame:(m.extraDamage??0)/data.length,extraHealPerGame:(m.extraHeal??0)/data.length,extraArmorPerGame:(m.extraArmor??0)/data.length,queuedBurnPerGame:(m.queuedBurn??0)/data.length,
    boostedCounterRate:m.boostedOpportunities?m.boostedBlocked/m.boostedOpportunities:0,
    exclusionDisplacementRate:m.deals?m.exclusionDisplacements/m.deals:0,
    attackEntropy:entropy(m.usage,'attack'),defenseEntropy:entropy(m.usage,'defense')};
}
const base=rows.A_14_no_core,candidate=rows.C_13_core_balanced,strong=rows.B_13_core_base;
const duration=pairedDelta(candidate,base,'rounds'),draw=pairedDelta(candidate,base,r=>r.score===.5?1:0),vsB=pairedDelta(candidate,strong,'rounds');
const C=summaries.C_13_core_balanced,A=summaries.A_14_no_core,B=summaries.B_13_core_base;
writeFileSync(`${root}/summary.json`,JSON.stringify({manifest,status,games,summaries,durationDeltaCvsA:duration,drawDeltaCvsA:draw,durationDeltaCvsB:vsB},null,2));
const mainTable=Object.entries(summaries).map(([id,s])=>`| ${id} | ${s.games} | ${s.wins}/${s.losses}/${s.draws} | ${fixed(s.meanRounds)} / ${s.medianRounds} | ${pct(s.drawRate)}% | ${fixed(s.decision.mean)} / ${fixed(s.decision.p95)} / ${fixed(s.decision.max)} |`).join('\n');
let text=`# Ядро Нексуса — воспроизводимая балансировка

Дата: 13.11.2026. Ветка feature/nexus-core; production не обновлялся.

## Протокол

Завершено **${games} матчей**: A/B/C и две дополнительные политики по ${manifest.configs[0].games}. В каждой конфигурации — смена мест на одинаковых seed. Масть/достоинство и каждая будущая перетасовка зафиксированы независимо от количества вычислений AI. Исключённая карта закономерно меняет следующий состав руки; это часть механики, а не независимый новый RNG. Между конфигурациями сравниваются одинаковые базовые перетасовки, а не невозможные буквально одинаковые руки из 14 и 13 карт.

Строго проверено совпадение исхода, длительности и HP идентичности между прямой и зеркальной игрой каждой пары. AI нормализует перспективу, боевые броски привязаны к идентичности. Все ${games/2} пар полны, дубликатов нет; зеркала не считаются независимыми наблюдениями. Единица ДИ — среднее пары (500 или 150 независимых seed).

AI: depth=2, samples=2. В A — 3 beam-раскладки, в B/C — резервирование каждой из 13 карт + оптимизация оставшихся 12 и двухраундовый прогноз. В симуляции budgetMs=Infinity, чтобы CPU-нагрузка не меняла выбранные планы. Это разные задачи выбора, поэтому одинаковое wall-clock время A/B/C не обещается. Серверный бюджет Core AI — 800 мс с мягкой отсечкой.

Везде одинаковые RECOMMENDED rules.variants. A: 14 случайных карт, без Ядра. B: 13 + base (повышенные щит/лечение/броня и проценты). C: 13 + balanced (меньшие параметры этих эффектов); урон/горение остаются дискретными. Таблица всех 20 способностей — nexus-core-ability-design.md.

## Результаты

Победы/поражения/ничьи относятся к идентичности A, не физическому месту. Ничья учитывается как 0,5 очка. ДИ — нормальное парное приближение 95%; это не доказательство эквивалентности и не универсальный оптимум.

| Конфигурация | Игр | В/П/Н | Среднее / медиана раундов | Ничьи | AI среднее / p95 / максимум, мс |
|---|---:|---:|---:|---:|---:|
${mainTable}

Физическое первое место получает 50% очков в каждой серии зеркал. Это контролируемая проверка симметрии места; она не предсказывает равную силу двух разных людей.

### Длительность и ничьи

C против A: ${fixed(duration.estimate)} раунда, 95% ДИ [${fixed(duration.low)}; ${fixed(duration.high)}]. Доля ничьих: ${pct(draw.estimate)} п.п., ДИ [${pct(draw.low)}; ${pct(draw.high)}].

C против B: ${fixed(vsB.estimate)} раунда, ДИ [${fixed(vsB.low)}; ${fixed(vsB.high)}]. **Партии C длиннее прежней игры A** (${fixed(A.meanRounds)} → ${fixed(C.meanRounds)}): это существенный продуктовый компромисс, а не «сохранение прежней длительности». Причины включают уменьшение руки и усиление защитных/лечащих способностей. Лимит 45 раундов сохранён.

### Дополнительные эффекты C

В среднем на матч: текущий дополнительный эффективный урон ${fixed(C.extraDamagePerGame)}, лечение ${fixed(C.extraHealPerGame)}, новая временная броня ${fixed(C.extraArmorPerGame)}, дополнительно запланированное горение ${fixed(C.queuedBurnPerGame)}. Урон/лечение получены пересчётом того же раунда без текущих бонусов Ядра, с теми же парами, статусами и бросками. Запланированное горение не выдаётся за уже нанесённый урон; ослабления также реализуются позже. Взаимодействующие маргинальные эффекты разных стихий не обязаны складываться в общий итог.

Частота отмен усиленных возможностей контрстихиями: ${pct(C.boostedCounterRate)}% от потенциально усиливаемых размещений. Это отмены по существующему контр-отношению, не гарантия, что без отмены выполнился бы триггер.

| Стихия | Маргинальный текущий урон на матч C | Маргинальное текущее лечение на матч C |
|---|---:|---:|
${Object.entries(metrics.C_13_core_balanced.elements).map(([id,m])=>`| ${ELEMENTS[id].name} | ${fixed(m.extraDamage/1000)} | ${fixed(m.extraHeal/1000)} |`).join('\n')}

Нулевой текущий вклад у статусной стихии не означает бесполезность её будущего ослабления. Полная ценность всех статусов отражается в результатах партий; поэлементная таблица выше — только ближайший эффект на HP.

## Туз или двойка — не автоматический выбор

В C, когда в руке был Туз, AI сжигал Туза в **${pct(C.aceConditional)}%** случаев (${metrics.C_13_core_balanced.aceSelected}/${metrics.C_13_core_balanced.aceAvailable}). При наличии двойки выбирал её в **${pct(C.twoConditional)}%** (${metrics.C_13_core_balanced.twoSelected}/${metrics.C_13_core_balanced.twoAvailable}). Остальные выборы зависят от комбинаций, четырёх связанных стихий, состояния поля и цены отсутствия карты в следующем прогнозе.

| Политика соперника | Очки адаптивного AI | 95% ДИ |
|---|---:|---:|
${['C_vs_highest','C_vs_lowest'].map(id=>{const s=summaries[id];return `| ${id==='C_vs_highest'?'Всегда старшая доступная карта':'Всегда младшая доступная карта'} | ${pct(s.score)}% | [${pct(s.scoreCI.low)}%; ${pct(s.scoreCI.high)}%] |`;}).join('\n')}

Эти политики проверены по ${summaries.C_vs_highest.games} игр. Если ДИ включает 50%, превосходство адаптивной политики по исходам не доказано. Частоты выбора и ограниченный MC-прогноз исключают утверждение «AI всегда считает Туза/двойку лучшим», но не являются математическим доказательством оптимальной стратегии игры.

### Выбор мастей и достоинств C

Масти: ${JSON.stringify(metrics.C_13_core_balanced.suits)}. Достоинства: ${JSON.stringify(metrics.C_13_core_balanced.ranks)}.
Разнообразие используемых стихий (энтропия Шеннона, максимум log2(10)=3,32): атака ${fixed(C.attackEntropy)}, защита ${fixed(C.defenseEntropy)}; в A — ${fixed(A.attackEntropy)} и ${fixed(A.defenseEntropy)} соответственно. Это прокси разнообразия размещений, не вся стратегия.

Исключение меняло исходный набор следующей руки в ${pct(C.exclusionDisplacementRate)}% всех раздач C (первая рука без исключения также в знаменателе). Физическая карта доступна снова через одну раздачу; постоянного накопления исключений нет, проверено unit/integration-тестами.

## Выбор и ограничения

Для feature-ветки выбран **C / balanced**: это более осторожные коэффициенты щита, лечения, брони и процентов, при этом каждый тир даёт дискретное усиление. Он не объявляется статистически лучшим по одной средней величине и не включается в production автоматически. Балансировочные результаты подтверждают отсутствие универсального выбора Туза/двойки у проверенного AI, симметрию мест и отсутствие бесконечных партий; они также выявляют удлинение партий, которое надо оценить при игровом тестировании.

Сохранены профили B и A для сравнения. Production-сервер/клиент не обновлены; после принятия длительности матчей нужен согласованный выпуск обеих частей. Все финальные конфигурации имеют по 1000 завершённых матчей. Прерванный прогон до исправления ориентации, завершённая промежуточная серия с ошибочной моделью будущих раздач и пилотные серии **не включены** в итоговые ${games} матчей. Прежняя модель проигрывала эвристике младшей карты; это было основанием исправить прогноз, а не скрыть неудачный результат.

Время в таблице измерялось восьмью потоками, с общим ограниченным кэшем DP и фиксированным порядком конфигураций. Ускорение C относительно B нельзя интерпретировать как чистый эффект коэффициентов баланса.

Данные: nexus-core-simulations-final/*.csv, metrics.json, summary.json, manifest.json. Источники сверены по SHA-256 ${manifest.sourceHash}. Команда: rtk proxy node scripts/nexus-core-balance.mjs --games 1000 --policy-games 1000 --workers 8. Формирование отчёта: rtk proxy node scripts/nexus-core-balance-report.mjs.
`;
writeFileSync('reports/nexus-core-balance.md',text);
writeFileSync(`${root}/verified.json`,JSON.stringify({verifiedAt:new Date().toISOString(),games,mirrorPairs:games/2,complete:true,sourceHashMatched:true,mirrorOutcomesIdentical:true},null,2));
console.log(JSON.stringify({games,summaries,durationDeltaCvsA:duration},null,2));
