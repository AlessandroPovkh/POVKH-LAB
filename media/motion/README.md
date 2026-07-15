# POVKH LAB — motion identity kit v1

Пять пресетов реализуют формулу `CUT → PRESSURE → SIGNAL → RELEASE` без stock glitch и сторонних ассетов.

| Scene | Master | Duration | FPS | Use |
|---|---:|---:|---:|---|
| `ident` | 1080×1080 | 4.00 s | 24 | publisher logo ident |
| `transition` | 1920×1080 | 1.00 s | 24 | единичный cut/signal transition |
| `loop` | 1920×1080 | 4.00 s seamless | 24 | фон сцены, session archive |
| `blob-sound` | 1920×1080 | 3.00 s seamless | 30 | red `SOUND.` hero background |
| `blob-process` | 1920×1080 | 3.00 s seamless | 30 | blue `PROCESS.` hero background |
| `blob-archive` | 1920×1080 | 3.00 s seamless | 30 | green `ARCHIVE.` hero background |
| `blob-team` | 1920×1080 | 3.00 s seamless | 30 | magenta `TEAM` hero background |
| `blob-origin` | 1920×1080 | 3.00 s seamless | 30 | violet `ORIGIN` hero background |
| `blob-signal` | 1920×1080 | 3.00 s seamless | 30 | amber `SIGNAL` hero background |
| `blob-link` | 1920×1080 | 3.00 s seamless | 30 | cyan `LINK` hero background |
| `blob-prime` | 1920×1080 | 3.00 s seamless | 30 | acid `PRIME` hero background |
| `ambient-field` | 1280×720 | 4.00 s seamless | 24 | monochrome site-wide analyzer/noise background |
| `lower-third` | 1920×1080 | 4.00 s | 24 | artist/release lower third |
| `story` | 1080×1920 | 5.00 s | 30 | вертикальный Story/Reel release preset |

`preview.html` — responsive preview с play/pause/restart и `prefers-reduced-motion`. `STORYBOARD.svg` фиксирует логику ident. Все видимые artist/title/date — плейсхолдеры.

## Рендер и QA

Нужны локальные Playwright Chromium из общего `tools/` и `ffmpeg`/`ffprobe` в PATH.

```bash
node render_motion.mjs
node qa_motion.mjs
```

Рендер создаёт MP4 для всех пяти сцен, WebM для ident/loop, GIF-preview и PNG keyframe. Базовые identity scenes рендерятся в 24 FPS, а vertical Story/Reel preset — в 30 FPS согласно internal Reels delivery baseline. Исходники не содержат нативной timeline-анимации: каждый кадр вычисляется из абсолютного времени, поэтому повторная сборка воспроизводима. MP4/WebM не содержат аудио; при монтаже используется sonic kit, а финальный loudness измеряется на полном ролике.
