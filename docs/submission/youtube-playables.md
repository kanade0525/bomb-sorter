# Bomb Sorter — YouTube Playables Submission Packet

Prepared for the **Public Playables Interest Form**.
All figures below are measured from the live production build, not estimated.

|                              |                                                          |
| ---------------------------- | -------------------------------------------------------- |
| **Title**                    | Bomb Sorter                                              |
| **Play now**                 | https://kanade0525.github.io/bomb-sorter/                |
| **Source**                   | https://github.com/kanade0525/bomb-sorter (public, MIT)  |
| **Status**                   | Fully developed and playable. Not a concept.             |
| **Genre**                    | Arcade / sorting / reaction                              |
| **Session length**           | 30 seconds to a few minutes per run                      |
| **Engine**                   | None. Hand-written TypeScript on Canvas 2D               |
| **Initial download**         | **68.8 KB**                                              |
| **Total bundle**             | **504 KB** across **17 files**                           |
| **Time to interactive**      | **93–174 ms** (measured over public HTTPS)               |
| **Peak JS heap**             | **9.5 MB**                                               |
| **Network calls after load** | **Zero.** Enforced by CSP `connect-src 'none'`           |
| **Languages**                | Japanese (UI). Interface is 95% numeric and iconographic |

---

## 1. Pitch

### One line

Red and black bombs waddle around a factory floor on tiny legs — drag each one into the
matching bin before its fuse burns out.

### Short (≈50 words)

Bomb Sorter is a one-thumb panic game. Little pixel-art bombs walk around a steel factory
floor, each with a lit fuse counting down. Drag every bomb into the bin that matches its
colour. Put one in the wrong bin, or let a fuse run out, and everything explodes.

### Long (≈150 words)

Bomb Sorter is a fast, tactile sorting game built for touch. Red and black bombs — identical
in shape, distinguished only by colour — wander around a hazard-taped factory floor on little
legs, each carrying a fuse that is visibly burning down. You drag them, one or two at a time,
into the matching bin at the edge of the screen.

Every bomb you sort stays in its bin and keeps milling around in there, so your progress is
something you can see rather than just a number climbing. Chain successful sorts within three
seconds of each other and the multiplier rises to 5x.

The pressure comes from four dials tightening together: more bombs on screen at once, shorter
fuses, faster spawns, faster walking. It starts at roughly one sort every three seconds and
ends demanding nearly two a second. One mistake ends the run.

---

## 2. What makes it a good fit for Playables

- **It loads instantly.** 68.8 KB initial download, interactive in under 200 ms. There is no
  loading screen because there is nothing to wait for.
- **It is understood in one glance.** Two coloured bins, coloured bombs, drag one into the
  other. No tutorial, no text to read, no onboarding flow.
- **It fits any window.** Portrait and landscape are separate hand-built layouts, not a
  stretched single layout. Verified playable from 9:32 through 32:9.
- **It is genuinely first-party.** Every pixel is drawn procedurally by the game's own code —
  there are no image files in the bundle. Every sound is synthesised at runtime with the Web
  Audio API — there are no audio files. There is no web font.
- **It never phones home.** No analytics, no telemetry, no third-party scripts, no ads. The
  production build ships a Content Security Policy with `connect-src 'none'`, which makes this
  an enforced property of the page rather than a promise.

---

## 3. Technical specification

### Stack

| Layer       | Choice                                                                          |
| ----------- | ------------------------------------------------------------------------------- |
| Language    | TypeScript 7 (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| Rendering   | Canvas 2D. No WebGL, no framework, no game engine                               |
| Build       | Vite 8 → static files. No server component of any kind                          |
| Audio       | Web Audio API, synthesised at runtime (oscillators + noise buffers)             |
| Art         | Drawn procedurally, one pixel at a time, from code                              |
| Numerals    | A 5×7 bitmap font defined in source (`src/view/pixel-font.ts`)                  |
| Persistence | `localStorage`, a single key, a few dozen bytes                                 |
| Input       | Pointer Events (touch + mouse), plus keyboard                                   |

### Bundle

```
Initial download          68.8 KB   (index.html + JS + CSS + manifest + icon)
Total bundle             504.0 KB   across 17 files
Largest single file      204.0 KB   (a JavaScript source map; 52 KB for the JS itself)
Largest non-map file      52.0 KB
```

### Measured performance

Measured against the live public build over HTTPS, in Chromium:

| Viewport   | Aspect           | Time to interactive      | Playable | Runtime errors |
| ---------- | ---------------- | ------------------------ | -------- | -------------- |
| 844 × 390  | 19.5:9 landscape | 848 ms (cold connection) | yes      | 0              |
| 390 × 844  | 9:19.5 portrait  | 93 ms                    | yes      | 0              |
| 1280 × 360 | **32:9**         | 143 ms                   | yes      | 0              |
| 360 × 1280 | **9:32**         | 98 ms                    | yes      | 0              |
| 600 × 600  | 1:1              | 93 ms                    | yes      | 0              |
| 800 × 600  | 4:3              | 174 ms                   | yes      | 0              |

Peak JS heap is 9.5 MB in every case.

Frame rate, measured over 5-second windows in the heaviest state the game can reach — both
bins filled to their 44-bomb cap, 88 sprites plus the field:

| Condition         | Frame rate   | Median frame | Dropped frames |
| ----------------- | ------------ | ------------ | -------------- |
| No throttling     | **60.2 fps** | 16.7 ms      | 0 / 301        |
| 4× CPU throttling | **59.4 fps** | 16.7 ms      | 3 / 297        |
| 8× CPU throttling | 33.0 fps     | 33.2 ms      | 84 / 165       |

8× throttling simulates a device far slower than any current phone; at 4×, which is a more
realistic low-end target, the game holds a steady 60 fps. Every character is a cached sprite
blitted once per frame rather than drawn pixel by pixel, which is what makes the filled-bin
case affordable.

### How the layout adapts

The short axis of the viewport is always mapped to exactly 360 logical pixels. The long axis
stretches within a clamped range, and the difference is absorbed by the play area — never by
the bombs. That means hit boxes, bomb size and difficulty are identical on every device and in
every orientation, so scores are comparable. Beyond the clamped range the view letterboxes
rather than distorting; nothing is ever stretched.

- **Landscape:** the two bins sit at the left and right edges, full height.
- **Portrait:** the two bins sit side by side along the bottom.
- Red is always on the left and black always on the right, in both orientations, so the muscle
  memory survives a device rotation.
- Resizing mid-drag releases the held bomb without penalty, because the coordinate system it
  was grabbed in no longer exists.

### Quality gates

The repository runs a full CI pipeline on every push:

- **244 unit tests** covering the entire rule set. All game logic lives in a pure layer that
  never touches `window`, `Date` or `Math.random`; randomness is threaded through an explicit
  seeded PRNG. The same seed and the same input always produce the same run.
- **164 end-to-end tests** driven by Playwright across four configurations: iPhone (WebKit) in
  both orientations, Android (Chromium), and desktop.
- A project-specific static check that enforces the architectural boundaries (no DOM access in
  the pure layer, no `innerHTML`, no external imports, no binary assets).

---

## 4. Certification compliance

Checked against the published Playables certification requirements.

### Already met

| Requirement                                         | Status                                                                                                               |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Initial bundle < 30 MiB (MUST), < 15 MiB (SHOULD)   | **68.8 KB**                                                                                                          |
| Total bundle < 250 MiB (MUST)                       | **504 KB**                                                                                                           |
| Individual file < 30 MiB (MUST), < 512 KiB (SHOULD) | largest is **204 KB**                                                                                                |
| Total files ≤ 8000                                  | **17**                                                                                                               |
| Filenames limited to alphanumerics, `_`, `-`, `.`   | yes                                                                                                                  |
| Interactive within 5 s (SHOULD)                     | **93–174 ms**                                                                                                        |
| Peak JS heap < 512 MB (MUST NOT exceed)             | **9.5 MB**                                                                                                           |
| No reproducible crashes                             | 0 runtime errors across all tested viewports                                                                         |
| Save data < 3 MiB (MUST), < 500 KiB (SHOULD)        | a few dozen bytes                                                                                                    |
| Playable at every aspect ratio, 9:32 → 32:9         | verified, table above                                                                                                |
| Adjusts automatically to viewport changes           | yes, via `ResizeObserver` + `visualViewport`                                                                         |
| Preserves game state across a resize                | yes, covered by an end-to-end test                                                                                   |
| Does not lock orientation or posture                | manifest declares `orientation: "any"`                                                                               |
| Touch **and** mouse input                           | both, through unified Pointer Events                                                                                 |
| Keyboard input supported (SHOULD)                   | Space / Enter start, Esc pause and resume, M mute, R retry                                                           |
| Esc closes modal dialogs (SHOULD)                   | Esc resumes from the pause screen                                                                                    |
| No in-game share prompt                             | none                                                                                                                 |
| No clickable links to external sites                | none                                                                                                                 |
| No additional user agreements shown                 | none                                                                                                                 |
| No in-game exit or quit button                      | none                                                                                                                 |
| Text and graphics render crisply at every density   | canvas is rendered at device resolution, capped at DPR 2, with nearest-neighbour scaling to keep the pixel art sharp |

### Integration status

A dedicated Playables build target now exists alongside the standalone site:

```bash
npm run build:playables   # emits dist-playables/
npm run check:playables   # builds, then checks the output against the requirements
```

| Requirement                                            | Status                                                                                                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Relative paths only, absolute paths not allowed (MUST) | **Done.** `dist-playables/` emits `./assets/...`; a check script fails the build if an absolute path appears                                  |
| SDK loaded before any game code                        | **Done.** `<script src="https://www.youtube.com/game_api/v1">` is injected ahead of the module script, and a check verifies the ordering      |
| `firstFrameReady()` then `gameReady()`                 | **Done.** `firstFrameReady()` fires after the first frame is painted; `gameReady()` after the loop starts, never while a loading screen is up |
| Save data through `saveData()` / `loadData()`          | **Done.** Persistence goes through one seam that swaps between `localStorage` and the SDK                                                     |
| Audio follows the platform mute state                  | **Done.** `isAudioEnabled()` at start, `onAudioEnabledChange()` thereafter                                                                    |
| Pause / resume follows the platform                    | **Done.** `onPause()` / `onResume()`                                                                                                          |
| No icons resembling platform controls                  | **Done.** The mute, pause and fullscreen buttons are hidden when the game detects it is running inside Playables                              |
| Score submission via `sendScore()`                     | **Done.** Sent on game over, clamped to a safe integer                                                                                        |
| Localisation (SHOULD)                                  | **Done.** Japanese and English, chosen from `getLanguage()`. Everything else on screen is numeric or iconographic                             |
| No Service Worker in the Playables bundle              | **Done.** The PWA plugin is dropped from that build; the platform owns delivery and updates                                                   |
| CSP                                                    | The standalone build keeps `connect-src 'none'`. The Playables build allows exactly one origin, `https://www.youtube.com`, for the SDK        |

The Playables bundle is **84 KiB across 9 files**, with the largest single file at 53 KiB.

Because the real SDK only exists inside YouTube, the integration is verified against a
stand-in that has the same shape: seven end-to-end checks confirm the lifecycle calls fire
once each in the right order, that the platform's mute and pause reach the game, that saves
and score submission go through the SDK, that the language is honoured, and that the in-game
control buttons disappear. The game also falls back to the browser implementation whenever the
SDK is absent, so the Playables build can be opened and played locally without YouTube.

---

## 5. Rights and content

- All code was written for this game and is published under the MIT licence.
- All artwork is generated by the game's own code at runtime. There are no image files in the
  bundle, including the app icons, which are rendered from the same drawing routines.
- All audio is synthesised at runtime with the Web Audio API. There are no audio files.
- No web fonts. Latin numerals use a bitmap font defined in this repository's source; Japanese
  labels use the operating system's own font.
- The only third-party content is a set of six user-interface icons taken from **Material
  Symbols** (© Google, Apache Licence 2.0), embedded as SVG path data and attributed in
  [`NOTICE.md`](../../NOTICE.md). These are the mute, pause, play, refresh, home and
  fullscreen glyphs. If a submission requires the game to be entirely first-party, they can be
  redrawn in the game's own pixel-art style — and in the Playables build most of them are
  removed anyway, since the platform provides those controls.
- The game takes its _mechanic_ from a memory of a Nintendo DS mini-game about sorting bombs by
  colour. Nothing else is borrowed: no character names, no artwork, no sounds, no naming. The
  characters, the setting, the presentation and the code are original. The game is not
  affiliated with Nintendo in any way.
- No user data is collected. Nothing is transmitted anywhere. The only stored data is a high
  score, kept in the player's own browser.

---

## 6. Screenshots

In [`screenshots/`](screenshots/), captured from the live build on an iPhone 17 viewport
(WebKit) at device resolution.

| File                         | What it shows                                       |
| ---------------------------- | --------------------------------------------------- |
| `00-icon-512.png`            | App icon, 512 × 512                                 |
| `01-title-landscape.png`     | Title screen, landscape                             |
| `02-gameplay-landscape.png`  | Early gameplay, landscape                           |
| `03-late-game-landscape.png` | Late game — bins filling up, chain multiplier at 5x |
| `04-carrying-to-bin.png`     | A bomb being carried; the destination bin lights up |
| `05-game-over.png`           | Game over, with the run summary                     |
| `06-gameplay-portrait.png`   | Early gameplay, portrait — bins move to the bottom  |
| `07-late-game-portrait.png`  | Late game, portrait                                 |
| `08-title-portrait.png`      | Title screen, portrait                              |

---

## 7. Suggested form answers

- **"How did you hear about YouTube Playables?"** — the accurate answer is
  **AI (ChatGPT, Gemini, etc.)**, since the platform came up through an AI assistant while
  building this game.
- **"Please only submit fully developed games or games in a playable state."** — satisfied. The
  game is live, complete and playable at the URL above, with no account or install required.
