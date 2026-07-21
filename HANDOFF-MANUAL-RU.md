# POVKH LAB — START HERE

Переносимый handoff-пакет для дизайнера, разработчика и вайб-кодера. Срез проекта: 21 июля 2026.

## Что внутри

- `site/` — production-oriented статический сайт, контент, локальные ассеты, сборщик и browser QA.
- `assets/`, `templates/`, `exports/`, `brand-board.html` — бренд-мастера, шрифты, шаблоны и экспортированные материалы.
- `campaigns/`, `content-system/`, `epk/`, `media/`, `onboarding/`, `production/`, `dashboard/` — экосистема лейбла вокруг сайта.
- `tools/` — экспорт и QA бренд-пакета.
- `skills/` — справочные снимки релевантных Codex skills, использованных как дизайн/production-подходы. Они не нужны сайту во время выполнения.
- `LIBRARIES-AND-TOOLS.md` — точный стек и границы воспроизводимости.

`node_modules`, браузерные бинарники Playwright, Git-объекты и временные QA-артефакты намеренно не архивируются: это пересобираемые или машинно-зависимые данные. Точные версии JavaScript-библиотек зафиксированы в `package-lock.json`.

## Быстрый старт сайта

Нужны Node.js 18+, npm и, для обработки аудио, `ffmpeg`/`ffprobe`.

```bash
cd site
npm ci
npx playwright install chromium webkit
npm run build
npm run check
npm run qa
npm run serve
```

Откройте адрес, который напечатает сервер. Главный результат сборки находится в `site/dist/`.

Для бренд-экспортов и общей проверки:

```bash
cd tools
npm ci
npx playwright install chromium
cd ..
npm --prefix tools run qa
```

Для Python-инструмента перевода логотипов в кривые:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r tools/requirements.txt
```

## Как всё создавалось — хронология

### 1. Сначала сформировали характер бренда

POVKH LAB строился не как обычный «сайт музыкального лейбла», а как строгая лабораторно-редакционная система: тёмное поле, Signal Red, техническая типографика, каталожные номера и ощущение контролируемого сигнала. Нормативная база находится в `BRAND-GUIDE-RU.md`.

### 2. Исследовали визуальные направления

В `logo-concepts/` сохранена история поиска. 21 июля 2026 года мастером стал Terminal Relic на основе утверждённого орнамента `logo-concepts/terminal-relic/source/ornament-original.svg`. Concept 02 / Typographic Monolith и остальные направления — история процесса, а не альтернативные публичные логотипы.

### 3. Собрали логотип и дизайн-токены

Система получила тёмные, светлые, горизонтальные, компактные, монохромные и ASCII-версии Terminal Relic. Производственные `*-outlined.svg` не зависят от установленных шрифтов и пересобираются из единого орнамента командой `python3 tools/build_logo_outlines.py`. Цвета, охранные поля и минимальные размеры закреплены в бренд-гайде.

### 4. Зафиксировали типографику и лицензии

Display — Barlow Condensed; основной текст — Inter; метаданные — IBM Plex Mono. Файлы и SIL OFL-лицензии лежат рядом в `assets/fonts/` и `site/assets/fonts/`.

### 5. Превратили стиль в систему шаблонов

Появились SVG-шаблоны релизной обложки, Instagram 4:5, Stories и YouTube, затем бренд-борд, EPK, campaign kit, onboarding, content operations, photo/video direction, physical/merch и dashboard.

### 6. Спроектировали сайт как независимый статический продукт

Сайт написан на HTML/CSS/vanilla JavaScript и Node.js ESM без React, Vue, внешнего CDN, трекеров и runtime-зависимостей. Node-скрипт генерирует готовые страницы в `site/dist/`; браузеру нужен только статический хостинг.

### 7. Создали единый контентный источник

`site/data/catalog.json` — источник каталога из 13 релизов. `site/data/artists.json` — артисты и галереи. `site/src/i18n.mjs` — EN/IT/RU интерфейс и редакционный текст. Внутренние черновики не попадают в публичную сборку.

### 8. Построили маршруты и мультиязычность

Генератор создаёт home, каталог, страницы релизов, локальные listen-choosers, артистов, process/about/contact/press/download, затем зеркалит маршруты для итальянского и русского языков. Переключатель языка сохраняет текущий маршрут.

### 9. Добавили аудио и визуальную динамику

HUD-плеер использует локальные streaming-копии и заранее рассчитанные waveform JSON. Motion-язык бренда собран в `media/motion/`; `ffmpeg` используется только на этапе производства, а не в браузере.

### 10. Сделали доступность и устойчивость частью дизайна

Playwright проверяет Chromium и WebKit, разные viewport, клавиатуру, reduced motion, аудио-контракты и внутреннюю навигацию. Axe проверяет доступность. Сайт работает и как обычный набор статических ссылок без JavaScript.

### 11. Добавили безопасные launch gates

По умолчанию сборка остаётся preview: `noindex`, placeholder origin и закрытый `robots.txt`. Production-сборка требует подтверждённый домен и контактные данные. Переменные перечислены в `site/README.md`.

### 12. Свели всё единым QA

`node tools/qa_label_ecosystem.mjs` проверяет бренд-мастера, контент, EPK, onboarding, media, physical geometry, сайт, dashboard, ссылки, манифесты и разделение утверждённого каталога от planning fixture.

## Карта для вайб-кодера

Если меняете визуальный слой — начинайте с `BRAND-GUIDE-RU.md`, `site/assets/styles.css` и `site/assets/site.js`.

Если меняете страницы — смотрите `site/src/pages.mjs`; переводы — `site/src/i18n.mjs`; данные — `site/data/*.json`; правила сборки — `site/tools/build.mjs`.

После любого изменения сайта запускайте:

```bash
cd site && npm test
```

После изменения логотипов, шаблонов или экосистемы запускайте:

```bash
python3 tools/build_logo_outlines.py --check
npm --prefix tools run qa
```

Не подменяйте утверждённые факты красивым текстом. Не публикуйте concept PNG как логотипы. Не меняйте написание `POVKH LAB` и каталожный формат `PVKH-###`. Не добавляйте CDN/аналитику/трекеры без отдельного решения о приватности и CSP.

## Публичный запуск

Перед релизом заполните production domain и контакты, проверьте ссылки стримингов, даты и artwork, выполните production build, `npm test`, ручную проверку на телефоне и затем разворачивайте содержимое `site/dist/` на статическом хостинге.

Подробности и исключения: `site/README.md`, `README.md`, `ECOSYSTEM-MAP-RU.md`, `ECOSYSTEM-FINAL-AUDIT-RU.md`.
