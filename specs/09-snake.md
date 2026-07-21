# SPEC 09 — Juego Snake en canvas real

> **Status:** Aprobado
> **Depends on:** SPEC 01 (HUD, CRT, modal, `.av-player`), SPEC 02 (Home/biblioteca), SPEC 05 (patrón motor+página de Asteroids), SPEC 06 (catálogo y leaderboard en Supabase)
> **Date:** 2026-07-20
> **Objective:** Andamiar un Snake en un motor TypeScript client-only que corre en `/juego/snake/jugar`, con la comida dibujada a partir del spritesheet de frutas (`references/source-assets/fruits.png`), integrado con el HUD, el marco CRT y el guardado de puntuaciones, y publicarlo como ficha nueva `snake` en el catálogo (BD + fallback) conviviendo con el mock `serpentina`.

---

## Section 1 — Por qué este spec

El patrón para integrar un juego de canvas real ya está establecido por SPEC 05 (Asteroids), SPEC 07
(Tetris) y SPEC 08 (Arkanoid), sobre la infraestructura de catálogo/leaderboard en Supabase con
fallback de SPEC 06. Este spec **aplica ese mismo patrón** a Snake, pero en modo **andamiar** (no
existe `game.js` de referencia): se construye el motor desde cero respetando la misma frontera motor
headless ↔ chrome React. La única novedad frente a los anteriores es que **la comida usa sprites
reales** del atlas de frutas en vez de primitivas. Se decide una **identidad propia `snake`** (como
`asteroids`↔`rocas`, `tetris`↔`caida`, `arkanoid`↔`bloque-buster`), dejando el mock `serpentina`
intacto.

---

## Scope

**In:**

- **Motor andamiado en TypeScript** (`app/juego/snake/jugar/engine.ts`): tablero de rejilla **24×18**,
  serpiente como lista de celdas con avance por **tick** (paso discreto, no física por píxel), giro
  discreto con buffer que **ignora la reversa de 180°**, crecimiento +1 al comer, **muerte al chocar
  con el borde o consigo misma**, `score += 10` por fruta, **subida de nivel cada 5 frutas** que
  **acelera el tick**, y comida colocada en una celda libre aleatoria. Render con **primitivas neón**
  para la serpiente (segmentos redondeados cyan + cabeza con ojos) y **sprite de fruta** para la comida
  (recorte aleatorio del atlas). Client-only. Expone `createSnake(canvas, { onState, onGameOver })` con
  `pause/resume/restart/forceGameOver/resize/destroy` y emite el estado a React.
- **Carga del spritesheet de frutas**: se copia `references/source-assets/fruits.png` a
  `public/snake-assets/fruits.png`; el motor lo carga con `new Image()` y dibuja el recorte con las
  coordenadas del atlas (portadas desde `references/source-assets/sprites.js` como constante TS).
  **Fallback de render**: si la imagen aún no cargó o falla, la comida se dibuja como un círculo neón
  para no bloquear el juego.
- **Página cliente dedicada** `app/juego/snake/jugar/page.tsx` (`"use client"`) que monta el `<canvas>`
  por `ref`, cablea el motor y reusa el chrome: **HUD** (Jugador / Puntuación / **Longitud** / Nivel +
  botones **PAUSA/FIN/SALIR**), **marco CRT** y **modal "FIN DEL JUEGO"** con input de nombre.
- **HUD alimentado por el motor**: Puntuación / **Longitud** / Nivel salen del `GameState` real; el
  canvas no dibuja HUD propio ni overlays.
- **Ficha `snake` nueva** en `app/data/games.ts` (fallback) con `playHref: "/juego/snake/jugar"` y
  `cover: "cover-snake-fruit"`. Convive con el mock `serpentina` (no se toca).
- **Portada CSS `cover-snake-fruit`** en `app/globals.css`, arte pixel/neón propio (serpiente + fruta,
  acento cyan) distinto de `cover-snake` (el del mock `serpentina`).
- **Supabase**: fila `snake` en `public.games` (mismos valores que el fallback, `sort_order` = 11) y
  **~12 filas sembradas** en `public.scores` con `seededScores(88, 12)` para paridad BD↔fallback.
- **Guardado real** al game over vía `insertScore({ gameId: "snake", playerName, score })`.
- **Control por la plataforma**: **PAUSA** congela `update`/`draw` y muestra "EN PAUSA"; **FIN** fuerza
  el game over; **SALIR** vuelve a `/juego/snake`.
- **Controles**: **← → ↑ ↓** y **WASD** (mover), con `preventDefault` en las flechas para no scrollear.
- **Mundo responsive**: la rejilla 24×18 (4:3) encaja en la pantalla CRT; `resize()` re-mide, recalcula
  el tamaño de celda y ajusta `devicePixelRatio`.

**Out of scope (specs futuros):**

- Controles táctiles/móviles (gestos de deslizamiento).
- Sonido/audio (comer, morir).
- **Frutas con puntos variables o efectos especiales** (acortar, acelerar, etc.): en este spec toda
  fruta es cosmética y vale lo mismo.
- **Paredes envolventes (toroidales)**: se muere en el borde.
- Obstáculos/muros internos, niveles con layout, bonus temporizados.
- Portar sprites de la propia serpiente (solo hay sprites de frutas): la serpiente se dibuja con
  primitivas.
- Cablear el juego a la ficha `serpentina` o unificarlas.
- `best` en vivo, `plays` real, dificultad configurable.
- Portar los demás juegos del catálogo.

---

## Data model

Esta feature **no introduce estructuras nuevas de datos de plataforma**: reusa el tipo `Game` (con
`playHref`, ya existente), las tablas `games`/`scores` de SPEC 06 e `insertScore`. Introduce **una
ficha de catálogo**, **una fila de BD + seed**, **un asset estático** (el spritesheet) y el **contrato
interno del motor**.

### 1. Ficha en `GAMES` (`app/data/games.ts`) y fila en `public.games`

```ts
{
  id: "snake",
  title: "SNAKE",
  short: "Crece comiendo fruta sin morderte la cola ni chocar.",
  long: "El clásico de la serpiente, real y jugable: guía una serpiente de neón por una rejilla de 24×18, devora fruta para crecer y sube de nivel cada 5 piezas mientras el ritmo se acelera sin piedad. Un choque con el muro o con tu propia cola y se acabó.",
  cat: "ARCADE",
  cover: "cover-snake-fruit",
  color: "cyan",
  best: 12500,
  plays: "0",
  playHref: "/juego/snake/jugar",
}
```

La fila de `public.games` replica **exactamente** estos valores (con `play_href` snake_case y
`sort_order` = 11, máximo actual 10 + 1). El seed de `public.scores` para `game_id = "snake"` se genera
con `seededScores("snake".length * 17 + 3, 12)` = `seededScores(88, 12)` para que BD y fallback
coincidan.

### 2. Asset estático — spritesheet de frutas

- Se copia `references/source-assets/fruits.png` → **`public/snake-assets/fruits.png`** (Next 16 sirve
  `public/` en la raíz de la URL; el motor lo carga desde `/snake-assets/fruits.png`).
- Las coordenadas del atlas de `references/source-assets/sprites.js` se portan a una **constante TS**
  dentro del motor (o un `atlas.ts` junto a él). Estructura de cada recorte: `{ x, y, w, h }` en la hoja
  original (3790×442, fondo transparente, fila usada `y = 136`, alto 160). Son **22 frutas** (`banana`,
  `orange`, `grape`, … `melon`).
- Al comer, la fruta mostrada se elige **al azar** entre las 22 entradas (cosmético). Se dibuja con
  `ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)` encajando el sprite en la celda, preservando su
  relación de aspecto (las frutas tienen anchos distintos, 110–170 px).

### 3. Contrato del motor (`app/juego/snake/jugar/engine.ts`)

```ts
// Fases: "playing" activo, "paused" congelado, "gameover" fin.
// No hay fase "dead": Snake tiene una sola vida; al chocar → gameover directo.
export type GamePhase = "playing" | "paused" | "gameover";

export interface GameState {
  score: number; // frutas comidas × 10
  length: number; // longitud actual de la serpiente (celdas). Ocupa el hueco de "Vidas" en el HUD
  level: number; // ⌊frutas / 5⌋ + 1; controla la velocidad del tick
  phase: GamePhase;
}

export interface SnakeHandle {
  pause(): void;
  resume(): void;
  restart(): void;
  forceGameOver(): void; // botón FIN
  resize(): void; // re-mide el contenedor y recalcula el tamaño de celda
  destroy(): void; // cancela el rAF y quita listeners de teclado
}

export function createSnake(
  canvas: HTMLCanvasElement,
  opts: {
    onState: (s: GameState) => void; // alimenta el HUD React
    onGameOver: (finalScore: number) => void; // abre el modal
  },
): SnakeHandle;
```

**Convenciones:**

- El motor es la **fuente de verdad** de score/longitud/nivel; React refleja (`onState`) y persiste al
  final (`onGameOver`).
- Snake **no tiene vidas**: el HUD de plataforma muestra **Puntuación / Longitud / Nivel** (Longitud
  sustituye al hueco de "Vidas", como Tetris sustituyó por "Líneas"). `emitState()` usa dedupe por clave
  `"score|length|level|phase"`.
- **Una sola vida = fin directo**: al chocar con el borde o con un segmento propio → `phase =
"gameover"` + `onGameOver(score)` (una sola vez, guard `gameOverFired`). No hay respawn ni fase `dead`.
- El nombre de guardado sigue la lógica del placeholder: `nameEdit ?? user?.name ?? "INVITADO"`,
  mayúsculas, máx. 10.

### 4. Constantes del motor (andamiadas, mundo lógico 24×18 celdas)

```ts
((GRID_COLS = 24), (GRID_ROWS = 18)); // rejilla 4:3
START_LEN = 3; // longitud inicial (centro, avanzando a la derecha)
POINTS_PER_FRUIT = 10; // score por fruta
FRUITS_PER_LEVEL = 5; // ⌊frutas/5⌋ + 1 = nivel
BASE_TICK = 0.14; // s/paso en nivel 1 (~7 pasos/s)
TICK_STEP = 0.012; // s que se resta por nivel (acelera)
MIN_TICK = 0.05; // cota inferior del intervalo de tick
// Tamaño de celda = min(cssW/24, cssH/18); el tablero se centra en el canvas.
```

**Modelo de movimiento (clave del andamiaje):** a diferencia de Asteroids/Arkanoid (física continua
px/s), Snake avanza por **pasos discretos de rejilla**. El loop acumula `dt` y, cuando el acumulador
supera `tickInterval(level)`, hace **un** paso: aplica la dirección buffereada (ignorando la reversa de
180°), calcula la nueva celda de cabeza, detecta colisión (borde/cola), come si la celda tiene fruta
(crece + recoloca fruta + `score`/`level`) y desplaza el cuerpo. `draw` se ejecuta cada frame (se pinta
por celdas; la interpolación entre celdas queda fuera de alcance). El `tickInterval` se recalcula al
subir de nivel: `max(BASE_TICK - (level-1)*TICK_STEP, MIN_TICK)`.

---

## Implementation plan

Cada paso deja el sistema compilando y navegable. (Se corresponden con las Fases 3–8 de la skill
`/nuevo-juego`.) **Restricción Next.js 16:** antes de tocar código de Next (App Router, `"use client"`,
`use(params)`) leer `node_modules/next/dist/docs/`. **Restricción client-only:** el motor no accede a
`document`/`window` en el import; se instancia solo dentro de `useEffect` de una página `"use client"`.

1. **Asset del spritesheet.** Copiar `references/source-assets/fruits.png` →
   `public/snake-assets/fruits.png`. Portar las coordenadas de `references/source-assets/sprites.js` a
   una constante TS (`FRUIT_ATLAS`) que usará el motor. _Test:_ el archivo existe en
   `public/snake-assets/`; se sirve en `http://localhost:3000/snake-assets/fruits.png`.

2. **Motor `engine.ts` (andamiado).** Crear `app/juego/snake/jugar/engine.ts` en TypeScript estricto
   usando `app/juego/asteroids/jugar/engine.ts` como **plantilla viva** del patrón, pero con
   **movimiento por tick de rejilla** (no física px/s):
   - **Contrato público arriba** (`GamePhase`, `GameState`, `SnakeHandle`, opciones, `createSnake`).
   - **`World` en vez de globales**: `{ W, H, cell, cols, rows, ctx }`; estado (`snake: Cell[]`, `dir`,
     `nextDir`, `food: Cell`, `fruitKey`, `score`, `fruitsEaten`, `level`, `accum`, `tickInterval`) en
     **closures** dentro de `createSnake` (nada a nivel de módulo; SSR-safe).
   - **Lógica 1 paso/tick**: acumular `dt`; al superar `tickInterval` aplicar `nextDir` (ignorando la
     reversa de 180°), calcular la celda de cabeza, **detectar colisión** con borde y con el cuerpo →
     `gameover`; si la cabeza cae en la celda de comida: crecer (no quitar la cola ese paso),
     `score += 10`, `fruitsEaten++`, recolocar la fruta en una **celda libre aleatoria**, elegir
     **fruta aleatoria** del atlas, recalcular `level`/`tickInterval`; en caso normal, avanzar y
     descartar la cola.
   - **Carga de imagen con fallback**: `const img = new Image(); img.src = "/snake-assets/fruits.png";`
     con flag `imgReady`. `drawFood()` usa `drawImage` con el recorte del atlas si `imgReady`; si no,
     dibuja un **círculo neón** en la celda.
   - **Render neón**: serpiente como segmentos redondeados con glow **cyan**, cabeza marcada (ojos)
     según `dir`; fondo/rejilla sutil; **sin** HUD ni overlays en canvas.
   - **`resize()`** con `devicePixelRatio`: mide `getBoundingClientRect()`, fija backing store físico,
     `setTransform(dpr,…)`; recalcula `cell = min(cssW/cols, cssH/rows)` y **centra** el tablero
     (offset). Las posiciones son celdas lógicas (no se reescalan), solo cambia el tamaño de dibujo.
   - **`emitState()`** con dedupe por clave `"score|length|level|phase"`; `force=true` en transiciones
     (pausa, game over, restart).
   - **Loop con pausa**: agenda siempre el siguiente rAF, **dibuja siempre**, acumula/avanza `update`
     solo si `!paused`; `dt = Math.min((ts-last)/1000, 0.05)`.
   - **Handle completo**: `pause/resume` (flag + `emitState(true)`), `restart` (`lastTime=null`,
     re-init: serpiente de `START_LEN` en el centro hacia la derecha, score 0, nivel 1, primera fruta),
     `forceGameOver` (guard `gameOverFired`, dispara `onGameOver` una vez), `resize`, `destroy` (cancela
     rAF + quita listeners de teclado).
   - **`GAME_KEYS`** (`ArrowLeft/Right/Up/Down` + `w/a/s/d`) que fijan `nextDir`; `preventDefault` en
     las flechas. Listeners en `window`, removidos en `destroy()`.
     _Test:_ `npm run lint` y `npm run build` sin errores; sin acceso a `document`/`window` en el import.

3. **Página cliente `page.tsx`.** Copiar `app/juego/asteroids/jugar/page.tsx` y ajustar: import de
   `./engine` (`createSnake`), `id` `snake`, HUD con **Longitud** en el hueco de Vidas (Puntuación /
   Longitud / Nivel), `router.push("/juego/snake")` en SALIR, modal con
   `insertScore({ gameId: "snake", playerName: name, score })`. `ResizeObserver` → `handle.resize()`;
   cleanup con `destroy()`. El canvas real ocupa `.crt-screen` (sin la `.game-arena` decorativa ni
   `setInterval` falso). _Test:_ `/juego/snake/jugar` carga, se ve la serpiente moviéndose y una fruta,
   sin errores en consola; las flechas no scrollean; WASD y flechas giran; PAUSA congela/reanuda.

4. **Ficha fallback en `games.ts`.** Añadir la entrada `snake` (valores del Data model). _Test:_
   `/biblioteca` muestra la card SNAKE; `/juego/snake` renderiza el detalle; "JUGAR AHORA" apunta a
   `/juego/snake/jugar`; el mock `serpentina` sigue intacto; `lint` pasa.

5. **Portada `cover-snake-fruit`.** Invocar la skill **`/frontend-design`** para el arte y añadir la
   clase en `app/globals.css` (serpiente de neón cyan + una fruta), distinta de `cover-snake`
   (serpentina). Verificar `z-index`/`position` sobre `av-bg`/`av-noise`. _Test:_ card y detalle
   muestran arte propio.

6. **Supabase (migración).** `apply_migration add_game_snake`: `insert` en `public.games` (mismos
   valores que el fallback, `play_href = /juego/snake/jugar`, `sort_order` = 11) + seed de ~12 filas en
   `public.scores` generadas con `seededScores(88, 12)` (ver plantilla Node de la skill; `created_at` a
   medianoche UTC del `DD/MM/2026` de la semilla). `get_advisors` (security) sin hallazgos nuevos.
   _Test:_ `select count(*) from public.scores where game_id='snake'` = 12;
   `select * from public.games where id='snake'` = 1 fila con `sort_order` 11.

7. **Verificación y cierre.** `npm run build`/`npm run lint` limpios; capturas Playwright
   (→ `.playwright-screenshots`) de biblioteca (card), detalle (portada), partida en curso (serpiente +
   fruta con sprite), estado PAUSA y modal de fin; jugar de verdad (comer varias frutas, crecer, subir
   de nivel, morir en el borde y en la cola) y confirmar que la puntuación aparece en `/salon` de Snake
   tras recargar. Verificar por **píxeles** (no solo DOM) que nada queda oculto tras `av-bg`/`av-noise`
   y que el sprite de fruta se pinta (no solo el fallback).

---

## Acceptance criteria

- [ ] `npm run build` y `npm run lint` terminan sin errores.
- [ ] No hay errores en consola al cargar `/juego/snake/jugar` ni durante la partida.
- [ ] `public/snake-assets/fruits.png` existe y se sirve; el motor lo carga y dibuja el **sprite de
      fruta** como comida (no solo el círculo de fallback).
- [ ] `/biblioteca` muestra una card **SNAKE** con portada `cover-snake-fruit` propia (distinta de
      `cover-snake` del mock `serpentina`); `/juego/snake` renderiza el detalle con esa portada.
- [ ] En `/juego/snake`, "JUGAR AHORA" navega a `/juego/snake/jugar`; el mock `serpentina` y su ruta
      siguen intactos.
- [ ] En `/juego/snake/jugar`: la serpiente se mueve por la rejilla 24×18 avanzando por tick; gira con
      **← → ↑ ↓** y con **WASD**; la reversa de 180° se ignora; comer una fruta suma **+10**, crece +1 y
      recoloca una fruta nueva (sprite aleatorio) en una celda libre.
- [ ] Cada 5 frutas sube el **Nivel** y la serpiente acelera (el tick se acorta hasta `MIN_TICK`).
- [ ] Chocar con el **borde** o con un **segmento propio** termina la partida y abre el modal "FIN DEL
      JUEGO" con la puntuación real (una sola vida, sin respawn).
- [ ] El HUD de plataforma muestra **Puntuación / Longitud / Nivel** desde el estado real del motor; el
      canvas no dibuja HUD propio ni overlays.
- [ ] **PAUSA** congela y muestra "EN PAUSA"; **REANUDAR** continúa; **FIN** fuerza el fin; **SALIR**
      vuelve a `/juego/snake`.
- [ ] Las flechas **no** hacen scroll de la página.
- [ ] Guardar en el modal inserta la fila con `game_id: "snake"` y es visible en `/salon` tras recargar.
- [ ] "JUGAR DE NUEVO" reinicia limpio (score 0, longitud `START_LEN`, nivel 1); "VOLVER AL VAULT" va a
      `/biblioteca`.
- [ ] Redimensionar la ventana no deforma la rejilla ni la serpiente (se mantiene el aspecto 4/3, celdas
      cuadradas, tablero centrado); el juego sigue jugable.
- [ ] Al desmontar la página se cancela el `requestAnimationFrame` y se quitan los listeners de teclado
      (sin fugas ni logs de "canvas null").
- [ ] Existe la fila `snake` en `public.games` (`sort_order` 11) y ~12 filas en `public.scores`;
      `get_advisors` (security) no reporta tablas sin RLS.

---

## Decisions

- **Sí:** Ficha nueva `snake` conviviendo con el mock `serpentina`. **No:** cablear el motor a
  `serpentina`; se replica la identidad propia de Asteroids/Tetris/Arkanoid.
- **Sí:** Ruta dedicada `/juego/snake/jugar` + `playHref`. **No:** resolver el placeholder genérico
  `/jugar/[id]`.
- **Sí:** **Andamiar** el motor desde cero (no hay `game.js`), reusando el patrón/plantilla de Asteroids.
  **No:** portar un `game.js` inexistente.
- **Sí:** **Comida con sprites reales** del atlas `fruits.png` (fruta aleatoria, cosmética), con
  **fallback** a círculo neón. Es el rasgo distintivo que el usuario aportó. **No:** dibujar la comida
  como primitiva sin usar los sprites.
- **Sí:** Toda fruta **vale lo mismo (+10)** y es solo estética. **No:** puntos variables por fruta ni
  frutas con efectos especiales; se difieren a otro spec.
- **Sí:** Serpiente con **primitivas neón cyan** (solo hay sprites de frutas). **No:** portar sprites de
  serpiente inexistentes.
- **Sí:** **Morir al chocar** con el borde o consigo misma (una sola vida, `gameover` directo). **No:**
  paredes envolventes ni fase `dead`/respawn.
- **Sí:** `GameState = { score, length, level, phase }` con HUD **Puntuación / Longitud / Nivel**
  (Longitud ocupa el hueco de "Vidas", como Tetris con "Líneas"). **No:** mostrar "Vidas" (Snake no
  tiene) ni "Velocidad" (redundante con Nivel).
- **Sí:** **Movimiento por tick de rejilla** con acumulador de `dt`. **No:** física continua px/s como
  Asteroids/Arkanoid; no aplica a un juego de celdas.
- **Sí:** Rejilla **24×18 (4:3)** que llena la CRT con celdas cuadradas centradas. **No:** tablero
  cuadrado con letterboxing.
- **Sí:** Dificultad por **escalones cada 5 frutas** que acortan el tick (Nivel = ⌊frutas/5⌋+1). **No:**
  aceleración continua ni velocidad fija.
- **Sí:** Controles **flechas + WASD**, giro discreto con buffer, reversa de 180° ignorada,
  `preventDefault` en flechas. **No:** solo flechas.
- **Sí:** Color de card `cyan`. **No:** `green` (idéntico al mock `serpentina`).
- **Sí:** Portada CSS propia **`cover-snake-fruit`** vía `/frontend-design`. **No:** reusar `cover-snake`
  (colisiona con `serpentina`).
- **Sí:** Guardado real con `insertScore({ gameId: "snake" })` y seed `seededScores(88, 12)` para
  paridad BD↔fallback. **No:** `localStorage`.

---

## Risks

| Riesgo                                                                            | Mitigación                                                                                                                                         |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| El motor accede a `document`/`window` en el import y rompe el build de servidor.  | Módulo client-only; estado en closures; se instancia solo en `useEffect` de una página `"use client"`; el paso 2 lo verifica con `build`.          |
| El **spritesheet no carga** a tiempo (o falla la ruta) y la comida no se ve.      | Flag `imgReady` + **fallback** a círculo neón; el sprite se pinta cuando `img.onload`. El paso 7 verifica por píxeles que se pinta el sprite real. |
| Ruta del asset mal resuelta en Next 16 (`public/` vs import).                     | Se copia a `public/snake-assets/` y se referencia como `/snake-assets/fruits.png`; el paso 1 confirma que se sirve.                                |
| Fuga de `requestAnimationFrame`/listeners de teclado al navegar fuera.            | `destroy()` cancela el rAF y quita los listeners; se llama en el cleanup del `useEffect`.                                                          |
| Las flechas hacen scroll de la página o roban foco.                               | `preventDefault` en las flechas de `GAME_KEYS`; verificado en el paso 3.                                                                           |
| **Reversa de 180°** instantánea hace que la serpiente se muerda al girar en seco. | El giro se buffera en `nextDir` y se **ignora** si es opuesto a `dir`; se aplica una vez por tick. Criterio de aceptación específico.              |
| La fruta reaparece **encima de la serpiente** (celda ocupada).                    | La recolocación elige entre las **celdas libres** (todas menos las del cuerpo); si no quedan libres, es victoria/lleno (fin de partida).           |
| Deformación de la rejilla o celdas no cuadradas al reescalar (dpr/tamaño CSS).    | `resize()` recalcula `cell = min(cssW/cols, cssH/rows)`, centra el tablero y ajusta `devicePixelRatio`; verificado con capturas en el paso 7.      |
| Desincronización HUD↔motor (score/longitud/nivel).                                | `emitState()` con dedupe por clave es la única fuente de verdad; el paso 3 lo comprueba jugando.                                                   |
| Catálogo BD desincronizado del fallback `GAMES`.                                  | La migración copia los valores exactos de la ficha; el seed usa `seededScores(88, 12)`, misma semilla que el fallback.                             |
| Contenido oculto tras `av-bg`/`av-noise` por `z-index` mal portado.               | El paso 7 verifica **por píxeles** (no solo DOM) que HUD, canvas y modal quedan por encima del fondo.                                              |
| `dt` desbocado al volver de una pestaña en segundo plano (spiral-of-death).       | Se conserva el cap `Math.min(dt, 0.05)`; el acumulador de tick no dispara múltiples pasos gigantes; PAUSA detiene `update` cuando procede.         |
| Doble disparo de `onGameOver` (borde y cola en el mismo paso, o FIN + colisión).  | Guard `gameOverFired`: `onGameOver` se dispara una sola vez por partida.                                                                           |

---

## What is **not** in this spec

- Controles táctiles/móviles (gestos de deslizamiento).
- Sonido/audio (comer, morir).
- Frutas con puntos variables o efectos especiales.
- Paredes envolventes (toroidales), obstáculos/muros internos, bonus temporizados.
- Portar sprites de la propia serpiente.
- Cablear el juego a la ficha `serpentina` o unificarlas.
- `best` en vivo, `plays` real, dificultad configurable.
- Portar los demás juegos del catálogo.

Cada uno de esos, si se aborda, va en su propio spec.
