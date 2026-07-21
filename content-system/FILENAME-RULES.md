# POVKH LAB — правила имён файлов

## Формула

```text
PVKH_[CAT]_[ARTIST]_[RELEASE]_[ASSET]_[RATIO_OR_SIZE_OR_DURATION]_[STATUS]_vNN_YYYYMMDD.ext
```

Это та же каноническая схема, что в `BRAND-GUIDE-RU.md` и content playbook. Для `PVKH-001` значение `[CAT]` — `001`, чтобы избежать повторения `PVKH_PVKH-001`. `[ARTIST]` и `[RELEASE]` берутся только из approved metadata; их нельзя заменять выдуманными значениями.

Примеры:

```text
PVKH_001_ARTIST_RELEASE_IG_FEED_ANNOUNCE_RU_4x5_APR_v03_20260903.png
PVKH_001_ARTIST_RELEASE_IG_REEL_EXCERPT_NONE_15S_APR_v02_20260910.mp4
PVKH_001_ARTIST_RELEASE_YT_VISUALIZER_NONE_16x9_APR_v05_20260914.mp4
PVKH_001_ARTIST_RELEASE_PRESS_EPK_EN_A4_APR_v04_20260904.pdf
PVKH_001_ARTIST_RELEASE_AUDIO_TRACK01_MASTER_NONE_APR_v07_20260901.wav
```

## Токены

- `PVKH` — только production prefix; бренд в публичном тексте остаётся `POVKH LAB`.
- `[CAT]`: цифровая часть каталожного номера, например `001`.
- `[ARTIST]`, `[RELEASE]`: approved ASCII/transliterated tokens; публичное metadata сохраняет утверждённое написание.
- `[ASSET]`: ясная составная группа, при необходимости включая channel и language: `IG_FEED_ANNOUNCE_RU`, `PRESS_EPK_EN`, `COVER_MASTER_NONE`.
- `[RATIO_OR_SIZE_OR_DURATION]`: `1x1`, `4x5`, `9x16`, `16x9`, `3000x3000`, `3000PX`, `15S`, `30S`, `A4`, `RESPONSIVE`, `NONE`.
- `[STATUS]`: только `WIP`, `RVW`, `APR`, `PUB`.
- `vNN`: всегда две цифры начиная с `v01`; `FINAL`, `FINAL2`, `NEW`, `USETHIS` запрещены.
- `YYYYMMDD`: дата текущей версии/export; восемь цифр, обязательна в production delivery.

## Символы и регистр

- Только ASCII `A–Z`, цифры, underscore и одна точка перед extension.
- Без пробелов, кириллицы, emoji, скобок и `#`.
- Extension lowercase: `.png`, `.jpg`, `.svg`, `.mp4`, `.wav`, `.pdf`, `.html`, `.txt`.
- До заполнения всех токенов строка является filename pattern, а не допустимым delivery filename.

Строки матрицы, которые являются destination, а не локальным файлом (`Private URL` или `HTTPS URL`), используют ровно `URL` вместо формулы. Это единственное исключение; перед публикацией сам URL хранится и проверяется в campaign board, а не маскируется под filename.

## Version control

1. Source и export имеют один version number, если export создан из этого source.
2. После approval файл не перезаписывают: следующая правка получает новый `vNN`.
3. Approved version копируется в `APPROVED/`, drafts — в `WORKING/`.
4. В campaign board хранится ссылка именно на файл, а не только на папку.
5. Архив не содержит словесных дублей; version history остаётся читаемой.

## Audio additions

Для финальных записей добавлять track position и точный version token:

```text
PVKH_001_ARTIST_RELEASE_AUDIO_01_TRACKTITLE_ORIGINAL_MASTER_NONE_APR_v03_20260901.wav
PVKH_001_ARTIST_RELEASE_AUDIO_02_TRACKTITLE_ARTISTREMIX_MASTER_NONE_APR_v02_20260901.wav
```

Title token для файла может быть ASCII-транслитерацией, но публичное metadata сохраняет утверждённое написание. Нельзя определять title из имени файла автоматически без сверки с canonical metadata.

## Исключение для template baseline

Файлы в `media/campaign-assets/PVKH-001/source` и `exports` сейчас являются маркированными `WIP / PLACEHOLDER` шаблонами и намеренно не содержат выдуманные `[ARTIST]`, `[RELEASE]` или approval date. Их короткие технические имена не являются production-delivery схемой. При activation материал обязательно экспортируется под полной формулой выше; короткий fixture filename наружу не передаётся.
