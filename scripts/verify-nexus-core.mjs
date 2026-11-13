import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const dir='reports/nexus-core-verification',read=name=>readFileSync(`${dir}/${name}`,'utf8');
const unit=read('unit-tests.log'),count=Number(unit.match(/tests (\d+)/)?.[1]);
assert.ok(count>=340);assert.match(unit,/fail 0/);
for(const file of ['core-browser.log','open-nexus-browser.log'])assert.match(read(file),/PASS core PvP/);
assert.match(read('local-browser.log'),/PASS local launcher/);assert.match(read('build.log'),/built in/);
const simulation=JSON.parse(readFileSync('reports/nexus-core-simulations-final/verified.json','utf8'));
assert.equal(simulation.games,5000);assert.equal(simulation.sourceHashMatched,true);assert.equal(simulation.mirrorOutcomesIdentical,true);
const result={verifiedAt:new Date().toISOString(),unitTestsPassed:count,unitTestsFailed:0,productionBuild:'passed',
  browser:['desktop drag-and-drop','mobile tap','reconnect before and after burn','retry after transient failure','private enemy selection','single resolve','new-round reset','tower slots','Nexus-floor slots','PNG sprite adapter','exit cleanup'],
  localHTTP:'legacy 14-card PvE and 13-card core PvP; synchronization/reconnect; no external requests',
  simulations:simulation,productionDeployed:false,mainMerged:false};
writeFileSync(`${dir}/verification.json`,JSON.stringify(result,null,2));
const summary=JSON.parse(readFileSync('reports/nexus-core-simulations-final/summary.json','utf8')),a=summary.summaries.A_14_no_core,c=summary.summaries.C_13_core_balanced;
writeFileSync('reports/nexus-core-result.md',`# Итог внедрения Ядра Нексуса

Реализация подготовлена в feature/nexus-core от feature/random-deal-status-tooltips (28d8a68). На main не переносилась, production не обновлялся.

## Реализовано

- 13 случайных физических карт, шесть пар любых мастей, обязательное сжигание последней карты.
- Четыре тира и индивидуальные прибавки к 20 уникальным способностям, без усиления обычных пар/комбинаций. Направленные контрстихии отменяют также бонус Ядра.
- Серверное сохранение этапов подготовки, повторная валидация и неизменяемость выбранной карты; персональное исключение ровно из следующей раздачи, затем автоматический возврат в доступную колоду.
- Desktop drag-and-drop, мобильные нажатия, открытие/ожидание/поглощение/вспышка, прозрачные ресурсы пользователя, предпросмотр и индикаторы обеих сторон в бою. Сгоревшая карта исчезает из панели, в том числе после F5.
- Стратегический AI с перебором резервируемой карты, общими будущими перетасовками и прогнозом тем же движком, который использует сервер.
- Флаг nexusCoreEnabled, сохранение настроек при join/rematch, совместимость старого формата хода и 14-карточных матчей без флага.

## Найдено и исправлено

1. join-room и rematch теряли rules; create-room использовал неимпортированные helpers. Правила и зависимости сохранены явно.
2. Реванш с ботом ждал невозможного второго подтверждения; бот подтверждает автоматически.
3. Исправления аудита боевой одновременности: цели не перескакивают на следующую башню, разрушенные цели не лечатся, вода/горение не зависят от индекса этажа, отмена очищения не дублируется.
4. Исправлены ключи ролей и знак оценки угроз AI. Новый прогноз Ядра нормализует сторону, отделяет будущую раздачу от текущих спеллов и использует полноценный подбор пар будущего хода.
5. Промежуточный AI проигрывал эвристике младшей карты; его результаты не выданы за финальную проверку. После исправления выполнены новые 5000 игр по зафиксированному хэшу исходников.
6. Исправлены обрезание мобильного предпросмотра, перекрытие HP панелью Ядра, очистка всплывающих элементов при выходе и восстановление после временной ошибки подготовки.

## Проверки

${count}/${count} автоматических тестов прошли; production build прошёл. Проверены два браузера, оба способа размещения, обе стадии переподключения, заполнение башен и этажей Нексуса, приватность выбора, один расчёт и очистка бонуса. Отдельный HTTP-стенд проверил старый PvE и новый PvP без обращений к production.

Завершены 5000 финальных матчей: A/B/C и две политики сжигания по 1000, с полными зеркальными парами и доверительными интервалами.

## Ограничения перед выпуском

- Профиль C — осторожный кандидат, не доказанный глобальный оптимум. Средняя длительность ${a.meanRounds.toFixed(2)} → ${c.meanRounds.toFixed(2)} раунда; ничьи ${(a.drawRate*100).toFixed(1)}% → ${(c.drawRate*100).toFixed(1)}%. Это заметное изменение темпа партии.
- Адаптивный AI существенно лучше эвристики старшей карты, но превосходство над младшей картой не подтверждено 95% ДИ. Вариативность выбора есть; обещания универсально оптимальной стратегии нет.
- Hosted Supabase и нативный Deno не запускались. Серверные тесты используют настоящие обработчики с внедрённым SQL; клиент и сервер требуют согласованного отдельного выпуска.
- Бюджет AI мягкий, глубина прогноза ограничена двумя раундами. Замеры турнира зависят от CPU-нагрузки и кэша.

Документы: nexus-core-ability-design.md, nexus-core-architecture.md, nexus-core-balance.md, nexus-core-readme.md. Скриншоты: nexus-core-screenshots. Полный список изменений: nexus-core-changed-files.txt. Проверки: nexus-core-verification/verification.json. Временная демонстрация: http://127.0.0.1:5190/.
`);
console.log(JSON.stringify(result,null,2));
