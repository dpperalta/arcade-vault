# SPEC (game-jam) — ABISMO · variante B (sónar)

> **Status:** Borrador
> **Tema del jam:** Océano profundo
> **Depends on:** SPEC 01 (HUD, CRT, modal, `.av-player`), SPEC 02 (Home/biblioteca), SPEC 05 (patrón motor+página de Asteroids), SPEC 06 (catálogo y leaderboard en Supabase)
> **Date:** 2026-07-22
> **Objective:** Andamiar un **shooter de defensa submarina** en un motor TypeScript client-only que corre en `/juego/abismo/jugar`: pilotas un batiscafo que dispara **pulsos de sónar** hacia arriba contra oleadas de criaturas que descienden del abismo, integrado con el HUD, el marco CRT y el guardado de puntuaciones, y publicado como ficha nueva `abismo` en el catálogo (BD + fallback).

---

## Section 1 — Por qué este spec

El patrón para integrar un juego de canvas real ya está establecido por SPEC 05 (Asteroids), SPEC 07
(Tetris), SPEC 08 (Arkanoid) y SPEC 09 (Snake), sobre la infraestructura de catálogo/leaderboard en
Supabase con fallback de SPEC 06. Este spec **aplica ese mismo patrón** a un juego temático de
"océano profundo" en modo **andamiar** (no existe `game.js` de referencia): se construye el motor
desde cero respetando la misma frontera motor headless ↔ chrome React. La mecánica —**cañón que se
mueve en horizontal y dispara hacia arriba contra oleadas en formación**— es un clásico de shooter de
una sola pantalla (tipo Invasores) con física continua px/s, reusando la plantilla viva de Asteroids.
Se decide una **identidad propia `abismo`**, sin colisionar con ninguna ficha del catálogo.

> **Variante:** esta es la **variante B (sónar / disparo, `SHOOTER`)** de ABISMO. La variante hermana
> **A (descenso / esquiva, `ARCADE`)** vive en `variante-a-descenso.md`. Ambas comparten tema, `slug`
> `abismo` y portada; se implementa **solo una**. Elige antes de pasar a `/spec-impl`.

---

## Scope

**In:**

- **Motor andamiado en TypeScript** (`app/juego/abismo/jugar/engine.ts`): mundo lógico **640×480**
  (aspecto 4:3), batiscafo-cañón que se mueve en **horizontal** por la banda inferior y **dispara
  pulsos de sónar hacia arriba**, **oleadas de criaturas** que bajan en formación y se aceleran/
  descienden con el tiempo (patrón Invasores), **colisión AABB** pulso↔criatura y criatura↔jugador,
  **3 vidas** (la criatura que alcanza la banda del jugador o lo toca resta vida), `score` por
  criatura (por tipo/fila), y **oleada nueva** al limpiar la formación con velocidad creciente.
  Cadencia de disparo limitada (cooldown). Render con **primitivas neón** (cañón, criaturas, pulsos,
  partículas de rotura). Client-only. Expone `createAbismo(canvas, { onState, onGameOver })` con
  `pause/resume/restart/forceGameOver/resize/destroy` y emite el estado a React.
- **Página cliente dedicada** `app/juego/abismo/jugar/page.tsx` (`"use client"`) que monta el
  `<canvas>` por `ref`, cablea el motor y reusa el chrome: **HUD** (Jugador / Puntuación / **Vidas** /
  **Oleada** + botones **PAUSA/FIN/SALIR**), **marco CRT** y **modal "FIN DEL JUEGO"** con input de
  nombre.
- **HUD alimentado por el motor**: Puntuación / Vidas / Oleada salen del `GameState` real; el canvas
  no dibuja HUD propio ni overlays.
- **Ficha `abismo` nueva** en `app/data/games.ts` (fallback) con `playHref: "/juego/abismo/jugar"` y
  `cover: "cover-abismo"`.
- **Portada CSS `cover-abismo`** en `app/globals.css`, arte pixel/neón propio (cañón + oleada de
  criaturas + pulso de sónar, acento magenta).
- **Supabase**: fila `abismo` en `public.games` (mismos valores que el fallback, `sort_order` =
  máximo actual + 1) y **~12 filas sembradas** en `public.scores` con `seededScores(105, 12)` para
  paridad BD↔fallback.
- **Guardado real** al game over vía `insertScore({ gameId: "abismo", playerName, score })`.
- **Control por la plataforma**: **PAUSA** congela `update`/`draw` y muestra "EN PAUSA"; **FIN**
  fuerza el game over; **SALIR** vuelve a `/juego/abismo`.
- **Controles**: **← →** (mover el cañón) y **Espacio** (disparar sónar), con `preventDefault` en
  flechas y Espacio para no scrollear.
- **Mundo responsive**: el área 640×480 (aspecto 4:3) encaja en la pantalla CRT; `resize()` re-mide,
  reescala posiciones proporcionalmente y ajusta `devicePixelRatio`.

**Out of scope (specs futuros):**

- Controles táctiles/móviles.
- Sonido/audio (disparo, rotura, alarma).
- **Sprites** de criaturas o del cañón (todo con primitivas).
- Escudos/búnkeres destructibles, criaturas que disparan de vuelta, jefes de oleada.
- Power-ups (disparo múltiple, cadencia rápida): sin ítems en este spec.
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
  short: "Defiende las profundidades disparando sónar a las oleadas del abismo.",
  long: "Un shooter de defensa submarina, real y jugable: mueve tu batiscafo-cañón por el lecho marino y dispara pulsos de sónar hacia arriba para reventar oleadas de criaturas que descienden en formación desde la oscuridad. Cada oleada baja más rápido; tienes 3 vidas antes de que el abismo te engulla.",
  cat: "SHOOTER",
  cover: "cover-abismo",
  color: "magenta",
  best: 33600,
  plays: "0",
  playHref: "/juego/abismo/jugar",
}
```

La fila de `public.games` replica **exactamente** estos valores (con `play_href` snake_case y
`sort_order` = máximo actual + 1). El seed de `public.scores` para `game_id = "abismo"` se genera con
`seededScores("abismo".length * 17 + 3, 12)` = `seededScores(105, 12)` para que BD y fallback
coincidan.

> **Nota de convivencia de variantes:** ambas variantes usan el mismo `slug` `abismo` y la misma
> semilla de seed; **solo se implementa una**, así que no hay dos filas `abismo` en la BD. La `cat` y
> el `color` difieren (`ARCADE`/`cyan` en A, `SHOOTER`/`magenta` en B): al elegir la variante se toma
> su ficha completa.

### 2. Contrato del motor (`app/juego/abismo/jugar/engine.ts`)

```ts
// Fases: "playing" activo, "paused" congelado, "gameover" fin.
// No hay fase "dead": al perder vida se re-sirve la oleada actual sin pausa; a 0 vidas → gameover.
export type GamePhase = "playing" | "paused" | "gameover";

export interface GameState {
  score: number; // suma por criatura destruida (según fila/tipo)
  lives: number; // inicia en 3
  wave: number; // oleada actual (1..). Ocupa el hueco de "Nivel" en el HUD
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

- El motor es la **fuente de verdad** de score/vidas/oleada; React refleja (`onState`) y persiste al
  final (`onGameOver`).
- El HUD de plataforma muestra **Puntuación / Vidas / Oleada** (Oleada ocupa el hueco de "Nivel").
  `emitState()` usa dedupe por clave `"score|lives|wave|phase"`.
- **Pérdida de vida directa**: si una criatura toca al jugador o cruza su banda inferior, `lives--` +
  invulnerabilidad breve; si `lives === 0` → `phase = "gameover"` + `onGameOver(score)` una sola vez
  (guard `gameOverFired`). No hay respawn con pausa ni fase `dead`.
- **Oleada = fin cíclico**: al destruir toda la formación se genera una **oleada nueva** más rápida
  (no hay pantalla de victoria; el bucle continúa hasta perder las 3 vidas).
- El nombre de guardado sigue la lógica del placeholder: `nameEdit ?? user?.name ?? "INVITADO"`,
  mayúsculas, máx. 10.

### 3. Constantes del motor (andamiadas, mundo lógico 640×480)

```ts
((WORLD_W = 640), (WORLD_H = 480)); // 4:3
CANNON = { w: 44, h: 22, y: 440 }; // batiscafo-cañón en la banda inferior
CANNON_SPEED = 340; // px/s (horizontal, teclado)
PULSE = { w: 4, h: 14, vy: -520 }; // pulso de sónar (hacia arriba)
FIRE_COOLDOWN = 0.28; // s entre disparos
((FORMATION_COLS = 8), (FORMATION_ROWS = 4)); // 32 criaturas por oleada
CREATURE = { w: 34, h: 24 }; // AABB de criatura
FORMATION_ORIGIN = { x: 60, y: 60 }; // esquina superior-izq de la formación
FORMATION_GAP = { x: 20, y: 16 }; // separación entre criaturas
BASE_FORMATION_VX = 60; // px/s lateral de la formación (oleada 1)
FORMATION_VX_STEP = 14; // +px/s lateral por oleada
FORMATION_DROP = 20; // px que baja la formación al tocar un borde
LIVES = 3;
INVULN_TIME = 1.0; // s de invulnerabilidad tras perder vida
ROW_POINTS = [40, 30, 20, 10]; // score por fila (arriba vale más)
```

**Modelo de movimiento (clave del andamiaje):** física **continua px/s** como Asteroids/Arkanoid. La
formación se desplaza lateralmente a `formationVx(wave)`; al tocar un borde, invierte el sentido y
**baja** `FORMATION_DROP`. El cañón se mueve en X y dispara pulsos hacia arriba con `FIRE_COOLDOWN`.
`update(dt)` mueve cañón, pulsos y formación; resuelve colisiones AABB (pulso↔criatura = destruir +
`ROW_POINTS`; criatura↔cañón o criatura cruza `CANNON.y` = perder vida); al vaciar la formación,
`wave++`, reconstruye la formación y aumenta `formationVx` (`BASE_FORMATION_VX + (wave-1)*STEP`).
`draw` cada frame. Emite partículas de rotura al destruir (reusar el patrón de Asteroids).

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
   - **`World` en vez de globales**: `{ W, H, ctx, keys }`; estado (`cannon`, `pulses[]`,
     `creatures[]`, `particles[]`, `lives`, `score`, `wave`, `formationVx`, `formationDir`,
     `fireTimer`, `invulnT`) en **closures** dentro de `createAbismo` (nada a nivel de módulo;
     SSR-safe).
   - **Física 1:1 del diseño**: movimiento del cañón (teclado, acotado a bordes X), disparo con
     `fireTimer`/`FIRE_COOLDOWN`, movimiento lateral de la formación con rebote+bajada en bordes,
     colisiones AABB (pulso destruye criatura y suma `ROW_POINTS`; criatura toca/rebasa al jugador →
     perder vida con invulnerabilidad), reconstrucción de oleada al vaciar la formación (más rápida),
     `gameover` a 0 vidas.
   - **Partículas/flash**: al destruir una criatura, emitir un puñado de partículas de su color que
     decaen en ~0.3 s (reusar el patrón de partículas de Asteroids). Sin sprites ni loader.
   - **Render neón**: cañón, criaturas (formas simples por fila: medusa, pez, calamar, raya) y pulsos
     con rects/arcos + glow; fondo con degradado de profundidad sutil; **sin** HUD ni overlays en
     canvas.
   - **`resize()`** con `devicePixelRatio`: mide `getBoundingClientRect()`, fija backing store físico,
     `setTransform(dpr,…)`, mantiene el aspecto 4:3 y reescala posiciones proporcionalmente;
     velocidades en px/s absolutos.
   - **`emitState()`** con dedupe por clave `"score|lives|wave|phase"`; `force=true` en transiciones.
   - **Loop con pausa**: agenda siempre el siguiente rAF, **dibuja siempre**, `update` solo si
     `!paused`; `dt = Math.min((ts-last)/1000, 0.05)`.
   - **Handle completo**: `pause/resume` (flag + `emitState(true)`), `restart` (`lastTime=null`,
     re-init: cañón centrado, 3 vidas, score 0, oleada 1, primera formación),
     `forceGameOver` (guard `gameOverFired`, dispara `onGameOver` una vez), `resize`, `destroy`
     (cancela rAF + quita listeners de teclado).
   - **`GAME_KEYS`** (`ArrowLeft/Right`, `Space`) con `preventDefault`; listeners en `window`,
     removidos en `destroy()`.
     _Test:_ `npm run lint` y `npm run build` sin errores; sin acceso a `document`/`window` en el import.

2. **Página cliente `page.tsx`.** Copiar `app/juego/asteroids/jugar/page.tsx` y ajustar: import de
   `./engine` (`createAbismo`), `id` `abismo`, HUD con **Oleada** en el hueco de Nivel (Puntuación /
   Vidas / Oleada), `router.push("/juego/abismo")` en SALIR, modal con
   `insertScore({ gameId: "abismo", playerName: name, score })`. `ResizeObserver` → `handle.resize()`;
   cleanup con `destroy()`. El canvas real ocupa `.crt-screen` (sin `.game-arena` decorativa ni
   `setInterval` falso). _Test:_ `/juego/abismo/jugar` carga, el cañón dispara y la formación baja,
   sin errores en consola; flechas/Espacio no scrollean; PAUSA congela/reanuda.

3. **Ficha fallback en `games.ts`.** Añadir la entrada `abismo` (valores del Data model). _Test:_
   `/biblioteca` muestra la card ABISMO; `/juego/abismo` renderiza el detalle; "JUGAR AHORA" apunta a
   `/juego/abismo/jugar`; `lint` pasa.

4. **Portada `cover-abismo`.** Invocar la skill **`/frontend-design`** para el arte y añadir la clase
   en `app/globals.css` (cañón + oleada + pulso de sónar, acento magenta). Verificar
   `z-index`/`position` sobre `av-bg`/`av-noise`. _Test:_ card y detalle muestran arte propio.

5. **Supabase (migración).** `apply_migration add_game_abismo`: `insert` en `public.games` (mismos
   valores que el fallback, `play_href = /juego/abismo/jugar`, `sort_order` = máximo actual + 1) +
   seed de ~12 filas en `public.scores` generadas con `seededScores(105, 12)` (ver plantilla Node de
   la skill; `created_at` a medianoche UTC del `DD/MM/2026` de la semilla). `get_advisors` (security)
   sin hallazgos nuevos. _Test:_ `select count(*) from public.scores where game_id='abismo'` = 12;
   `select * from public.games where id='abismo'` = 1 fila.

6. **Verificación y cierre.** `npm run build`/`npm run lint` limpios; capturas Playwright
   (→ `.playwright-screenshots`) de biblioteca (card), detalle (portada), partida en curso (cañón +
   oleada + pulsos), estado PAUSA y modal de fin; jugar de verdad (destruir la formación, subir de
   oleada, perder las 3 vidas) y confirmar que la puntuación aparece en `/salon` de Abismo tras
   recargar. Verificar por **píxeles** (no solo DOM) que nada queda oculto tras `av-bg`/`av-noise`.

---

## Acceptance criteria

- [ ] `npm run build` y `npm run lint` terminan sin errores.
- [ ] No hay errores en consola al cargar `/juego/abismo/jugar` ni durante la partida.
- [ ] `/biblioteca` muestra una card **ABISMO** con portada `cover-abismo` propia; `/juego/abismo`
      renderiza el detalle con esa portada.
- [ ] En `/juego/abismo`, "JUGAR AHORA" navega a `/juego/abismo/jugar`.
- [ ] En `/juego/abismo/jugar`: el cañón se mueve con **← →** y dispara con **Espacio** (con
      cooldown); la formación de criaturas se desplaza en lateral, rebota y baja en los bordes;
      un pulso que impacta destruye la criatura y suma según su fila (`ROW_POINTS`) con partículas.
- [ ] Al vaciar la formación aparece una **oleada nueva** más rápida (bucle, sin pantalla de
      victoria).
- [ ] Si una criatura toca al jugador o cruza su banda, se resta una vida (con invulnerabilidad
      breve); con 0 vidas se abre el modal "FIN DEL JUEGO" con la puntuación real.
- [ ] El HUD de plataforma muestra **Puntuación / Vidas / Oleada** desde el estado real del motor; el
      canvas no dibuja HUD propio ni overlays.
- [ ] **PAUSA** congela y muestra "EN PAUSA"; **REANUDAR** continúa; **FIN** fuerza el fin; **SALIR**
      vuelve a `/juego/abismo`.
- [ ] Las flechas y Espacio **no** hacen scroll de la página.
- [ ] Guardar en el modal inserta la fila con `game_id: "abismo"` y es visible en `/salon` tras
      recargar.
- [ ] "JUGAR DE NUEVO" reinicia limpio (score 0, 3 vidas, oleada 1); "VOLVER AL VAULT" va a
      `/biblioteca`.
- [ ] Redimensionar la ventana no deforma el mundo 4:3; el juego sigue jugable.
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
- **Sí:** **Shooter de formación** (patrón Invasores) con física continua px/s. **No:** la mecánica de
  esquiva de la variante A (esa es `variante-a-descenso.md`).
- **Sí:** **Oleadas en bucle** con velocidad creciente; oleada = fin cíclico. **No:** pantalla de
  victoria ni límite de oleadas.
- **Sí:** **Pérdida de vida directa** con invulnerabilidad breve, sin fase `dead`; `phase` =
  `playing|paused|gameover`. **No:** respawn con pausa tipo Asteroids.
- **Sí:** `GameState = { score, lives, wave, phase }` con HUD **Puntuación / Vidas / Oleada** (Oleada
  en el hueco de Nivel). **No:** mostrar "Nivel" genérico ni "Profundidad" (eso es la variante A).
- **Sí:** Mundo **640×480 (4:3)** que encaja en la CRT sin letterboxing. **No:** portrait con
  letterboxing (eso es la variante A).
- **Sí:** Disparo con **cooldown** (`FIRE_COOLDOWN`). **No:** disparo ilimitado por frame.
- **Sí:** Render con **primitivas neón**, coherente con el resto. **No:** sprites de criaturas o del
  cañón.
- **Sí:** Color de card `magenta` (contraste sónar). **No:** reusar el `cyan` de la variante A ni el
  color de otra ficha.
- **Sí:** Portada CSS propia **`cover-abismo`** vía `/frontend-design`. **No:** reusar portadas
  existentes.
- **Sí:** Guardado real con `insertScore({ gameId: "abismo" })` y seed `seededScores(105, 12)` para
  paridad BD↔fallback. **No:** `localStorage`.

---

## Risks

| Riesgo                                                                           | Mitigación                                                                                                                                |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| El motor accede a `document`/`window` en el import y rompe el build de servidor. | Módulo client-only; estado en closures; se instancia solo en `useEffect` de una página `"use client"`; el paso 1 lo verifica con `build`. |
| Fuga de `requestAnimationFrame`/listeners de teclado al navegar fuera.           | `destroy()` cancela el rAF y quita los listeners; se llama en el cleanup del `useEffect`.                                                 |
| Las flechas/Espacio hacen scroll de la página o roban foco.                      | `preventDefault` en `GAME_KEYS`; el foco se gestiona en la página; verificado en el paso 2.                                               |
| Formación imposible: baja demasiado rápido tras varias oleadas.                  | `FORMATION_VX_STEP` acotado y `FORMATION_DROP` moderado; se ajusta el ritmo en el paso 6 jugando de verdad.                               |
| Disparo demasiado ágil o inútil (cooldown mal calibrado).                        | `FIRE_COOLDOWN` como constante única; verificado en el paso 2/6.                                                                          |
| Desincronización HUD↔motor (score/vidas/oleada).                                 | `emitState()` con dedupe por clave es la única fuente de verdad; el paso 2 lo comprueba jugando.                                          |
| `dt` desbocado al volver de una pestaña en segundo plano (spiral-of-death).      | Se conserva el cap `Math.min(dt, 0.05)`; PAUSA detiene `update` cuando procede.                                                           |
| Doble disparo de `onGameOver` (última vida + FIN a la vez).                      | Guard `gameOverFired`: `onGameOver` se dispara una sola vez por partida.                                                                  |
| Deformación del área 4:3 o pérdida de nitidez dentro de la pantalla CRT.         | `resize()` re-mide, mantiene el aspecto y ajusta `devicePixelRatio`; verificado con capturas en el paso 6.                                |
| Catálogo BD desincronizado del fallback `GAMES`.                                 | La migración copia los valores exactos de la ficha; el seed usa `seededScores(105, 12)`, misma semilla que el fallback.                   |
| Contenido oculto tras `av-bg`/`av-noise` por `z-index` mal portado.              | El paso 6 verifica **por píxeles** (no solo DOM) que HUD, canvas y modal quedan por encima del fondo.                                     |

---

## What is **not** in this spec

- Controles táctiles/móviles.
- Sonido/audio (disparo, rotura, alarma).
- Sprites de criaturas o del cañón.
- Escudos/búnkeres destructibles, criaturas que disparan de vuelta, jefes de oleada, power-ups.
- La mecánica de esquiva/descenso (esa es la **variante A**, en `variante-a-descenso.md`).
- Cablear el juego a otra ficha del catálogo o unificarlas.
- `best` en vivo, `plays` real, dificultad configurable.
- Portar los demás juegos del catálogo.

Cada uno de esos, si se aborda, va en su propio spec.
