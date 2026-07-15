# POVKH LAB — бренд-пакет

Айдентика v1.0 · редакционная проверка 15 июля 2026

## С чего начать

- [Бренд-гайд](BRAND-GUIDE-RU.md) — нормативный источник: логотип, цвета, типографика, размеры, охранное поле и правила применения.
- [Карта экосистемы](ECOSYSTEM-MAP-RU.md) — навигация по десяти рабочим системам лейбла.
- [Финальный аудит экосистемы](ECOSYSTEM-FINAL-AUDIT-RU.md) — проверенный scope, исправления, команды и границы template baseline.
- [Контент-плейбук](docs/content-playbook-ru.md) — практическая система релизов, площадок, motion, именования и проверки перед публикацией.
- [Интерактивный бренд-борд](brand-board.html) и [PDF](exports/POVKH-LAB-Brand-Board-v1.0.pdf) — визуальное представление системы.
- [Аудит бренд-мастеров](FINAL-AUDIT-RU.md) — исторический scope логотипов, бренд-борда и базовых шаблонов; это не финальный аудит всей десятисистемной экосистемы.

Если документы расходятся, действует `BRAND-GUIDE-RU.md`. Бренд-борд показывает систему, но не заменяет числовую спецификацию.

## Десять рабочих систем

| Система | Точка входа |
|---|---|
| Release campaign | [`campaigns/PVKH-001/`](campaigns/PVKH-001/) и [`media/campaign-assets/PVKH-001/`](media/campaign-assets/PVKH-001/) |
| Motion identity | [`media/motion/`](media/motion/) |
| Label website | [`site/`](site/) · production build: [`site/dist/index.html`](site/dist/index.html) |
| Label / release EPK | [`epk/`](epk/) · PDF: [`epk/exports/`](epk/exports/) |
| Sonic identity | [`media/sonic/`](media/sonic/) |
| Artist onboarding | [`onboarding/`](onboarding/) |
| Content operations | [`content-system/`](content-system/) |
| Photo / video direction | [`media/photo-video/`](media/photo-video/) |
| Physical / merch | [`production/physical-merch/`](production/physical-merch/) |
| Operations dashboard | [`dashboard/POVKH-LAB-Operations-Dashboard.html`](dashboard/POVKH-LAB-Operations-Dashboard.html) |

Все десять систем готовы и воспроизводимы. Сайт содержит отдельно утверждённый трёхъязычный каталог из 13 релизов на срезе `2026-07-15`, но остаётся pre-launch `noindex` до утверждения production-домена, контактов и OpenGraph-графики. Кампания и dashboard для `PVKH-001 / 2026-09-18` по-прежнему являются независимым planning fixture: они не служат источником фактов для опубликованного каталога сайта.

## Единая проверка template baseline

Из корня бренд-пакета:

```bash
node tools/qa_label_ecosystem.mjs
```

Команда последовательно проверяет brand masters, campaign/editorial, EPK и onboarding, media kits, physical geometry, актуальный сайт, source-backed dashboard, доступность, responsive layout, manifests, JSON/CSV/SVG, локальные ссылки и границу между утверждённым site catalog и planning fixture.

Прогон ожидает реальный каталог сайта (`13` релизов, `published/upcoming`, `public: true`) одновременно с `draft-awaiting-release-inputs`, `planning-fixture-unapproved` и `fixture` в отдельной демонстрационной кампании/dashboard. Он также требует, чтобы fixture-дата не попадала в сайт. Это всё ещё не production sign-off: сайт намеренно остаётся `noindex` и использует placeholder domain/OG/contact gates.

## Активация реального релиза

1. Сохраняйте planning fixture отдельно от утверждённого каталога сайта; не используйте его как источник release facts.
2. Для новой кампании получите artist/title, masters, artwork, rights/credits, distributor confirmation, contacts и URLs; для каждого факта запишите owner, approver, timestamp и evidence.
3. Пока дата имеет `releaseDateStatus: planning-fixture-unapproved`, используйте `2026-09-18` только для внутреннего расчёта. Публичный `SIGNAL` не содержит дату; `ANNOUNCE` возможен только после `releaseDateStatus: approved` и заполненных `approvedBy`/`approvedAt`/`evidenceUrl`.
4. Обновляйте approved site projection только из проверенных platform facts. Campaign/dashboard переводите из fixture отдельно и только после их собственного approval.
5. Перед production sign-off добавьте или включите status-aware production QA: он должен требовать заполненные факты/evidence, отсутствие плейсхолдеров, public links/domain/robots и совпадение campaign → site → dashboard. Текущий baseline QA продолжает проверять только шаблон.
6. После production QA выполните ручной mobile/print/link readback и сохраните отдельный датированный ecosystem audit report.

## Что использовать

| Задача | Файл |
|---|---|
| Основной квадратный знак на тёмном поле | `assets/logo/povkh-lab-primary-dark-outlined.svg` |
| Основной квадратный знак на светлом поле | `assets/logo/povkh-lab-primary-light-outlined.svg` |
| Горизонтальный знак на тёмном поле | `assets/logo/povkh-lab-horizontal-dark-outlined.svg` |
| Компактный знак `PL` на тёмном поле | `assets/logo/povkh-lab-compact-dark-outlined.svg` |
| Светлый знак без фоновой плашки | `assets/logo/povkh-lab-primary-reverse-transparent-outlined.svg`, `assets/logo/povkh-lab-horizontal-reverse-transparent-outlined.svg` или `assets/logo/povkh-lab-compact-reverse-transparent-outlined.svg` |
| Тёмный знак без фоновой плашки | `assets/logo/povkh-lab-primary-dark-transparent-outlined.svg` |
| Одноцветный знак без фона | `assets/logo/povkh-lab-mono-black-transparent-outlined.svg` или `assets/logo/povkh-lab-mono-white-transparent-outlined.svg` |
| Редактируемые макеты | `templates/` |
| Approved logo PNG | только `exports/POVKHLAB_Logo_*` и `exports/POVKHLAB_Mark_*` |
| Бренд-борд и sample/template previews | `exports/POVKH-LAB-Brand-Board-*` и `exports/POVKHLAB_Template_*` — не release-ready |

`*-outlined.svg` — производственные файлы: буквы переведены в кривые и не зависят от установленных шрифтов. SVG без `-outlined` — редактируемые конструктивные исходники; их не отправляют наружу как мастер.

PNG `assets/logo/concept-*-reference.png` — архив разработки, а не логотипы. Их нельзя публиковать, отдавать партнёрам или использовать вместо SVG-мастеров.

## Правило написания

- `POVKH LAB` — единственное написание названия бренда.
- `POVKH` — авторская подпись внутри названия и логотипа.
- `PVKH-001`, `PVKH-002`… — каталожные номера; `PVKH_...` — префикс внутренних производственных файлов.
- Нельзя писать `PVKH LAB` или использовать `POVKH-001` как каталожный номер.

## Шрифты и лицензии

- Barlow Condensed Bold / ExtraBold / Black (`700 / 800 / 900`) — display.
- Inter Variable (`400–600` в системе бренда) — основной наборный текст.
- IBM Plex Mono Regular / Medium / SemiBold (`400 / 500 / 600`) — метаданные.

Файлы шрифтов и тексты лицензий SIL Open Font License 1.1 находятся в `assets/fonts/`. При передаче редактируемого макета передавайте также нужные TTF и соответствующий `OFL-*.txt`; производственные outlined-логотипы этого не требуют.

## Что отправлять

- Дизайнеру: нужные `*-outlined.svg`, `assets/fonts/`, `templates/`, бренд-гайд и плейбук.
- Контент-команде: бренд-гайд, плейбук, `brand-board.html` и нужные шаблоны.
- Внешнему партнёру: только нужный outlined SVG либо `POVKHLAB_Logo_*` / `POVKHLAB_Mark_*` PNG. `POVKHLAB_Template_*` не отправлять как готовый контент.
- PDF-борд: можно передавать как identity reference, но все `ARTIST / RELEASE / PVKH-001 / 18.09.2026` внутри являются sample data и не подтверждают релиз.
- Типографии: outlined SVG, цветовые значения из гайда и требование физической цветопробы Signal Red.

Мастер-направление — **Concept 02 / Typographic Monolith**. Concept 01 и Concept 03 сохранены только как архив процесса; они не являются альтернативными публичными логотипами.
