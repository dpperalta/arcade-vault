# SPEC (game-jam) — ABISMO · variante A (descenso)

> **Status:** Borrador
> **Tema del jam:** Océano profundo
> **Depends on:** SPEC 01 (HUD, CRT, modal, `.av-player`), SPEC 02 (Home/biblioteca), SPEC 05 (patrón motor+página de Asteroids), SPEC 06 (catálogo y leaderboard en Supabase)
> **Date:** 2026-07-22
> **Objective:** Andamiar un juego de **descenso submarino** en un motor TypeScript client-only que corre en `/juego/abismo/jugar`: pilotas un batiscafo que baja por el abismo esquivando criaturas y rocas mientras la presión (velocidad) sube, integrado con el HUD, el marco CRT y el guardado de puntuaciones, y publicado como ficha nueva `abismo` en el catálogo (BD + fallback).

---

## Section 1 — Por qué este spec

El patrón para integrar un juego de canvas real ya está establecido por SPEC 05 (Asteroids), SPEC 07
(Tetris), SPEC 08 (Arkanoid) y SPEC 09 (Snake), sobre la infraestructura de catálogo/leaderboard en
Supabase con fallback de SPEC 06. Este spec **aplica ese mismo patrón** a un juego temático de
"océano profundo" en modo **andamiar** (no existe `game.js` de referencia): se construye el motor
desde cero respetando la misma frontera motor headless ↔ chrome React. La mecánica —**esquiva
vertical con scroll continuo**— es un clásico de arcade de una sola pantalla (tipo caída/esquiva) que
encaja de lleno en el patrón, con física continua px/s reusando la plantilla viva de Asteroids. Se
decide una **identidad propia `abismo`**, sin colisionar con ninguna ficha del catálogo.

> **Variante:** esta es la **variante A (descenso / esquiva, `ARCADE`)** de ABISMO. La variante
> hermana **B (sónar / disparo, `SHOOTER`)** vive en `variante-b-sonar.md`. Ambas comparten tema,
> `slug` `abismo` y portada; se implementa **solo una**. Elige antes de pasar a `/spec-impl`.

---

## Scope

**In:**

- **Motor andamiado en TypeScript** (`app/juego/abismo/jugar/engine.ts`): mundo lógico **480×640**
  (portrait), batiscafo controlado por el jugador que se mueve en horizontal (y un poco en vertical
  acotado), **scroll continuo hacia abajo** que simula el descenso, generación procedural de
  **obstáculos** (criaturas/rocas) que suben por pantalla, **colisión AABB** con margen benévolo,
  **3 vidas** con breve invulnerabilidad tras el golpe, **burbujas de oxígeno** recogibles que suman
  puntos, `score` por **profundidad recorrida** (+ bonus por burbuja), y **presión creciente** que
  acelera el scroll y la densidad de obstáculos por tramos de profundidad. Render con **primitivas
  neón** (batiscafo, criaturas, burbujas, partículas de estela). Client-only. Expone
  `createAbismo(canvas, { onState, onGameOver })` con `pause/resume/restart/forceGameOver/resize/destroy`
  y emite el estado a React.
- **Página cliente dedicada** `app/juego/abismo/jugar/page.tsx` (`"use client"`) que monta el
  `<canvas>` por `ref`, cablea el motor y reusa el chrome: **HUD** (Jugador / Puntuación / **Vidas** /
  **Profundidad** + botones **PAUSA/FIN/SALIR**), **marco CRT** y **modal "FIN DEL JUEGO"** con input
  de nombre.
- **HUD alimentado por el motor**: Puntuación / Vidas / Profundidad salen del `GameState` real; el
  canvas no dibuja HUD propio ni overlays.
- **Ficha `abismo` nueva** en `app/data/games.ts` (fallback) con `playHref: "/juego/abismo/jugar"` y
  `cover: "cover-abismo"`.
- **Portada CSS `cover-abismo`** en `app/globals.css`, arte pixel/neón propio (batiscafo + criatura +
  degradado de profundidad, acento cyan).
- **Supabase**: fila `abismo` en `public.games` (mismos valores que el fallback, `sort_order` =
  máximo actual + 1) y **~12 filas sembradas** en `public.scores` con `seededScores(105, 12)` para
  paridad BD↔fallback.
- **Guardado real** al game over vía `insertScore({ gameId: "abismo", playerName, score })`.
- **Control por la plataforma**: **PAUSA** congela `update`/`draw` y muestra "EN PAUSA"; **FIN**
  fuerza el game over; **SALIR** vuelve a `/juego/abismo`.
- **Controles**: **← →** (mover el batiscafo en horizontal) y **↑ ↓** (ajuste vertical acotado), con
  `preventDefault` en las flechas para no scrollear.
- **Mundo responsive**: el área portrait 480×640 (aspecto 3:4) se centra en la pantalla CRT (4/3) con
  **letterboxing**; `resize()` re-mide y ajusta `devicePixelRatio`.

**Out of scope (specs futuros):**

- Controles táctiles/móviles.
- Sonido/audio (motor, golpe, burbuja).
- **Sprites** de criaturas o del batiscafo (se dibuja todo con primitivas).
- Power-ups (escudo, oxígeno extra, arpón): en este spec no hay ítems más allá de las burbujas de
  puntos.
- Jefes de tramo, ramificaciones de ruta, obstáculos destructibles.
- Cablear el juego a otra ficha del catálogo o unificarlas.
- `best` en vivo, `plays` real, dificultad configurable.
- Portar los demás juegos del catálogo.

---

## Data model

Esta feature **no introduce estructuras nuevas de datos de plataforma**: reusa el tipo `Game` (con
`playHref`, ya existente), las tablas `games`/`scores` de SPEC 06 e `insertScore`. Introduce **una
ficha de catálogo**, **una fila de BD + seed** y el **contrato interno del motor**.

### 1. Ficha en `GAMES` (`app/data/games.ts`) y fila en `public.games`

```ts
{
  id: "abismo",
  title: "ABISMO",
  short: "Desciende al abismo esquivando criaturas mientras la presión te empuja.",
  long: "Un juego de descenso, real y jugable: pilota un batiscafo de neón hacia las profundidades esquivando criaturas y rocas que emergen de la oscuridad. Recoge burbujas de oxígeno para sumar puntos y aguanta lo más hondo posible mientras la presión acelera el descenso. Tres golpes y el casco cede.",
  cat: "ARCADE",
  cover: "cover-abismo",
  color: "cyan",
  best: 41200,
  plays: "0",
  playHref: "/juego/abismo/jugar",
}
```

La fila de `public.games` replica **exactamente** estos valores (con `play_href` snake_case y
`sort_order` = máximo actual + 1). El seed de `public.scores` para `game_id = "abismo"` se genera con
`seededScores("abismo".length * 17 + 3, 12)` = `seededScores(105, 12)` para que BD y fallback
coincidan.

### 2. Contrato del motor (`app/juego/abismo/jugar/engine.ts`)

```ts
// Fases: "playing" activo, "paused" congelado, "gameover" fin.
// No hay fase "dead": al recibir un golpe se resta vida y se activa invulnerabilidad breve
// (parpadeo), sin pausa; al llegar a 0 vidas → gameover directo.
export type GamePhase = "playing" | "paused" | "gameover";

export interface GameState {
  score: number; // profundidad × factor + burbujas × BUBBLE_POINTS
  lives: number; // inicia en 3
  depth: number; // metros descendidos (entero). Ocupa el hueco de "Nivel" en el HUD
  phase: GamePhase;
}

export interface AbismoHandle {
  pause(): void;
  resume(): void;
  restart(): void;
  forceGameOver(): void; // botón FIN
  resize(): void; // re-mide el contenedor y reescala el mundo
  destroy(): void; // cancela el rAF y quita listeners de teclado
}

export function createAbismo(
  canvas: HTMLCanvasElement,
  opts: {
    onState: (s: GameState) => void; // alimenta el HUD React
    onGameOver: (finalScore: number) => void; // abre el modal
  },
): AbismoHandle;
```

**Convenciones:**

- El motor es la **fuente de verdad** de score/vidas/profundidad; React refleja (`onState`) y
  persiste al final (`onGameOver`).
- El HUD de plataforma muestra **Puntuación / Vidas / Profundidad** (Profundidad ocupa el hueco de
  "Nivel", como Tetris puso "Líneas" y Snake puso "Longitud"). `emitState()` usa dedupe por clave
  `"score|lives|depth|phase"`.
- **Golpe = resta directa**: al chocar, `lives--` + invulnerabilidad de `INVULN_TIME` con parpadeo;
  si `lives === 0` → `phase = "gameover"` + `onGameOver(score)` una sola vez (guard `gameOverFired`).
  No hay respawn ni fase `dead`.
- El nombre de guardado sigue la lógica del placeholder: `nameEdit ?? user?.name ?? "INVITADO"`,
  mayúsculas, máx. 10.

### 3. Constantes del motor (andamiadas, mundo lógico 480×640)

```ts
((WORLD_W = 480), (WORLD_H = 640)); // portrait 3:4
SUB = { w: 40, h: 28 }; // batiscafo (AABB)
SUB_SPEED_X = 320; // px/s (horizontal, teclado)
SUB_SPEED_Y = 180; // px/s (vertical acotado dentro de una banda)
SUB_Y_BAND = [80, 260]; // rango vertical permitido del batiscafo
BASE_SCROLL = 120; // px/s de descenso en profundidad 0
SCROLL_STEP = 8; // +px/s de scroll por cada tramo de profundidad
DEPTH_STEP = 250; // px de descenso = 1 "tramo" (sube presión)
METERS_PER_PX = 0.05; // profundidad (m) = px descendidos × factor
LIVES = 3;
INVULN_TIME = 1.2; // s de invulnerabilidad tras golpe
OBSTACLE_MIN_GAP = 0.7; // s entre spawns en profundidad 0
OBSTACLE_MIN_GAP_FLOOR = 0.28; // cota inferior del intervalo de spawn
BUBBLE_POINTS = 250; // score por burbuja recogida
DEPTH_POINTS = 10; // score por metro descendido
```

**Modelo de movimiento (clave del andamiaje):** física **continua px/s** como Asteroids/Arkanoid (no
tick de rejilla). El "descenso" se simula moviendo obstáculos y burbujas **hacia arriba** a
`scrollSpeed(depth)`; el batiscafo permanece en su banda vertical y se controla en X (y algo en Y). La
profundidad acumula `scrollSpeed × dt`; cada `DEPTH_STEP` px sube un tramo que incrementa
`scrollSpeed` (`BASE_SCROLL + tramo*SCROLL_STEP`) y acorta el intervalo de spawn (hasta
`OBSTACLE_MIN_GAP_FLOOR`). Spawns en X aleatoria en el borde inferior; se descartan al salir por
arriba. `update(dt)` mueve entidades, resuelve colisiones AABB (batiscafo↔obstáculo = golpe;
batiscafo↔burbuja = recoger), actualiza score/profundidad y partículas de estela. `draw` cada frame.

---

## Implementation plan

Cada paso deja el sistema compilando y navegable. (Se corresponden con las Fases 3–8 de la skill
`/nuevo-juego`.) **Restricción Next.js 16:** antes de tocar código de Next (App Router, `"use client"`,
`use(params)`) leer `node_modules/next/dist/docs/`. **Restricción client-only:** el motor no accede a
`document`/`window` en el import; se instancia solo dentro de `useEffect` de una página `"use client"`.

1. **Motor `engine.ts` (andamiado).** Crear `app/juego/abismo/jugar/engine.ts` en TypeScript estricto
   usando `app/juego/asteroids/jugar/engine.ts` como **plantilla viva** del patrón, con física
   continua px/s:
   - **Contrato público arriba** (`GamePhase`, `GameState`, `AbismoHandle`, opciones, `createAbismo`).
   - **`World` en vez de globales**: `{ W, H, ctx, keys }`; estado (`sub`, `obstacles[]`, `bubbles[]`,
     `particles[]`, `lives`, `score`, `depthPx`, `scrollSpeed`, `spawnTimer`, `invulnT`) en
     **closures** dentro de `createAbismo` (nada a nivel de módulo; SSR-safe).
   - **Física 1:1 del diseño**: movimiento del batiscafo (teclado, acotado a `SUB_Y_BAND` y a los
     bordes X), scroll de obstáculos/burbujas hacia arriba a `scrollSpeed`, spawn procedural con
     `spawnTimer`, colisión AABB (golpe con invulnerabilidad; recoger burbuja `+BUBBLE_POINTS`),
     acumulación de profundidad y subida de tramo (acelera scroll + acorta spawn), pérdida de vida y
     `gameover` a 0 vidas.
   - **Partículas/estela**: burbujas de estela tras el batiscafo y un flash al recoger/golpear
     (reusar el patrón de partículas de Asteroids). Sin sprites ni loader.
   - **Render neón**: batiscafo, criaturas (formas simples: medusa, pez, roca) y burbujas con rects/
     arcos + glow; fondo con degradado de profundidad sutil; **sin** HUD ni overlays en canvas.
   - **`resize()`** con `devicePixelRatio`: mide `getBoundingClientRect()`, fija backing store físico,
     `setTransform(dpr,…)`, centra el mundo portrait 3:4 con **letterboxing** dentro de la CRT 4/3 y
     reescala posiciones proporcionalmente; velocidades en px/s absolutos.
   - **`emitState()`** con dedupe por clave `"score|lives|depth|phase"`; `force=true` en transiciones.
   - **Loop con pausa**: agenda siempre el siguiente rAF, **dibuja siempre**, `update` solo si
     `!paused`; `dt = Math.min((ts-last)/1000, 0.05)`.
   - **Handle completo**: `pause/resume` (flag + `emitState(true)`), `restart` (`lastTime=null`,
     re-init: batiscafo centrado, 3 vidas, score 0, profundidad 0, sin obstáculos),
     `forceGameOver` (guard `gameOverFired`, dispara `onGameOver` una vez), `resize`, `destroy`
     (cancela rAF + quita listeners de teclado).
   - **`GAME_KEYS`** (`ArrowLeft/Right/Up/Down`) con `preventDefault`; listeners en `window`,
     removidos en `destroy()`.
     _Test:_ `npm run lint` y `npm run build` sin errores; sin acceso a `document`/`window` en el import.

2. **Página cliente `page.tsx`.** Copiar `app/juego/asteroids/jugar/page.tsx` y ajustar: import de
   `./engine` (`createAbismo`), `id` `abismo`, HUD con **Profundidad** en el hueco de Nivel
   (Puntuación / Vidas / Profundidad), `router.push("/juego/abismo")` en SALIR, modal con
   `insertScore({ gameId: "abismo", playerName: name, score })`. `ResizeObserver` →
   `handle.resize()`; cleanup con `destroy()`. El canvas real ocupa `.crt-screen` (sin `.game-arena`
   decorativa ni `setInterval` falso). _Test:_ `/juego/abismo/jugar` carga, el batiscafo se mueve y
   los obstáculos suben, sin errores en consola; las flechas no scrollean; PAUSA congela/reanuda.

3. **Ficha fallback en `games.ts`.** Añadir la entrada `abismo` (valores del Data model). _Test:_
   `/biblioteca` muestra la card ABISMO; `/juego/abismo` renderiza el detalle; "JUGAR AHORA" apunta a
   `/juego/abismo/jugar`; `lint` pasa.

4. **Portada `cover-abismo`.** Invocar la skill **`/frontend-design`** para el arte y añadir la clase
   en `app/globals.css` (batiscafo + criatura + degradado de profundidad, acento cyan). Verificar
   `z-index`/`position` sobre `av-bg`/`av-noise`. _Test:_ card y detalle muestran arte propio.

5. **Supabase (migración).** `apply_migration add_game_abismo`: `insert` en `public.games` (mismos
   valores que el fallback, `play_href = /juego/abismo/jugar`, `sort_order` = máximo actual + 1) +
   seed de ~12 filas en `public.scores` generadas con `seededScores(105, 12)` (ver plantilla Node de
   la skill; `created_at` a medianoche UTC del `DD/MM/2026` de la semilla). `get_advisors` (security)
   sin hallazgos nuevos. _Test:_ `select count(*) from public.scores where game_id='abismo'` = 12;
   `select * from public.games where id='abismo'` = 1 fila.

6. **Verificación y cierre.** `npm run build`/`npm run lint` limpios; capturas Playwright
   (→ `.playwright-screenshots`) de biblioteca (card), detalle (portada), partida en curso (batiscafo
   - obstáculos + burbujas), estado PAUSA y modal de fin; jugar de verdad (esquivar, recoger burbujas,
     subir de tramo, perder las 3 vidas) y confirmar que la puntuación aparece en `/salon` de Abismo
     tras recargar. Verificar por **píxeles** (no solo DOM) que nada queda oculto tras `av-bg`/`av-noise`.

---

## Acceptance criteria

- [ ] `npm run build` y `npm run lint` terminan sin errores.
- [ ] No hay errores en consola al cargar `/juego/abismo/jugar` ni durante la partida.
- [ ] `/biblioteca` muestra una card **ABISMO** con portada `cover-abismo` propia; `/juego/abismo`
      renderiza el detalle con esa portada.
- [ ] En `/juego/abismo`, "JUGAR AHORA" navega a `/juego/abismo/jugar`.
- [ ] En `/juego/abismo/jugar`: el batiscafo se mueve con **← →** (horizontal) y **↑ ↓** (vertical
      acotado); los obstáculos suben simulando el descenso; chocar con un obstáculo resta una vida y
      da invulnerabilidad breve; recoger una burbuja suma **+250**; la profundidad aumenta y suma
      score.
- [ ] Cada tramo de profundidad **acelera** el descenso y aumenta la densidad de obstáculos (hasta las
      cotas `SCROLL_STEP`/`OBSTACLE_MIN_GAP_FLOOR`).
- [ ] Con 0 vidas se abre el modal "FIN DEL JUEGO" con la puntuación real (sin respawn).
- [ ] El HUD de plataforma muestra **Puntuación / Vidas / Profundidad** desde el estado real del
      motor; el canvas no dibuja HUD propio ni overlays.
- [ ] **PAUSA** congela y muestra "EN PAUSA"; **REANUDAR** continúa; **FIN** fuerza el fin; **SALIR**
      vuelve a `/juego/abismo`.
- [ ] Las flechas **no** hacen scroll de la página.
- [ ] Guardar en el modal inserta la fila con `game_id: "abismo"` y es visible en `/salon` tras
      recargar.
- [ ] "JUGAR DE NUEVO" reinicia limpio (score 0, 3 vidas, profundidad 0); "VOLVER AL VAULT" va a
      `/biblioteca`.
- [ ] Redimensionar la ventana no deforma el mundo portrait (se mantiene 3:4 centrado con
      letterboxing); el juego sigue jugable.
- [ ] Al desmontar la página se cancela el `requestAnimationFrame` y se quitan los listeners de
      teclado (sin fugas ni logs de "canvas null").
- [ ] Existe la fila `abismo` en `public.games` y ~12 filas en `public.scores`; `get_advisors`
      (security) no reporta tablas sin RLS.

---

## Decisions

- **Sí:** Ficha nueva `abismo` con identidad propia (como asteroids/tetris/arkanoid/snake). **No:**
  cablear el motor a otra ficha del catálogo.
- **Sí:** Ruta dedicada `/juego/abismo/jugar` + `playHref`. **No:** resolver el placeholder genérico
  `/jugar/[id]`.
- **Sí:** **Andamiar** el motor desde cero (no hay `game.js`), reusando la plantilla de Asteroids.
  **No:** portar un `game.js` inexistente.
- **Sí:** **Física continua px/s** con scroll de descenso simulado (obstáculos suben). **No:** tick de
  rejilla (eso es la mecánica de la variante hermana solo si se decidiera; aquí es continua).
- **Sí:** **Golpe con invulnerabilidad breve**, sin fase `dead`; `phase` = `playing|paused|gameover`.
  **No:** respawn con pausa tipo Asteroids.
- **Sí:** `GameState = { score, lives, depth, phase }` con HUD **Puntuación / Vidas / Profundidad**
  (Profundidad en el hueco de Nivel, como Tetris con "Líneas"). **No:** mostrar "Nivel" numérico.
- **Sí:** Mundo **portrait 480×640 (3:4)** centrado con **letterboxing** en la CRT 4/3. **No:**
  deformar el mundo al aspecto de la pantalla.
- **Sí:** Solo **burbujas** como recogible de puntos. **No:** power-ups (escudo, arpón, oxígeno) en
  este spec; se difieren.
- **Sí:** Render con **primitivas neón**, coherente con el resto. **No:** sprites de criaturas o del
  batiscafo.
- **Sí:** Color de card `cyan` (profundidad marina). **No:** reusar el color de otra ficha existente.
- **Sí:** Portada CSS propia **`cover-abismo`** vía `/frontend-design`. **No:** reusar portadas
  existentes.
- **Sí:** Guardado real con `insertScore({ gameId: "abismo" })` y seed `seededScores(105, 12)` para
  paridad BD↔fallback. **No:** `localStorage`.

---

## Risks

| Riesgo                                                                           | Mitigación                                                                                                                                |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| El motor accede a `document`/`window` en el import y rompe el build de servidor. | Módulo client-only; estado en closures; se instancia solo en `useEffect` de una página `"use client"`; el paso 1 lo verifica con `build`. |
| Deformación del mundo portrait 3:4 dentro de la CRT 4/3 o pérdida de nitidez.    | `resize()` centra con letterboxing, mantiene el aspecto y ajusta `devicePixelRatio`; verificado con capturas en el paso 6.                |
| Fuga de `requestAnimationFrame`/listeners de teclado al navegar fuera.           | `destroy()` cancela el rAF y quita los listeners; se llama en el cleanup del `useEffect`.                                                 |
| Las flechas hacen scroll de la página o roban foco.                              | `preventDefault` en `GAME_KEYS`; el foco se gestiona en la página; verificado en el paso 2.                                               |
| Dificultad injusta: spawns imposibles de esquivar al subir la presión.           | El intervalo de spawn tiene cota `OBSTACLE_MIN_GAP_FLOOR` y el hueco entre obstáculos garantiza un paso libre; se ajusta en el paso 6.    |
| Desincronización HUD↔motor (score/vidas/profundidad).                            | `emitState()` con dedupe por clave es la única fuente de verdad; el paso 2 lo comprueba jugando.                                          |
| `dt` desbocado al volver de una pestaña en segundo plano (spiral-of-death).      | Se conserva el cap `Math.min(dt, 0.05)`; PAUSA detiene `update` cuando procede.                                                           |
| Doble disparo de `onGameOver` (última vida + FIN a la vez).                      | Guard `gameOverFired`: `onGameOver` se dispara una sola vez por partida.                                                                  |
| Catálogo BD desincronizado del fallback `GAMES`.                                 | La migración copia los valores exactos de la ficha; el seed usa `seededScores(105, 12)`, misma semilla que el fallback.                   |
| Contenido oculto tras `av-bg`/`av-noise` por `z-index` mal portado.              | El paso 6 verifica **por píxeles** (no solo DOM) que HUD, canvas y modal quedan por encima del fondo.                                     |

---

## What is **not** in this spec

- Controles táctiles/móviles.
- Sonido/audio (motor, golpe, burbuja).
- Sprites de criaturas o del batiscafo.
- Power-ups (escudo, oxígeno extra, arpón), jefes de tramo, obstáculos destructibles.
- La mecánica de disparo (esa es la **variante B — sónar**, en `variante-b-sonar.md`).
- Cablear el juego a otra ficha del catálogo o unificarlas.
- `best` en vivo, `plays` real, dificultad configurable.
- Portar los demás juegos del catálogo.

Cada uno de esos, si se aborda, va en su propio spec.
