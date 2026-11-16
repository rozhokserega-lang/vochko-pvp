# Полноэкранное поле для ПК

## Что изменено

- Поле заполняет окно: убран общий расчёт ширины по суммарной высоте поля и большой панели карт. Карты теперь отдельный нижний оверлей; сцена занимает весь viewport.
- Новый фон: каменные линии, зелёные разделители, каньон, руины и водопады. Существующие башни и Нексусы накладываются на него, без генерации новых построек.
- Слоты, подсветка, статусы и боевые события сохранены. Новый визуальный расчёт сохраняет пропорции спрайтов и положение основания при смене целой/повреждённой/разрушенной стадии.
- Положение строений привязано к трём дорожкам. ResizeObserver и обработчик resize пересчитывают геометрию при изменении окна/полноэкранного режима.
- Верхняя панель: существующие аватары, текущий раунд, комната, соперник, выход и кнопка «Экран» с настоящим Fullscreen API.
- Маленькое Ядро остаётся под HP своего Нексуса; полная панель открывается нажатием. Серверная механика не менялась.
- Мобильная адаптация в этой итерации не является целью; минимальная ширина ПК-интерфейса 1000px. На очень широких и высоких мониторах фон расширяется по осям, а пропорции построек сохраняются.

## Файлы

`src/ui/arena/desktop-battlefield.css`, `desktop-layout.js`, `DesktopMatchHeader.js`, изменения `ArenaScene.js` и `src/main.js`; `tests/desktop-layout.test.js`, обновлённый браузерный сценарий `tests/browser-core-xp.mjs`.

Фон сохранён в `public/assets/arena/canyon-battlefield-v1.png`; версия для игры — `canyon-battlefield-v1.webp` (исходник 1672×941). Использована встроенная генерация изображений, затем WebP-конвертация для загрузки в игре.

## Проверки

- 392/392 теста проходят, включая расчёт геометрии для 1366×768, 1920×1080, 2560×1440, 3440×1440 и 1280×1024.
- Проверены сохранение пропорций, положение дорожек, одинаковые якоря основания разных стадий, видимость построек и место для нижней руки/Ядра.
- `npm run build` — успешно; прежнее предупреждение о крупных JS/CSS-чанках сохраняется.
- Локальный сервер отдаёт новый фон и модули (HTTP 200), polling обновляет исходники.
- Браузерная проверка остаётся заблокированной: Chrome и отдельный Chromium Headless Shell не могут запуститься в ограниченной среде. Последняя ошибка: `bootstrap_check_in ... MachPortRendezvousServer: Permission denied (1100)`. Скриншоты настоящего интерфейса не получены; реальные наложения и fullscreen нужно посмотреть в пользовательском браузере. Не приравнивать расчётные тесты к визуальной проверке.

Основная ветка и production не обновлялись; изменения находятся в feature/nexus-core-xp / draft PR #12.

## Промпт фона

Use case: stylized-concept. Asset type: production background texture for an existing desktop fantasy MOBA card game, 16:9 panoramic 1920x1080 composition. Use the SECOND reference image for the environment mood: floating ruined stone arena in a lush canyon, waterfalls, moss, dark blue cliffs, blue side left and red side right. Use the FIRST reference image only to understand the style and camera angle of the existing gold-trimmed blue/red tower sprites that will be composited over this background in code. Create ONLY THE EMPTY ENVIRONMENT, no UI whatsoever and NO buildings/towers/nexuses/characters/cards/text/numbers/logos/health bars/emblems. Wide elevated frontal 3/4 orthographic camera matching the first reference's readable flat arena floor, moderate stylized painted 3D game aesthetic, crisp hand-painted stone textures, soft directional light. Three broad EMPTY HORIZONTAL parallel stone lanes at approximately 25%, 49%, 73% of the image height, paved with worn gray-brown warm stone slabs, separated by narrow lush grass and moss garden bands. Leave the entire 10%-90% width of each lane open and visually quiet so existing towers can be placed on it. Spacious clear stone courtyards at left 5%-18% and right 82%-95% spanning all three lanes for the large nexus sprites. Keep foreground bottom 20% as darker stone terrace in shadow for an HTML card-hand overlay. Beautiful world framing around the outermost edges only: ruined low stone parapets, restrained leaves, ferns, blue canyon water, distant waterfalls, a few small warm torch flames at the far boundaries. Blue-gray stone with warm gold lighting harmonizes with existing tower sprites. The scene fills every pixel edge to edge: no rectangular board border, no vignette black blank bars, no separate panels, no frame, no top HUD. Symmetric gameplay readability, evocative natural environment. This is a background asset, not a screenshot or a game UI mockup.
