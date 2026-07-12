# SPEC 08 — Juego Arkanoid en canvas real

> **Status:** Aprobad
> **Depends on:** SPEC 01 (HUD, CRT, modal, `.av-player`), SPEC 02 (Home/biblioteca), SPEC 05 (patrón motor+página de Asteroids), SPEC 06 (catálogo y leaderboard en Supabase)
> **Date:** 2026-07-12
> **Objective:** Portar el Arkanoid de `references/started-games/04-arkanoid/game.js` a un motor TypeScript client-only que corre en `/juego/arkanoid/jugar`, integrado con el HUD, el marco CRT y el guardado de puntuaciones, y publicarlo como ficha nueva `arkanoid` en el catálogo (BD + fallback) conviviendo con el mock `bloque-buster`.

---

## Section 1 — Por qué este spec

El patrón para integrar un juego de canvas real ya está establecido por SPEC 05 (Asteroids) y SPEC 07
(Tetris), sobre la infraestructura de catálogo/leaderboard en Supabase con fallback de SPEC 06. Este
spec **aplica ese mismo patrón** a un tercer juego, Arkanoid, sin inventar arquitectura: reproduce la
frontera motor headless ↔ chrome React y añade la fila de catálogo + el seed del leaderboard. Se
decide una **identidad propia `arkanoid`** (como `asteroids`↔`rocas` y `tetris`↔`caida`), dejando el
mock `bloque-buster` intacto.

---

## Scope

**In:**

- **Motor portado a TypeScript** (`app/juego/arkanoid/jugar/engine.ts`): paleta, pelota, rejilla de
  bloques, colisiones AABB, rebotes (paredes/paleta/bloques), **5 niveles 1:1** desde `levels.js`
  (layouts + multiplicadores de velocidad `1.00→1.46`), 3 vidas, `score +10` por bloque, re-servir
  pelota directo al perder vida, y **victoria al limpiar el nivel 5**. Render con **primitivas neón**
  (sin spritesheet). Rotura de bloque con **efecto de partículas/flash**. Client-only. Expone
  `createArkanoid(canvas, { onState, onGameOver })` con `pause/resume/restart/forceGameOver/resize/destroy`
  y emite el estado a React.
- **Página cliente dedicada** `app/juego/arkanoid/jugar/page.tsx` (`"use client"`) que monta el
  `<canvas>` por `ref`, cablea el motor y reusa el chrome: **HUD** (Jugador / Puntuación / **Vidas** /
  Nivel + botones **PAUSA/FIN/SALIR**), **marco CRT** y **modal "FIN DEL JUEGO"** con input de nombre.
- **HUD alimentado por el motor**: se descarta el HUD que dibujaba el canvas (`Score`/`Nivel`/iconos
  de vida) y los overlays internos; Puntuación/Vidas/Nivel salen del `GameState` real.
- **Ficha `arkanoid` nueva** en `app/data/games.ts` (fallback) con `playHref: "/juego/arkanoid/jugar"`
  y `cover: "cover-arkanoid"`. Convive con el mock `bloque-buster` (no se toca).
- **Portada CSS `cover-arkanoid`** en `app/globals.css`, arte pixel/neón propio (paleta + pelota +
  muro magenta) distinto de `cover-bricks`.
- **Supabase**: fila `arkanoid` en `public.games` (mismos valores que el fallback, `sort_order` = 10)
  y **~12 filas sembradas** en `public.scores` con `seededScores` para paridad BD↔fallback.
- **Guardado real** al game over (y a la victoria) vía `insertScore({ gameId: "arkanoid", playerName, score })`.
- **Control por la plataforma**: **PAUSA** congela `update`/`draw` y muestra "EN PAUSA"; **FIN**
  fuerza el game over; **SALIR** vuelve a `/juego/arkanoid`. Se desactivan el reinicio interno, la
  pausa por tecla `P`/`Escape` del original y el **atajo de salto de nivel** de la pantalla de pausa.
- **Controles**: **← →** (mover paleta, con `preventDefault`) **y ratón** (mousemove sobre el canvas
  mueve la paleta).
- **Mundo responsive**: el área 4/3 (800×600) encaja en la pantalla CRT; `resize()` re-mide, reescala
  posiciones proporcionalmente y ajusta `devicePixelRatio`.

**Out of scope (specs futuros):**

- Controles táctiles/móviles.
- **Sonido/audio** (rebote y rotura del original: `ball-bounce.mp3`, `break-sound.mp3`).
- Portar el spritesheet PNG del original.
- Salto de nivel (atajo de la pausa), tema del original.
- Control de ángulo de rebote según punto de impacto (se copia el rebote plano 1:1).
- Cablear el juego a la ficha `bloque-buster` o unificarlas.
- `best` en vivo, `plays` real, dificultad configurable, bucle infinito de niveles.
- Portar los demás juegos del catálogo.

---

## Data model

Esta feature **no introduce estructuras nuevas de datos de plataforma**: reusa el tipo `Game` (con
`playHref`, ya existente), las tablas `games`/`scores` de SPEC 06 y `insertScore`. Introduce **una
ficha de catálogo**, **una fila de BD + seed** y el **contrato interno del motor**.

### 1. Ficha en `GAMES` (`app/data/games.ts`) y fila en `public.games`

```ts
{
  id: "arkanoid",
  title: "ARKANOID",
  short: "Rompe el muro de bloques rebotando la pelota con tu paleta.",
  long: "El clásico rompe-muros, real y jugable: mueve la paleta con las flechas o el ratón, rebota la pelota y pulveriza la rejilla de bloques a lo largo de 5 niveles cada vez más rápidos. Tienes 3 vidas; limpia el último muro para completar el juego.",
  cat: "ARCADE",
  cover: "cover-arkanoid",
  color: "magenta",
  best: 28450,
  plays: "0",
  playHref: "/juego/arkanoid/jugar",
}
```

La fila de `public.games` replica **exactamente** estos valores (con `play_href` snake_case y
`sort_order` = 10, máximo actual 9 + 1). El seed de `public.scores` para `game_id = "arkanoid"` se
genera con `seededScores("arkanoid".length * 17 + 3, 12)` = `seededScores(139, 12)` para que BD y
fallback coincidan.

### 2. Contrato del motor (`app/juego/arkanoid/jugar/engine.ts`)

```ts
// Fases: "playing" activo, "paused" congelado, "gameover" fin.
// No hay fase "dead": al perder pelota se re-sirve directo (lives--) sin pausa.
export type GamePhase = "playing" | "paused" | "gameover";

export interface GameState {
  score: number;
  lives: number; // inicia en 3
  level: number; // 1..5
  phase: GamePhase;
}

export interface ArkanoidHandle {
  pause(): void;
  resume(): void;
  restart(): void;
  forceGameOver(): void; // botón FIN
  resize(): void; // re-mide el contenedor y reescala el mundo
  destroy(): void; // cancela el rAF y quita listeners (teclado + ratón)
}

export function createArkanoid(
  canvas: HTMLCanvasElement,
  opts: {
    onState: (s: GameState) => void; // alimenta el HUD React
    onGameOver: (finalScore: number) => void; // abre el modal (game over Y victoria)
  },
): ArkanoidHandle;
```

**Convenciones:**

- El motor es la **fuente de verdad** de score/vidas/nivel; React refleja (`onState`) y persiste al
  final (`onGameOver`).
- Arkanoid **sí tiene vidas y niveles**: el HUD de plataforma muestra **Puntuación / Vidas / Nivel**
  (igual que Asteroids). `emitState()` usa dedupe por clave `"score|lives|level|phase"`.
- **Victoria = fin de partida**: al limpiar todos los bloques del **nivel 5** se dispara
  `onGameOver(score)` (mismo camino que perder las 3 vidas). No hay pantalla de victoria propia ni
  bucle de niveles.
- **Re-servir directo**: al perder pelota, `lives--`; si `lives > 0` se recoloca la pelota sobre la
  paleta y sigue (sin fase `dead`); si `lives === 0` → `phase = "gameover"` + `onGameOver`.
- **Rebote de paleta 1:1**: invierte `vy` conservando `vx` (sin control de ángulo por punto de impacto).
- El nombre de guardado sigue la lógica del placeholder: `nameEdit ?? user?.name ?? "INVITADO"`,
  mayúsculas, máx. 10.

### 3. Constantes y niveles portados (1:1 desde el original)

Se copian de `game.js`/`levels.js` como constantes del motor (referidas al mundo lógico 800×600,
reescaladas en `resize()`):

```ts
// game.js
PADDLE_SPEED = 400        // px/s (teclado)
BLOCK_COLS = 10, BLOCK_ROWS = 6, BLOCK_W = 64, BLOCK_H = 24
BLOCKS_ORIGIN_X = (800 - 10*64) / 2 = 80,  BLOCKS_ORIGIN_Y = 80
BASE_BALL_VX = 200, BASE_BALL_VY = -300   // × speed del nivel
paddle = { w: 81, h: 14, y: 560 };  ball = { w: 16, h: 16 }
lives = 3;  score += 10 por bloque
```

`LEVELS` (de `levels.js`) se porta **literal**: array de 5 niveles, cada uno
`{ speed, blocks: [{ col, row, color }] }`, con `speed = [1.00, 1.10, 1.21, 1.33, 1.46]` y los
layouts L1–L5 (relleno completo, pirámide, damero, huecos, marco+cruz). Los colores lógicos del
original (`red|yellow|cyan|magenta|hotpink|green|gray`) se mapean a la paleta neón CRT al dibujar.
`loadLevel(n)` reconstruye `blocks` y re-sirve la pelota con la `speed` del nivel.

---

## Implementation plan

Cada paso deja el sistema compilando y navegable. (Se corresponden con las Fases 3–8 de la skill
`/nuevo-juego`.) **Restricción Next.js 16:** antes de tocar código de Next (App Router, `"use client"`,
`use(params)`) leer `node_modules/next/dist/docs/`.

1. **Motor `engine.ts`.** Portar `game.js` + `levels.js` a TypeScript estricto usando
   `app/juego/asteroids/jugar/engine.ts` como plantilla viva. Aplicar las transformaciones del patrón:
   - **Contrato público arriba** (`GamePhase`, `GameState`, `ArkanoidHandle`, opciones, `createArkanoid`).
   - **`World` en vez de globales**: `{ W, H, ctx, keys }`; las entidades dejan de leer `canvas`/`ctx`
     globales. Estado (`paddle`, `ball`, `blocks`, `particles`, `lives`, `score`, `currentLevel`) en
     **closures** dentro de `createArkanoid` (nada a nivel de módulo; SSR-safe).
   - **Física 1:1**: `update(dt)` con movimiento de paleta (teclado), movimiento de pelota, rebotes de
     pared (izq/der/arriba), **rebote de paleta plano** (invierte `vy`, conserva `vx`), colisión AABB
     con bloques (`+10`, `vy = -vy`, un bloque por frame), avance de nivel al limpiar
     (`loadLevel(n+1)`), **victoria** al limpiar el nivel 5 (`forceGameOver`-like → `onGameOver`), y
     **pérdida de vida** al caer la pelota (`lives--`; re-servir o `gameover`).
   - **Partículas/flash** en lugar de la animación de explosión por spritesheet: al romper un bloque,
     emitir un puñado de partículas del color del bloque que decaen en ~0.3 s (reusar el patrón de
     partículas de Asteroids). Sin PNG ni loader.
   - **Render neón**: dibujar bloques/paleta/pelota con rects + glow de canvas mapeando los colores
     lógicos a la paleta CRT. **Quitar** `drawHUD` (score/nivel/iconos de vida), `drawOverlay`
     ("GAME OVER"/"¡Completaste el juego!") y `drawPauseOverlay` (incluido el **salto de nivel**).
   - **`resize()`** con `devicePixelRatio`: mide `getBoundingClientRect()`, fija backing store físico,
     `setTransform(dpr,…)`, y reescala posiciones proporcionalmente; velocidades en px/s absolutos.
   - **`emitState()`** con dedupe por clave `"score|lives|level|phase"`; `force=true` en transiciones.
   - **Loop con pausa**: agenda siempre el siguiente rAF, dibuja siempre, `update` solo si `!paused`;
     `dt = Math.min((ts-last)/1000, 0.05)`.
   - **Handle** completo: `pause/resume` (flag + `emitState(true)`), `restart` (`lastTime=null`,
     re-init a nivel 1 / 3 vidas / score 0), `forceGameOver` (guard `gameOverFired`, dispara
     `onGameOver` una vez), `resize`, `destroy` (cancela rAF + quita listeners de **teclado y ratón**).
   - **`GAME_KEYS`** (`ArrowLeft`, `ArrowRight`) con `preventDefault`; **listener de `mousemove`** en el
     canvas para mover la paleta (mapear coordenadas con `getBoundingClientRect`). **Quitar** la pausa
     por `P`/`Escape` y el `click` de salto de nivel (los gestiona React / se descartan).
     _Test:_ `npm run lint` y `npm run build` sin errores; sin acceso a `document`/`window` en el import.

2. **Página cliente `page.tsx`.** Copiar `app/juego/asteroids/jugar/page.tsx` y ajustar: import de
   `./engine` (`createArkanoid`), `id` `arkanoid`, HUD con **Vidas** (igual que Asteroids),
   `router.push("/juego/arkanoid")` en SALIR, modal con `insertScore({ gameId: "arkanoid", ... })`.
   `ResizeObserver` → `handle.resize()`; cleanup con `destroy()`. El canvas real ocupa `.crt-screen`
   (sin la `.game-arena` decorativa ni `setInterval` falso). _Test:_ `/juego/arkanoid/jugar` carga, se
   ve la paleta y la pelota rebotando, sin errores en consola; las flechas no scrollean; el ratón
   mueve la paleta; PAUSA congela/reanuda.

3. **Ficha fallback en `games.ts`.** Añadir la entrada `arkanoid` (valores del Data model). _Test:_
   `/biblioteca` muestra la card ARKANOID; `/juego/arkanoid` renderiza el detalle; "JUGAR AHORA" apunta
   a `/juego/arkanoid/jugar`; el mock `bloque-buster` sigue intacto; `lint` pasa.

4. **Portada `cover-arkanoid`.** Invocar la skill **`/frontend-design`** para el arte y añadir la clase
   en `app/globals.css` (paleta + pelota + muro magenta), distinta de `cover-bricks`. Verificar
   `z-index`/`position` sobre `av-bg`/`av-noise`. _Test:_ card y detalle muestran arte propio.

5. **Supabase (migración).** `apply_migration add_game_arkanoid`: `insert` en `public.games` (mismos
   valores que el fallback, `play_href = /juego/arkanoid/jugar`, `sort_order` = 10) + seed de ~12 filas
   en `public.scores` generadas con `seededScores(139, 12)` (ver plantilla Node de la skill; `created_at`
   a medianoche UTC del `DD/MM/2026` de la semilla). `get_advisors` (security) sin hallazgos nuevos.
   _Test:_ `select count(*) from public.scores where game_id='arkanoid'` = 12;
   `select * from public.games where id='arkanoid'` = 1 fila con `sort_order` 10.

6. **Verificación y cierre.** `npm run build`/`npm run lint` limpios; capturas Playwright
   (→ `.playwright-screenshots`) de biblioteca (card), detalle (portada), partida en curso, estado
   PAUSA y modal de fin; jugar de verdad (romper bloques, subir de nivel, perder vidas) y confirmar que
   la puntuación aparece en `/salon` de Arkanoid tras recargar. Verificar por **píxeles** (no solo DOM)
   que nada queda oculto tras `av-bg`/`av-noise`.

---

## Acceptance criteria

- [ ] `npm run build` y `npm run lint` terminan sin errores.
- [ ] No hay errores en consola al cargar `/juego/arkanoid/jugar` ni durante la partida.
- [ ] `/biblioteca` muestra una card **ARKANOID** con portada `cover-arkanoid` propia (distinta de
      `cover-bricks`); `/juego/arkanoid` renderiza el detalle con esa portada.
- [ ] En `/juego/arkanoid`, "JUGAR AHORA" navega a `/juego/arkanoid/jugar`; el mock `bloque-buster` y
      su ruta siguen intactos.
- [ ] En `/juego/arkanoid/jugar`: la paleta se mueve con **← →** y con el **ratón**; la pelota rebota
      en paredes, paleta y bloques; romper un bloque suma **+10** y emite el efecto de partículas;
      limpiar todos los bloques avanza de nivel y la velocidad sube (`1.00→1.46`).
- [ ] Al perder la pelota se resta una vida y se re-sirve directo (sin pausa); con 0 vidas se abre el
      modal "FIN DEL JUEGO".
- [ ] Al limpiar el **nivel 5** se abre el modal "FIN DEL JUEGO" con la puntuación real (victoria =
      fin de partida), no un overlay/pantalla aparte.
- [ ] El HUD de plataforma (Puntuación / **Vidas** / Nivel) refleja el estado real del motor; el canvas
      no dibuja HUD propio, ni overlays "GAME OVER"/"¡Completaste!", ni pausa con salto de nivel.
- [ ] **PAUSA** congela y muestra "EN PAUSA"; **REANUDAR** continúa; **FIN** fuerza el fin; **SALIR**
      vuelve a `/juego/arkanoid`.
- [ ] Las flechas **no** hacen scroll de la página.
- [ ] Guardar en el modal inserta la fila con `game_id: "arkanoid"` y es visible en `/salon` tras
      recargar.
- [ ] "JUGAR DE NUEVO" reinicia limpio (score 0, 3 vidas, nivel 1); "VOLVER AL VAULT" va a `/biblioteca`.
- [ ] Redimensionar la ventana no deforma la paleta/pelota/bloques (se mantiene el aspecto 4/3); el
      juego sigue jugable.
- [ ] Al desmontar la página se cancela el `requestAnimationFrame` y se quitan los listeners de teclado
      **y ratón** (sin fugas ni logs de "canvas null").
- [ ] Existe la fila `arkanoid` en `public.games` (`sort_order` 10) y ~12 filas en `public.scores`;
      `get_advisors` (security) no reporta tablas sin RLS.

---

## Decisions

- **Sí:** Ficha nueva `arkanoid` conviviendo con el mock `bloque-buster`. **No:** cablear el motor a
  `bloque-buster`; se replica la identidad propia de Asteroids/Tetris.
- **Sí:** Ruta dedicada `/juego/arkanoid/jugar` + `playHref`. **No:** resolver el placeholder genérico
  `/jugar/[id]`.
- **Sí:** Render con **primitivas neón** (rects + glow), coherente con asteroids/tetris. **No:** portar
  el spritesheet PNG + loader; añade asset, carga asíncrona y rompe la estética unificada.
- **Sí:** **Victoria = fin de partida** (`onGameOver(score)` al limpiar el nivel 5), reusando el modal.
  **No:** pantalla de victoria propia ni bucle infinito de niveles.
- **Sí:** **Re-servir directo** al perder vida, sin fase `dead`; `phase` = `playing|paused|gameover`
  (como Tetris). **No:** copiar el respawn de Asteroids, que no aplica.
- **Sí:** `GameState = { score, lives, level, phase }` con HUD **Puntuación/Vidas/Nivel** (Arkanoid sí
  tiene vidas y niveles). **No:** sustituir Vidas por otro campo (a diferencia de Tetris).
- **Sí:** Controles **← →** (teclado, con `preventDefault`) **y ratón** (mousemove). **No:** solo
  teclado; el ratón es el control natural del género y no rompe el patrón.
- **Sí:** **Rebote de paleta 1:1** (invierte `vy`). **No:** control de ángulo por punto de impacto; es
  una mecánica nueva ausente del original.
- **Sí:** Rotura de bloque con **partículas/flash** de canvas. **No:** la animación de explosión por
  frames del spritesheet.
- **Sí:** Conservar las **5 niveles y toda la física** del original (`levels.js` literal). **No:**
  recortar niveles ni el multiplicador de velocidad.
- **Sí:** **Quitar** el salto de nivel de la pausa, la pausa por `P`/`Escape`, el reinicio interno y el
  audio. **No:** conservar atajos de debug ni sonido en este spec.
- **Sí:** Color de botón `magenta`, distinto del cyan del mock `bloque-buster`. **No:** reusar el cyan.
- **Sí:** Portada CSS propia `cover-arkanoid` vía `/frontend-design`. **No:** reusar `cover-bricks`.

---

## Risks

| Riesgo                                                                            | Mitigación                                                                                                                                |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| El motor accede a `document`/`window` en el import y rompe el build de servidor.  | Módulo client-only; estado en closures; se instancia solo en `useEffect` de una página `"use client"`; el paso 1 lo verifica con `build`. |
| Fuga de `requestAnimationFrame`/listeners (teclado **y ratón**) al navegar fuera. | `destroy()` cancela el rAF y quita ambos listeners; se llama en el cleanup del `useEffect`.                                               |
| Las flechas hacen scroll de la página o roban foco.                               | `preventDefault` en `GAME_KEYS`; el foco de teclado se gestiona en la página; verificado en el paso 2.                                    |
| El **listener de ratón** desincroniza la paleta al reescalar (dpr/tamaño CSS).    | El mousemove mapea con `getBoundingClientRect` a coordenadas del mundo; `resize()` reescala posiciones; paso 6.                           |
| Deformación del área 4/3 o pérdida de nitidez dentro de la pantalla CRT.          | `resize()` re-mide, mantiene el aspecto y ajusta `devicePixelRatio`; verificado con capturas en el paso 6.                                |
| Desincronización HUD↔motor (score/vidas/nivel).                                   | `emitState()` con dedupe por clave es la única fuente de verdad; el paso 2 lo comprueba jugando.                                          |
| Catálogo BD desincronizado del fallback `GAMES`.                                  | La migración copia los valores exactos de la ficha; el seed usa `seededScores(139, 12)`, misma semilla que el fallback.                   |
| Contenido oculto tras `av-bg`/`av-noise` por `z-index` mal portado.               | El paso 6 verifica **por píxeles** (no solo DOM) que HUD, canvas y modal quedan por encima del fondo.                                     |
| `dt` desbocado al volver de una pestaña en segundo plano (spiral-of-death).       | Se conserva el cap `Math.min(dt, 0.05)`; PAUSA detiene `update` cuando procede.                                                           |
| Doble disparo de `onGameOver` (perder última vida y, a la vez, limpiar nivel).    | Guard `gameOverFired` en `forceGameOver`/fin: `onGameOver` se dispara una sola vez por partida.                                           |

---

## What is **not** in this spec

- Controles táctiles/móviles.
- Sonido/audio (rebote y rotura del original).
- Portar el spritesheet PNG.
- Salto de nivel en la pausa, tema del original, control de ángulo de rebote.
- Cablear el juego a la ficha `bloque-buster` o unificarlas.
- `best` en vivo, `plays` real, dificultad configurable, bucle infinito de niveles.
- Portar los demás juegos del catálogo.

Cada uno de esos, si se aborda, va en su propio spec.
