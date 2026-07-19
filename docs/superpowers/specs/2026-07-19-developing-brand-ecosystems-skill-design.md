# Design: Developing Brand Ecosystems Skill

Дата: 2026-07-19  
Статус: на пользовательском рассмотрении  
Primary owner: `developing-brand-ecosystems`

## 1. Цель

Создать универсальный Agent Skill для создания, аудита и развития целостных бренд-экосистем вокруг любого продукта, компании, сервиса, автора, культурного проекта или организации.

Навык переносит метод, применённый при создании POVKH LAB: исследование контекста, стратегия, поиск концепций, мастер-направление, айдентика, цифровой продукт, контентные и операционные системы, воспроизводимое производство, QA, launch gates и handoff. Он не переносит конкретную эстетику или отраслевую специфику кейса.

Основной сценарий — существующий бренд или продукт с фрагментарной системой, который требуется диагностировать, связать и развить. Создание с нуля поддерживается как равноправная рабочая ветка, когда пригодной основы нет.

## 2. Пользовательские сценарии

Skill должен срабатывать на запросы вроде:

- «Проведи аудит нашего бренда и собери план развития всей системы».
- «Свяжи позиционирование, айдентику, продуктовый сайт и контент».
- «Преврати существующие материалы проекта в полноценную бренд-экосистему».
- «Создай бренд продукта с нуля и доведи до production handoff».
- «Проверь дизайн-систему, сайт, шаблоны и документацию перед запуском».
- «Развивай бренд автономно, а стратегические решения показывай вариантами».
- «Опиши и воспроизведи наш способ создания бренда для другого продукта».

Skill не должен становиться primary owner для одиночной косметической правки, обычной feature-разработки без сквозной бренд-задачи, изолированного маркетингового текста, юридического заключения или общего бизнес-анализа.

## 3. Граница и routing

`developing-brand-ecosystems` — primary owner сквозной согласованности бренда и связанных продуктовых touchpoints. Он определяет зрелость системы, источники истины, нужные ветки, степень автономности и финальную интеграционную проверку.

Профильные skills подключаются как bounded methods:

- `frontend-design` — новое визуальное направление или крупный redesign;
- `ui-ux-pro-max` — UX, accessibility, responsive и interaction review;
- `playwright` или `webapp-testing` — проверка цифрового продукта в браузере;
- `imagegen` — новые растровые визуалы, когда они нужны результату;
- Remotion skills — реализация видео на Remotion;
- `data-analytics:build-dashboard` — метрики и операционные dashboard;
- `systematic-debugging` — воспроизводимый дефект;
- security skills — только при явно поставленной security-задаче.

Эти skills не заменяют владельца бренд-архитектуры и не меняют нормативные источники независимо от общей системы.

## 4. Архитектура skill

Один model-invoked router-skill использует прогрессивное раскрытие:

```text
developing-brand-ecosystems/
├── SKILL.md
├── agents/openai.yaml
├── references/
│   ├── discovery-and-maturity-audit.md
│   ├── strategy-and-positioning.md
│   ├── concept-development.md
│   ├── identity-and-design-system.md
│   ├── product-and-digital-experience.md
│   ├── content-and-campaigns.md
│   ├── media-and-physical-touchpoints.md
│   ├── operations-and-governance.md
│   ├── autonomy-and-approvals.md
│   ├── production-qa-and-launch.md
│   └── povkh-lab-method-case-study.md
├── scripts/
│   ├── inspect_brand_ecosystem.py
│   └── validate_brand_ecosystem.py
└── evals/
    ├── should-trigger.json
    └── workflow-cases.json
```

`SKILL.md` содержит общий цикл, routing, completion criteria и точные указатели на references. Отраслевые и touchpoint-детали загружаются только когда относятся к задаче.

## 5. Основной метод

1. Разрешить scope и тип субъекта: продукт, компания, сервис, автор, проект или организация.
2. Прочитать локальные инструкции, историю решений и существующие источники истины.
3. Определить состояние: существующая система, фрагментарная система или создание с нуля.
4. Провести baseline-аудит материалов, touchpoints, фактов, инструментов, validators и launch state.
5. Сформировать карту экосистемы: ядро бренда, потребители правил, зависимости, пробелы и конфликты.
6. Выбрать необходимые ветки и степень автономности для каждой группы решений.
7. При стратегическом выборе предложить 2–3 направления с trade-offs и рекомендацией.
8. После выбора развивать единую мастер-систему, а не набор несвязанных артефактов.
9. Производить редактируемые источники, производственные мастера и производные exports с явной иерархией.
10. Проверить каждое изменённое звено локально и всю карту зависимостей интеграционно.
11. Передать answer-first handoff: результат, доказательства, открытые решения и команды воспроизведения.

Работа завершена, когда каждое затронутое звено имеет источник истины, проверенный результат и понятную downstream-связь.

## 6. Модель зрелости

Skill классифицирует проект:

| Уровень | Состояние | Следующий шаг |
|---|---|---|
| 0 / Unformed | идея или разрозненные материалы | discovery и стратегия |
| 1 / Direction | есть смысл и визуальные направления | выбрать мастер-концепцию |
| 2 / Identity | есть айдентика, но мало правил | собрать дизайн-систему |
| 3 / Product | бренд применён в ключевом продукте | связать content/operations |
| 4 / Ecosystem | touchpoints согласованы | автоматизировать QA и handoff |
| 5 / Governed | источники и проверки устойчивы | измерять, поддерживать и очищать sediment |

Уровень зрелости используется для routing, а не как оценка художественного качества.

## 7. Модель автономности

Skill самостоятельно выбирает режим для каждой группы действий и сообщает его пользователю.

### Audit / proposal

Название, позиционирование, обещание, мастер-концепция, логотип, ключевая эстетика, публичные факты, права, необратимые действия, deployment и внешняя коммуникация. Результат — evidence-backed диагноз и варианты; изменение требует одобрения.

### Safe implementation

Обратимые локальные улучшения внутри утверждённой системы: accessibility, responsive behavior, структура данных, ссылки, документация, naming, validators и deterministic generators. Skill может реализовать их сразу и показать проверку.

### Autonomous completion

Цель и acceptance criteria ясны, действия локальны и обратимы, готовность механически проверяема. Skill продолжает до результата и останавливается при появлении нового стратегического решения или необходимости дополнительной власти.

Один запрос может сочетать все три режима.

## 8. Источники истины

Перед изменениями skill разрешает иерархию:

| Тип | Примеры | Правило |
|---|---|---|
| Нормативный источник | brand guide, design tokens, product/content schema | имеет приоритет при конфликте |
| Подтверждённый факт | спецификация, цена, дата, контакт, credit с evidence | разрешён для публикации |
| Planning fixture | демонстрационные KPI, даты, sample content | остаётся внутренним и маркированным |
| Редактируемый источник | SVG, design file, code, structured data | место будущих изменений |
| Производственный мастер | approved artwork, outlined logo, production build | разрешён для передачи и публикации |
| Производный экспорт | PNG, PDF, dist, preview | воспроизводится из источника |
| Архив процесса | concepts, WIP, rejected direction | сохраняет историю, но не конкурирует с мастером |

Если authority отсутствует, skill сначала предлагает или создаёт один нормативный источник и карту зависимостей.

## 9. Рабочие ветки

### Discovery and maturity audit

Инвентаризация субъекта, пользователей, рынка, материалов, технологий, touchpoints, ограничений, истории и зрелости. Результат — evidence-backed карта текущего состояния.

### Strategy and positioning

Контекст, аудитория, задача, обещание, отличие, ценности, характер, voice, naming и архитектура предложения. Ключевые решения проходят варианты и approval.

### Concept development

Создание нескольких различимых направлений, оценка по стратегии и ограничениям, выбор одной мастер-концепции и сохранение остальных как архива процесса.

### Identity and design system

Логотипная иерархия, цвет, типографика, сетка, imagery, iconography, motion principles, components, templates, production masters, лицензии и do/don't.

### Product and digital experience

Информационная архитектура, пользовательские пути, интерфейс, content model, i18n, accessibility, responsive behavior, performance, privacy, runtime boundaries и deployment readiness.

### Content and campaigns

Сообщения, editorial system, channel adaptation, campaign briefs, asset matrices, schedules, approvals, naming и отделение подтверждённых фактов от planning data.

### Media and physical touchpoints

Photo/video direction, motion, sound, packaging, print, environment, merchandise и другие нужные конкретному продукту носители. Ненужные носители не создаются.

### Operations and governance

Onboarding, роли, RACI, approvals, KPI definitions, dashboards, file structure, versioning, rights, handoff и recurring maintenance.

### Production QA and launch

Source/export соответствие, ссылки, схемы, naming, licenses, accessibility, responsive layout, media metadata, placeholders, public facts, build reproducibility и launch gates.

## 10. Deterministic scripts

`inspect_brand_ecosystem.py` выполняет read-only инвентаризацию указанного project root и выдаёт JSON или Markdown: структура, brand/product sources, assets, manifests, dependencies, fonts/licenses, technology stack, media tooling, build/QA entry points и возможные touchpoints. Скрипт не оценивает вкус и не пишет в проект.

`validate_brand_ecosystem.py` выполняет конфигурируемые ненарушающие проверки: broken local references, naming inconsistencies, missing declared licenses, placeholder markers в public outputs, source/master/export separation, declared QA commands и project-specific invariants. Универсальный код не содержит правил POVKH LAB.

Оба скрипта используют Python standard library, поддерживают `--help`, JSON output, структурированные exit codes и fixture tests.

## 11. POVKH LAB как методологический кейс

Reference описывает хронологию и переносимые уроки:

1. Зафиксировать характер и критерии бренда до производства артефактов.
2. Исследовать несколько визуальных направлений и выбрать один master.
3. Превратить направление в числовую дизайн-систему и production masters.
4. Развернуть систему в шаблоны, сайт и связанные операционные touchpoints.
5. Отделить подтверждённые факты от planning fixtures и sample content.
6. Сделать exports воспроизводимыми из редактируемых источников.
7. Встроить accessibility, responsive и media QA в production pipeline.
8. Добавить preview/production launch gates и понятный handoff.
9. Связать всю экосистему одной интеграционной проверкой.

Кейс явно не задаёт default-цвета, шрифты, знак, отрасль, набор touchpoints или визуальный язык для другого проекта.

## 12. Ошибки и восстановление

- При конфликтующих sources of truth остановить только затронутую ветку и рекомендовать один authority.
- При неизвестных фактах использовать явный unknown/placeholder status, не изобретать данные.
- При падении validator отделить дефект результата от дефекта среды и дать команду воспроизведения.
- При отсутствии инструмента продолжить доступную проверку и назвать непроверенную границу.
- В dirty worktree сохранять пользовательские изменения и учитывать собственный diff.
- При отсутствии оснований для нового touchpoint не создавать его ради полноты списка.

## 13. Проверка skill

### Статическая проверка

- `quick_validate.py` проходит.
- Имя каталога совпадает с `name`; description содержит trigger и near-miss границы.
- `SKILL.md` остаётся компактным; references доступны напрямую.
- `agents/openai.yaml` соответствует skill.
- Scripts проходят syntax check, `--help` и fixture tests.

### Activation evals

Should-trigger, should-not-trigger и ambiguous prompts на русском и английском проверяют: существующий бренд, продукт с фрагментарными touchpoints, создание с нуля, website-only near miss, одиночную правку и generic business analysis.

### Workflow evals

1. SaaS с продуктом и сайтом, но без единого позиционирования и design authority.
2. Существующий consumer brand с accessibility/responsive проблемами без запроса на redesign.
3. Культурный проект со смешанными public facts и planning fixtures.
4. Новый физический продукт без айдентики, упаковки и цифрового touchpoint.
5. POVKH LAB read-only case, где требуется извлечь универсальный метод без копирования эстетики.

Оцениваются routing, сохранение существующего характера, выбор автономности, evidence, tool discipline, отсутствие выдуманных фактов, YAGNI по touchpoints и validation handoff.

## 14. Критерии готовности

Skill готов, когда:

- устанавливается и обнаруживается Codex;
- применим к продуктам и организациям разных отраслей;
- корректно различает audit/development/from-scratch;
- самостоятельно выбирает и объясняет уровень автономности;
- загружает только нужные references и профильные skills;
- не копирует эстетику или отраслевую структуру POVKH LAB;
- сохраняет source-of-truth границы и пользовательские изменения;
- scripts проходят fixture tests;
- activation и workflow evals подтверждают routing;
- dry run на POVKH LAB выдаёт универсальную методику без записи в проект.

## 15. Не входит в первую версию

- Автоматические публикации, платежи, рассылки и внешние сообщения.
- Юридические заключения и подтверждение прав.
- Универсальная генерация каждого возможного touchpoint.
- Универсальный deploy framework для всех платформ.
- Принудительная замена существующей дизайн-системы.
- Многоагентный harness до появления измеримых проблем одного agent loop.
