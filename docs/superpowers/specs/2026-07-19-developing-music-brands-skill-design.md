# Design: Developing Music Brands Skill

Дата: 2026-07-19  
Статус: на пользовательском рассмотрении  
Primary owner: `developing-music-brands`

## 1. Цель

Создать универсальный Agent Skill для аудита и развития существующих музыкальных брендов. Навык должен уметь работать со стратегией, визуальной айдентикой, сайтом, каталогом, релизными кампаниями, EPK, контентными операциями, motion/sonic/photo-направлением, onboarding, physical/merch и операционными материалами.

Основной сценарий — существующий бренд, которому требуется диагностика, упорядочивание, развитие или production-подготовка. Создание бренда с нуля остаётся вторичной веткой и включается, когда пригодная система отсутствует.

POVKH LAB используется как source-backed case study воспроизводимого процесса, а не как эстетический шаблон для копирования.

## 2. Пользовательские сценарии

Skill должен срабатывать на запросы вроде:

- «Проведи аудит бренда музыкального лейбла и предложи развитие».
- «Приведи сайт артиста и айдентику к единой системе».
- «Собери из существующих материалов полноценную экосистему релиза».
- «Проверь бренд-гайд, логотипы, сайт, EPK и контент перед запуском».
- «Развивай этот музыкальный бренд автономно и показывай только важные решения».
- «Создай музыкальный бренд с нуля» — вторичный сценарий.

Skill не должен срабатывать на обычную разработку сайта без музыкального бренда, одиночную косметическую правку, музыкальное производство трека, юридическую консультацию или generic-маркетинг без задачи построения бренд-системы.

## 3. Граница и ответственность

`developing-music-brands` — primary owner для сквозного состояния музыкального бренда. Он отвечает за диагностику, выбор веток, согласованность источников истины и финальную интеграционную проверку.

Он может требовать профильные skills как методы исполнения:

- `frontend-design` — новое визуальное направление или крупный redesign;
- `ui-ux-pro-max` — отдельный UX/accessibility/responsive review;
- `playwright` или `webapp-testing` — браузерная проверка;
- `imagegen` — новые растровые визуалы, когда они действительно нужны;
- Remotion skills — только если проект реализован на Remotion;
- `systematic-debugging` — воспроизводимый дефект;
- `codex-security:security-scan` — только по явному запросу на security audit.

Профильные skills не становятся владельцами общей бренд-архитектуры и не меняют нормативные источники без учёта интеграционных правил.

## 4. Архитектура

Используется один model-invoked router-skill с прогрессивной загрузкой references:

```text
developing-music-brands/
├── SKILL.md
├── agents/openai.yaml
├── references/
│   ├── discovery-and-audit.md
│   ├── strategy-and-positioning.md
│   ├── visual-identity.md
│   ├── website-and-content-model.md
│   ├── release-campaigns.md
│   ├── motion-sonic-photo.md
│   ├── epk-onboarding-operations.md
│   ├── autonomy-and-approvals.md
│   ├── production-qa.md
│   └── povkh-lab-case-study.md
├── scripts/
│   ├── inspect_brand_project.py
│   └── validate_brand_system.py
└── evals/
    ├── should-trigger.json
    └── workflow-cases.json
```

`SKILL.md` содержит только общий цикл, правила routing, критерии завершения и точные указатели загрузки references. Детальные правила каждой ветки хранятся в одном одноуровневом каталоге `references/`.

## 5. Основной цикл

1. Разрешить scope проекта и прочитать локальные инструкции.
2. Определить состояние: существующая система, фрагментарная система или создание с нуля.
3. Найти источники истины, подтверждённые факты, ассеты, генераторы, validators и историю решений.
4. Выполнить baseline-аудит и составить карту систем, пробелов, конфликтов и launch gates.
5. Выбрать только необходимые рабочие ветки и загрузить соответствующие references.
6. Выбрать уровень автономности для каждой группы изменений.
7. Выполнить или предложить изменения, сохраняя существующий характер бренда, если redesign не запрошен.
8. Проверить локальные результаты и сквозные зависимости.
9. Выдать answer-first handoff: результат, доказательства, нерешённые решения и команды воспроизведения.

Skill не объявляет работу завершённой, пока каждое изменённое звено не проверено и не отражено в карте зависимостей.

## 6. Модель автономности

Skill сам выбирает режим для каждой группы действий и сообщает выбор пользователю.

### Audit / proposal

Применять к позиционированию, названию, логотипу, ключевой эстетике, публичным фактам, правам, необратимым удалениям, production deployment и внешним коммуникациям. Результат — evidence-backed диагноз и 2–3 решения с рекомендацией. Изменение требует одобрения.

### Safe implementation

Применять к обратимым локальным улучшениям в согласованной системе: accessibility, responsive fixes, структурирование данных, исправление локальных ссылок, QA, документация, deterministic generators. Можно реализовать сразу с проверкой и прозрачным отчётом.

### Autonomous completion

Применять, когда пользователь задал ясную цель, действия локальны и обратимы, а готовность доказуема механическими проверками. Skill продолжает до результата в пределах scope и останавливается при появлении нового стратегического решения или необходимости дополнительной власти.

Один запрос может сочетать все три режима для разных частей проекта.

## 7. Source-of-truth модель

Перед изменениями skill строит краткую таблицу:

| Тип | Примеры | Правило |
|---|---|---|
| Нормативный источник | brand guide, design tokens, content schema | имеет приоритет при конфликте |
| Подтверждённый факт | artist/title/date/links/credits с evidence | разрешён для публикации |
| Planning fixture | демонстрационная дата, KPI, placeholder release | остаётся внутренним и маркированным |
| Производственный мастер | outlined SVG, approved artwork, final audio | используется для внешней передачи |
| Производный экспорт | PNG/PDF/dist/preview | воспроизводится из мастера |
| Архив процесса | logo concepts, WIP, rejected direction | не становится публичным активом |

Если источник истины не определён, skill сначала предлагает или создаёт его, не размножая конкурирующие документы.

## 8. Рабочие ветки

### Discovery and audit

Инвентаризация файлов, технологии, утверждённых материалов, пробелов, конфликтов и текущего уровня зрелости. Результат — карта экосистемы и приоритеты.

### Strategy and positioning

История, аудитория, обещание, отличие, ценности, характер, voice, naming и архитектура каталога. Для ключевых решений всегда используются варианты и approval.

### Visual identity

Иерархия знаков, цвета, типографика, сетка, graphic language, templates, production masters, лицензии и правила do/don't. Existing identity сохраняется, если пользователь не запросил redesign.

### Website and content model

Информационная архитектура, content schema, i18n, доступность, responsive behavior, performance, privacy, launch gates, static/runtime boundaries и deployment readiness.

### Release campaigns

Release brief, metadata, asset matrix, schedule, copy deck, approvals, channel cadence и отделение подтверждённых фактов от planning data.

### Motion, sonic and photo

Грамматика движения, форматы, safe zones, sonic identifiers, shot direction, rights и воспроизводимый production pipeline.

### EPK, onboarding and operations

EPK, submission, metadata/master/artwork requirements, rights/credits, RACI, KPI definitions, dashboard, physical/merch handoff и manufacturer-specific gates.

### Production QA

Проверка source/export соответствия, ссылок, схем, naming, лицензий, accessibility, responsive layout, media metadata, placeholders, public facts и production launch gates.

## 9. Deterministic scripts

`inspect_brand_project.py` выполняет read-only инвентаризацию и выдаёт JSON/Markdown summary: структура, наличие типовых систем, manifests, зависимости, шрифты/лицензии, website stack, media tooling и QA entry points. Он не оценивает художественное качество и не пишет в проект.

`validate_brand_system.py` запускает ненарушающие статические проверки поверх явно указанного project root: broken local references, naming inconsistencies, missing licenses beside fonts, placeholder markers в public outputs, source/export separation и наличие declared QA commands. Проверки должны поддерживать конфигурацию проекта и не зашивать правила POVKH LAB как универсальные.

Скрипты используют Python standard library, имеют `--help`, структурированные exit codes и тестовые fixtures.

## 10. POVKH LAB case study

Reference описывает только переносимые уроки:

- нормативный бренд-гайд как приоритетный источник;
- десять связанных систем вокруг музыкального лейбла;
- утверждённый каталог отдельно от planning fixture;
- editable sources отдельно от production outlined masters и exports;
- локальные шрифты с лицензиями;
- статический мультиязычный сайт без внешнего runtime;
- precomputed audio waveforms и media pipelines;
- preview/production launch gates;
- единая QA-команда для интеграционной проверки.

Reference явно запрещает использовать название, логотипы, Signal Red, шрифтовую комбинацию или визуальный язык POVKH LAB как default для другого бренда.

## 11. Ошибки и восстановление

- При конфликтующих источниках истины остановить затронутую ветку, показать конфликт и рекомендовать один authority.
- При отсутствующих фактах сохранять `unknown`/placeholder с явным статусом, не изобретать данные.
- При падении validator отделить дефект результата от дефекта среды и предоставить точную команду воспроизведения.
- При отсутствии нужного инструмента продолжить доступные read-only проверки и описать непроверенную границу.
- При смешанном dirty worktree сохранять пользовательские изменения и учитывать только собственный diff.

## 12. Проверка skill

### Статическая проверка

- `quick_validate.py` проходит без ошибок.
- `name` совпадает с каталогом и description содержит реальные trigger/near-miss границы.
- `SKILL.md` остаётся компактным, все references доступны напрямую.
- `agents/openai.yaml` соответствует skill.
- scripts проходят syntax check, `--help` и fixture tests.

### Activation evals

Набор содержит should-trigger, should-not-trigger и ambiguous prompts на русском и английском. Отдельно проверяются существующий бренд, создание с нуля, website-only near miss и одиночная косметическая правка.

### Workflow evals

Минимум четыре сценария:

1. Фрагментарный лейбл с логотипом и сайтом, но без source of truth.
2. Existing identity с accessibility/responsive проблемами без запроса на redesign.
3. Release campaign со смешанными approved facts и planning fixture.
4. Пустой проект, где должна включиться вторичная ветка создания с нуля.

Оцениваются routing, сохранение характера, выбор автономности, evidence, tool discipline, отсутствие выдуманных фактов и полнота validation handoff.

## 13. Критерии готовности

Skill готов, когда:

- корректно устанавливается и обнаруживается Codex;
- выбирает существующий бренд как основной сценарий;
- самостоятельно выбирает и объясняет уровень автономности;
- загружает только нужные references;
- не копирует эстетику POVKH LAB;
- сохраняет source-of-truth границы и пользовательские изменения;
- scripts проходят тесты на fixtures;
- activation и workflow evals показывают ожидаемый routing;
- реальный dry run на копии POVKH LAB создаёт полезный аудит без изменения исходных файлов.

## 14. Не входит в первую версию

- Автоматическая публикация сайта, отправка писем или постинг в соцсети.
- Юридическое подтверждение прав, договоров или лицензий.
- Генерация финальной музыки или mastering.
- Универсальный deploy framework для всех хостингов.
- Принудительная замена существующего design system.
- Многоагентный harness: один skill и существующий Codex loop достаточны до появления измеримых проблем.
