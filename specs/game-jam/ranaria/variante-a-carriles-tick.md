# SPEC (game-jam) — RANARIA (variante A · cruce clásico por saltos de rejilla)

> **Status:** Borrador
> **Depends on:** SPEC 01 (HUD, CRT, modal, `.av-player`), SPEC 05 (patrón motor+página de Asteroids), SPEC 06 (catálogo y leaderboard en Supabase)
> **Date:** 2026-07-22
> **Objective:** Andamiar un Frogger clásico (tema RANARIA) donde una rana **salta celda a celda** por una rejilla, esquivando carriles de coches en continuo y cruzando un río sobre troncos a la deriva hasta ocupar los 5 nenúfares antes de que se agote el tiempo, corriendo en `/juego/ranaria/jugar` e integrado con el HUD, el marco CRT y el guardado de puntuaciones.

---

## Section 1 — Por qué este spec

El patrón para integrar un juego de canvas real ya está establecido por SPEC 05 (Asteroids), SPEC 07
(Tetris), SPEC 08 (Arkanoid) y SPEC 09 (Snake), sobre la infraestructura de catálogo/leaderboard en
Supabase con fallback de SPEC 06. Este spec **aplica ese mismo patrón** a RANARIA (Frogger) en modo
**andamiar** (no existe `game.js` de referencia): se construye el motor desde cero respetando la
frontera motor headless ↔ chrome React.

**Identidad de catálogo — matiz respecto a Snake:** en `asteroids↔rocas`, `tetris↔caida`,
`arkanoid↔bloque-buster`, `snake↔serpentina`, el juego real recibía un **slug nuevo** distinto del
mock. Aquí el mock del catálogo **ya se llama `ranaria`** (no es un nombre "creativo" como
`serpentina`, sino el nombre canónico del tema). Por eso, y siguiendo la instrucción del game-jam de
usar `game-id = ranaria`, este spec **resuelve/actualiza la ficha mock `ranaria` en su sitio** para
convertirla en jugable (le añade `playHref` y una portada propia) en lugar de crear un slug paralelo.
No hay colisión de slug porque no se crea uno nuevo: se promociona el existente. La variante B comparte
esta misma identidad `ranaria` y solo se implementará **una** de las dos.

**Eje mecánico de esta variante (A):** Frogger **canónico** — la rana se mueve por **saltos discretos
de celda** (un salto por pulsación, plantilla de rejilla tipo Snake para el jugador) mientras los
peligros (coches, troncos) se desplazan en **física continua px/s** (plantilla Asteroids/Arkanoid para
el entorno). Incluye **río con troncos** (hay que ir montado o te ahogas), **temporizador por cruce**,
**3 vidas**, **5 nenúfares** que rellenar y **niveles discretos** que aceleran el tráfico. Es el
Frogger de recreativa clásico.

---

## Scope

**In:**

- **Motor andamiado en TypeScript** (`app/juego/ranaria/jugar/engine.ts`): rejilla lógica **13
  columnas × 15 filas** organizada en bandas —fila de partida (abajo, segura), **5 carriles de
  carretera** con coches, **franja mediana** (segura), **5 carriles de río** con troncos/plataformas,
  y **fila de meta** con **5 nenúfares**. La rana **salta una celda por pulsación** (← → ↑ ↓ / WASD);
  los coches y troncos se mueven en **px/s continuos** por sus carriles (cada carril con dirección y
  velocidad propias, con envoltura toroidal horizontal). **Muerte** (pierde una vida) al: ser
  atropellada por un coche, caer al **agua** (estar sobre un carril de río sin tronco), salir de los
  bordes al ir montada en un tronco, agotar el **temporizador**, o saltar a un nenúfar ya ocupado / al
  seto entre nenúfares. **Score**: `+10` por fila avanzada hacia arriba (récord de fila alcanzada),
  `+50` al ocupar un nenúfar y **bonus de tiempo** restante. Al llenar los **5 nenúfares** → sube de
  **nivel**, se reinicia la travesía y el tráfico acelera. `score` y fases emitidas a React. Render con
  **primitivas neón** (rana, coches, troncos, nenúfares). Client-only. Expone
  `createRanaria(canvas, { onState, onGameOver })` con
  `pause/resume/restart/forceGameOver/resize/destroy`.
- **Página cliente dedicada** `app/juego/ranaria/jugar/page.tsx` (`"use client"`) que monta el
  `<canvas>` por `ref`, cablea el motor y reusa el chrome: **HUD** (Jugador / Puntuación / **Vidas** /
  Nivel + botones **PAUSA/FIN/SALIR**), **marco CRT** y **modal "FIN DEL JUEGO"** con input de nombre.
- **HUD alimentado por el motor**: Puntuación / **Vidas** / Nivel salen del `GameState` real; el canvas
  no dibuja HUD propio ni overlays. El temporizador se dibuja **dentro** del canvas como barra en la
  fila inferior (no es un `.hud-stat`), para no añadir un cuarto stat al HUD de plataforma.
- **Ficha `ranaria` promocionada** en `app/data/games.ts`: se **actualiza** la entrada mock existente
  para añadir `playHref: "/juego/ranaria/jugar"` y `cover: "cover-ranaria"`, y afinar `short`/`long` al
  juego real. Mantiene `cat: "ARCADE"` y `color: "green"`.
- **Portada CSS `cover-ranaria`** en `app/globals.css`, arte pixel/neón propio (rana verde + carril de
  coches + nenúfar), diseñada con la skill **`/frontend-design`**, distinta de `cover-rana` (que queda
  huérfana; no se reutiliza para no arrastrar el arte del mock).
- **Supabase**: fila `ranaria` en `public.games` (mismos valores que el fallback) —**upsert** porque el
  mock pudo sembrarse en SPEC 06— y **~12 filas sembradas** en `public.scores` con
  `seededScores("ranaria".length * 17 + 3, 12)` = `seededScores(122, 12)` para paridad BD↔fallback.
- **Guardado real** al game over vía `insertScore({ gameId: "ranaria", playerName, score })`.
- **Control por la plataforma**: **PAUSA** congela `update`/`draw` y muestra "EN PAUSA"; **FIN** fuerza
  el game over; **SALIR** vuelve a `/juego/ranaria`.
- **Controles**: **← → ↑ ↓** y **WASD** (saltar una celda por pulsación, con `preventDefault` en las
  flechas para no scrollear).
- **Mundo responsive**: la rejilla 13×15 encaja en la pantalla CRT; `resize()` re-mide, recalcula el
  tamaño de celda y ajusta `devicePixelRatio`, centrando el tablero.

**Out of scope (specs futuros):**

- Controles táctiles/móviles (gestos de deslizamiento).
- Sonido/audio (salto, atropello, ahogo, nenúfar).
- **Peligros/bonus extra**: cocodrilos en los nenúfares, serpientes sobre troncos, tortugas que se
  sumergen, mosca de bonus, rana rescatable. En este spec el río tiene solo troncos y la carretera solo
  coches.
- Física continua para la rana (esta variante es de salto discreto; la continua es la variante B).
- `best` en vivo, `plays` real, dificultad configurable.
- Portar los demás juegos del catálogo o unificar con `cover-rana`.

---

## Data model

Esta feature **no introduce estructuras nuevas de datos de plataforma**: reusa el tipo `Game` (con
`playHref`, ya existente), las tablas `games`/`scores` de SPEC 06 e `insertScore`. Introduce la
**promoción de una ficha de catálogo**, **una fila de BD (upsert) + seed** y el **contrato interno del
motor**.

### 1. Ficha en `GAMES` (`app/data/games.ts`) y fila en `public.games`

La entrada `ranaria` existente se **actualiza** a:

```ts
{
  id: "ranaria",
  title: "RANARIA",
  short: "Cruza carriles de coches y un río de troncos hasta los nenúfares.",
  long: "El clásico del cruce, real y jugable: salta celda a celda esquivando coches a toda velocidad, cabalga troncos a la deriva sin caer al agua y ocupa los 5 nenúfares antes de que se agote el tiempo. Tienes 3 vidas y cada nivel el tráfico va más rápido.",
  cat: "ARCADE",
  cover: "cover-ranaria",
  color: "green",
  best: 18900,
  plays: "0",
  playHref: "/juego/ranaria/jugar",
}
```

La fila de `public.games` replica **exactamente** estos valores (con `play_href` snake_case). Como el
mock `ranaria` puede haberse sembrado en SPEC 06, la migración hace **upsert** (`on conflict (id) do
update`) preservando su `sort_order` si ya existe, o `max(sort_order)+1` si se inserta nueva. El seed de
`public.scores` para `game_id = "ranaria"` se genera con `seededScores(122, 12)` para que BD y fallback
coincidan.

### 2. Contrato del motor (`app/juego/ranaria/jugar/engine.ts`)

```ts
// Fases: "playing" activo, "paused" congelado, "gameover" fin.
// No hay fase "dead": al morir con vidas restantes se re-coloca la rana en la fila de
// partida directo (lives--) sin pausa, como el re-servir de Arkanoid.
export type GamePhase = "playing" | "paused" | "gameover";

export interface GameState {
  score: number; // filas avanzadas ×10 + nenúfares ×50 + bonus de tiempo
  lives: number; // inicia en 3
  level: number; // ⌊nenúfares totales / 5⌋ + 1; controla la velocidad del tráfico
  phase: GamePhase;
}

export interface RanariaHandle {
  pause(): void;
  resume(): void;
  restart(): void;
  forceGameOver(): void; // botón FIN
  resize(): void; // re-mide el contenedor y recalcula el tamaño de celda
  destroy(): void; // cancela el rAF y quita listeners de teclado
}

export function createRanaria(
  canvas: HTMLCanvasElement,
  opts: {
    onState: (s: GameState) => void; // alimenta el HUD React
    onGameOver: (finalScore: number) => void; // abre el modal
  },
): RanariaHandle;
```

**Convenciones:**

- El motor es la **fuente de verdad** de score/vidas/nivel; React refleja (`onState`) y persiste al
  final (`onGameOver`).
- RANARIA **sí tiene vidas y niveles**: el HUD de plataforma muestra **Puntuación / Vidas / Nivel**
  (igual que Asteroids/Arkanoid). `emitState()` usa dedupe por clave `"score|lives|level|phase"`.
- **El temporizador NO es un `.hud-stat`**: se pinta dentro del canvas como barra decreciente en la
  franja inferior, para no romper el HUD de tres stats de la plataforma.
- **Re-colocar directo**: al morir, `lives--`; si `lives > 0` se recoloca la rana en la fila de partida
  y se reinicia el temporizador del cruce (sin fase `dead`); si `lives === 0` → `phase = "gameover"` +
  `onGameOver(score)` (una sola vez, guard `gameOverFired`).
- **Nivel = travesías completas**: al ocupar el 5.º nenúfar de una tanda sube el nivel, se limpian los
  nenúfares y el tráfico acelera; no hay bucle de victoria (es endless por niveles hasta perder las
  vidas).
- El nombre de guardado sigue la lógica del placeholder: `nameEdit ?? user?.name ?? "INVITADO"`,
  mayúsculas, máx. 10.

### 3. Constantes del motor (andamiadas, mundo lógico 13×15 celdas)

```ts
GRID_COLS = 13;
GRID_ROWS = 15;
// Distribución de filas (0 = arriba/meta):
//   fila 0        → meta con 5 nenúfares (en cols 1,3,5,7,9,11 se distribuyen 5 slots + setos)
//   filas 1..5    → río (troncos/plataformas, sentido alterno por fila)
//   fila 6        → mediana segura
//   filas 7..11   → carretera (coches, sentido alterno por fila)
//   filas 12..14  → zona de partida segura (rana empieza en fila 13, centrada)
START_LIVES = 3;
POINTS_FORWARD = 10; // por fila nueva alcanzada (récord, no ida y vuelta)
POINTS_HOME = 50; // por nenúfar ocupado
TIME_BONUS_PER_SEC = 5; // bonus por segundo restante al llegar a nenúfar
CROSS_TIME = 30; // s de temporizador por cruce (por vida)
HOMES_TO_CLEAR = 5; // nenúfares por travesía → sube nivel
BASE_SPEED = 2.2; // celdas/s del tráfico más lento en nivel 1
SPEED_STEP = 0.35; // celdas/s extra por nivel
LANE_SPEEDS = [...]; // multiplicador relativo por carril (variedad); × (BASE + (level-1)*STEP)
HOP_LOCK = 0.09; // s de bloqueo entre saltos para evitar dobles saltos por pulsación
// Tamaño de celda = min(cssW/13, cssH/15); el tablero se centra en el canvas.
```

**Modelo de movimiento (clave del andamiaje):** la **rana** avanza por **saltos discretos de celda**
(un salto por pulsación, con `HOP_LOCK` anti-repetición), como el jugador en la plantilla de rejilla de
Snake. Los **peligros** (coches, troncos) se mueven en **física continua px/s** dentro de su carril,
como las entidades de Asteroids/Arkanoid, con envoltura toroidal horizontal (reaparecen por el lado
opuesto). Cada frame: `update(dt)` desplaza los peligros; si la rana está en un carril de río, **se
mueve solidaria** con el tronco bajo ella (si no hay tronco → ahogo); se comprueban colisiones AABB
rana↔coche (atropello) y rana↔borde estando en río (caída). El temporizador descuenta `dt`; al llegar a
0 → muerte. `draw` se ejecuta cada frame pintando bandas, peligros, nenúfares, rana y barra de tiempo.
El multiplicador de velocidad se recalcula al subir de nivel: `BASE_SPEED + (level-1) * SPEED_STEP`.

---

## Implementation plan

Cada paso deja el sistema compilando y navegable. (Se corresponden con las Fases 3–8 de la skill
`/nuevo-juego`.) **Restricción Next.js 16:** antes de tocar código de Next (App Router, `"use client"`,
`use(params)`) leer `node_modules/next/dist/docs/`. **Restricción client-only:** el motor no accede a
`document`/`window` en el import; se instancia solo dentro de `useEffect` de una página `"use client"`.

**Las 10 transformaciones de porteo (aplicadas al andamiar desde cero):**

1. **Contrato público arriba del archivo:** `GamePhase`, `GameState`, `RanariaHandle`, opciones y
   `createRanaria(canvas, opts)`.
2. **`World` en vez de globales:** `interface World { W; H; cell; cols; rows; ctx }`; nada de `const W`
   global; se pasa a `update(dt, w)`/`draw(w)`.
3. **Estado en closures:** `frog: Cell`, `lanes: Lane[]` (cada una `{ row, dir, speed, kind:
"car"|"log", items: {x,len}[] }`), `homes: boolean[5]`, `score`, `lives`, `level`, `homesTotal`,
   `timeLeft`, `hopLock`, `maxRowReached` **dentro** de `createRanaria`. Nada a nivel de módulo
   (SSR-safe).
4. **`resize()` con devicePixelRatio:** mide `getBoundingClientRect()`; `canvas.width = cssW*dpr`;
   `ctx.setTransform(dpr,0,0,dpr,0,0)`; recalcula `cell = min(cssW/13, cssH/15)` y centra el tablero
   (offset). Las posiciones lógicas son en **celdas**; solo cambia el tamaño de dibujo. Velocidades del
   tráfico en **celdas/s** (constantes; se convierten a px al dibujar).
5. **`emitState()` con dedupe por clave** `"score|lives|level|phase"`; `force=true` en transiciones
   (pausa, game over, restart). Se llama cada frame; dispara solo en cambios.
6. **Loop con pausa:** `loop(ts)` agenda siempre el siguiente rAF, **dibuja siempre**, y hace
   `update(dt)` solo si `!paused`; `dt = Math.min((ts-last)/1000, 0.05)`.
7. **Handle completo:** `pause/resume` (flag + `emitState(true)`); `restart` (`lastTime=null`, re-init:
   rana en fila de partida, nivel 1, 3 vidas, score 0, nenúfares vacíos, tráfico base, temporizador a
   `CROSS_TIME`); `forceGameOver` (guard `gameOverFired`, dispara `onGameOver` una vez); `resize`;
   `destroy`.
8. **`destroy()` limpio:** `cancelAnimationFrame(raf)` + quitar listeners de teclado. Se llama en el
   cleanup del `useEffect`.
9. **`GAME_KEYS` + `preventDefault`:** `Set` con `ArrowLeft/Right/Up/Down` + `w/a/s/d`; en keydown se
   ejecuta **un** salto (respetando `hopLock`) y `preventDefault` en las flechas. Listeners en `window`,
   removidos en `destroy()`.
10. **Sin HUD ni overlays en canvas:** no se dibuja "Score"/"Vidas"/"GAME OVER" dentro del canvas (lo
    gestiona React); la **única** UI en canvas es la barra de temporizador. La lógica de peligros y
    colisiones vive en el motor.

Pasos:

1. **Motor `engine.ts` (andamiado).** Crear `app/juego/ranaria/jugar/engine.ts` en TypeScript estricto
   usando `app/juego/asteroids/jugar/engine.ts` como plantilla viva, con **rana por salto discreto** y
   **peligros por física continua**:
   - Contrato público arriba; `World` + estado en closures (punto 2/3).
   - **Construcción de carriles**: 5 de carretera (coches) y 5 de río (troncos), con dirección alterna y
     `speed` derivada de `LANE_SPEEDS × (BASE_SPEED + (level-1)*SPEED_STEP)`; ítems espaciados con hueco
     jugable.
   - **`update(dt)`**: mover ítems de cada carril con envoltura toroidal; si la rana está en fila de
     río, buscar tronco bajo ella → moverla solidaria; si no hay tronco o se sale por el borde →
     muerte. AABB rana↔coche → muerte. Descontar `timeLeft`; a 0 → muerte. En muerte: `lives--` +
     re-colocar o `gameover`.
   - **Salto**: en keydown mover la rana una celda en la dirección (respetando límites y `hopLock`); si
     avanza a una fila nueva récord → `+10`; si llega a fila 0 sobre un nenúfar libre → ocupar (`+50` +
     bonus de tiempo), re-colocar rana en partida, reiniciar `timeLeft`; si todos ocupados → subir
     nivel; si cae en seto/nenúfar ocupado → muerte.
   - **Render neón**: bandas (carretera gris-neón, río cyan translúcido, mediana/partida verdes),
     coches como rects con glow, troncos como rects marrón-neón, nenúfares como marcas verdes (ocupados
     con rana), rana verde con ojos según orientación; barra de temporizador abajo. **Sin** HUD ni
     overlays en canvas.
   - `resize()` (punto 4), `emitState()` (punto 5), loop con pausa (punto 6), handle (punto 7),
     `destroy()` (punto 8), `GAME_KEYS` (punto 9).
     _Test:_ `npm run lint` y `npm run build` sin errores; sin acceso a `document`/`window` en el
     import.

2. **Página cliente `page.tsx`.** Copiar `app/juego/asteroids/jugar/page.tsx` y ajustar: import de
   `./engine` (`createRanaria`), `id` `ranaria`, HUD con **Vidas** (igual que Asteroids),
   `router.push("/juego/ranaria")` en SALIR, modal con
   `insertScore({ gameId: "ranaria", playerName: name, score })`. `ResizeObserver` → `handle.resize()`;
   cleanup con `destroy()`. El canvas real ocupa `.crt-screen` (sin `.game-arena` decorativa ni
   `setInterval` falso). _Test:_ `/juego/ranaria/jugar` carga, se ve la rana, coches y troncos
   moviéndose, sin errores en consola; las flechas no scrollean; WASD y flechas saltan; PAUSA
   congela/reanuda.

3. **Ficha fallback en `games.ts`.** Actualizar la entrada `ranaria` con `playHref`, `cover-ranaria` y
   textos del Data model. _Test:_ `/biblioteca` muestra la card RANARIA con la nueva portada; `/juego/
ranaria` renderiza el detalle; "JUGAR AHORA" apunta a `/juego/ranaria/jugar`; `lint` pasa.

4. **Portada `cover-ranaria`.** Invocar la skill **`/frontend-design`** para el arte y añadir la clase
   en `app/globals.css` (rana verde + carril de coches + nenúfar). Verificar `z-index`/`position` sobre
   `av-bg`/`av-noise`. _Test:_ card y detalle muestran arte propio distinto de `cover-rana`.

5. **Supabase (migración).** `apply_migration promote_game_ranaria`: **upsert** en `public.games`
   (mismos valores que el fallback, `play_href = /juego/ranaria/jugar`, `on conflict (id) do update`
   preservando `sort_order`; si no existe, `max(sort_order)+1`) + seed de ~12 filas en `public.scores`
   generadas con `seededScores(122, 12)` (ver plantilla Node de la skill; `created_at` a medianoche UTC
   del `DD/MM/2026` de la semilla). `get_advisors` (security) sin hallazgos nuevos. _Test:_
   `select count(*) from public.scores where game_id='ranaria'` = 12;
   `select * from public.games where id='ranaria'` = 1 fila con `play_href` correcto.

6. **Verificación y cierre.** `npm run build`/`npm run lint` limpios; capturas Playwright
   (→ `.playwright-screenshots`) de biblioteca (card), detalle (portada), partida en curso (rana +
   coches + troncos + río), estado PAUSA y modal de fin; jugar de verdad (avanzar filas, cruzar la
   carretera, cabalgar troncos, ocupar nenúfares, subir de nivel, morir atropellado y ahogado y por
   tiempo) y confirmar que la puntuación aparece en `/salon` de RANARIA tras recargar. Verificar por
   **píxeles** (no solo DOM) que nada queda oculto tras `av-bg`/`av-noise`.

---

## Acceptance criteria

- [ ] `npm run build` y `npm run lint` terminan sin errores.
- [ ] No hay errores en consola al cargar `/juego/ranaria/jugar` ni durante la partida.
- [ ] `/biblioteca` muestra una card **RANARIA** con portada `cover-ranaria` propia (distinta de
      `cover-rana`); `/juego/ranaria` renderiza el detalle con esa portada.
- [ ] En `/juego/ranaria`, "JUGAR AHORA" navega a `/juego/ranaria/jugar`.
- [ ] En `/juego/ranaria/jugar`: la rana **salta una celda por pulsación** con **← → ↑ ↓** y con
      **WASD**; no hay salto doble por mantener la tecla (respeta `HOP_LOCK`).
- [ ] Los coches y troncos se mueven en continuo por sus carriles con envoltura toroidal; avanzar a una
      fila nueva suma **+10**.
- [ ] En el río, estar sobre un tronco arrastra la rana solidariamente; quedar en agua (sin tronco) o
      salirse por el borde montada en un tronco cuesta una **vida**.
- [ ] Ser atropellada por un coche o agotar el **temporizador** cuesta una **vida**; al perder vida con
      vidas restantes la rana vuelve a la fila de partida y el temporizador se reinicia (sin pausa).
- [ ] Ocupar un **nenúfar** libre suma **+50 + bonus de tiempo**; saltar a un nenúfar ocupado o al seto
      cuesta una vida; llenar los **5 nenúfares** sube el **Nivel** y acelera el tráfico.
- [ ] Con 0 vidas se abre el modal "FIN DEL JUEGO" con la puntuación real.
- [ ] El HUD de plataforma muestra **Puntuación / Vidas / Nivel** desde el estado real del motor; el
      temporizador se pinta dentro del canvas (no como cuarto stat); el canvas no dibuja HUD ni overlays.
- [ ] **PAUSA** congela y muestra "EN PAUSA"; **REANUDAR** continúa; **FIN** fuerza el fin; **SALIR**
      vuelve a `/juego/ranaria`.
- [ ] Las flechas **no** hacen scroll de la página.
- [ ] Guardar en el modal inserta la fila con `game_id: "ranaria"` y es visible en `/salon` tras
      recargar.
- [ ] "JUGAR DE NUEVO" reinicia limpio (score 0, 3 vidas, nivel 1, nenúfares vacíos); "VOLVER AL VAULT"
      va a `/biblioteca`.
- [ ] Redimensionar la ventana no deforma la rejilla (celdas cuadradas, tablero centrado); el juego
      sigue jugable.
- [ ] Al desmontar la página se cancela el `requestAnimationFrame` y se quitan los listeners de teclado
      (sin fugas ni logs de "canvas null").
- [ ] Existe la fila `ranaria` en `public.games` con `play_href` correcto y ~12 filas en
      `public.scores`; `get_advisors` (security) no reporta tablas sin RLS.

---

## Decisions

- **Sí (eje de esta variante):** rana por **salto discreto de celda** + peligros por **física continua
  px/s** (Frogger canónico). **No:** movimiento continuo de la rana (eso es la variante B).
- **Sí:** Promocionar la ficha mock **`ranaria` en su sitio** (añadir `playHref`/`cover`), porque el
  mock ya lleva el nombre canónico del tema. **No:** crear un slug paralelo tipo `snake↔serpentina`
  (aquí sería redundante) ni mantener dos fichas.
- **Sí:** Ruta dedicada `/juego/ranaria/jugar` + `playHref`. **No:** resolver el placeholder genérico
  `/jugar/[id]`.
- **Sí:** **Andamiar** el motor desde cero (no hay `game.js`), reusando el patrón/plantilla de Asteroids
  para el bucle/handle y de Snake para la rejilla. **No:** portar un `game.js` inexistente.
- **Sí:** **Río con troncos** (arrastre solidario, ahogo sin tronco) además de la carretera. **No:**
  cocodrilos, tortugas que se sumergen, serpientes ni mosca de bonus (specs futuros).
- **Sí:** `GameState = { score, lives, level, phase }` con HUD **Puntuación / Vidas / Nivel** (RANARIA
  sí tiene vidas y niveles, como Arkanoid). **No:** mostrar un cuarto stat de tiempo en el HUD; el
  temporizador va dentro del canvas.
- **Sí:** **Re-colocar directo** al perder vida (sin fase `dead`); `phase = playing|paused|gameover`.
  **No:** respawn con fase intermedia.
- **Sí:** Dificultad por **niveles discretos** (cada travesía de 5 nenúfares acelera el tráfico). **No:**
  aceleración continua (eso es más propio de la variante B).
- **Sí:** Render con **primitivas neón**, coherente con el resto del catálogo. **No:** spritesheet ni
  assets externos.
- **Sí:** Controles **flechas + WASD**, un salto por pulsación con `HOP_LOCK`, `preventDefault` en
  flechas. **No:** solo flechas ni salto continuo por mantener pulsado.
- **Sí:** `cat "ARCADE"`, `color "green"` (identidad rana). **No:** cambiar la categoría/color del tema.
- **Sí:** Portada CSS propia **`cover-ranaria`** vía `/frontend-design`; `cover-rana` queda huérfana.
  **No:** reutilizar `cover-rana` (arte del mock).
- **Sí:** Guardado real con `insertScore({ gameId: "ranaria" })` y seed `seededScores(122, 12)` para
  paridad BD↔fallback. **No:** `localStorage`.

---

## Risks

| Riesgo                                                                           | Mitigación                                                                                                                                   |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| El motor accede a `document`/`window` en el import y rompe el build de servidor. | Módulo client-only; estado en closures; se instancia solo en `useEffect` de una página `"use client"`; el paso 1 lo verifica con `build`.    |
| Colisión/upsert del slug `ranaria` ya presente en el catálogo mock/BD.           | La ficha se **promociona en su sitio**; la migración usa `on conflict (id) do update` preservando `sort_order`; el paso 5 lo verifica.       |
| Fuga de `requestAnimationFrame`/listeners de teclado al navegar fuera.           | `destroy()` cancela el rAF y quita los listeners; se llama en el cleanup del `useEffect`.                                                    |
| Las flechas hacen scroll de la página o roban foco.                              | `preventDefault` en las flechas de `GAME_KEYS`; verificado en el paso 2.                                                                     |
| **Salto doble** por mantener pulsada la tecla o autorepeat del SO.               | Salto por keydown con bloqueo `HOP_LOCK` entre saltos; criterio de aceptación específico.                                                    |
| Arrastre del tronco mal sincronizado (la rana "vibra" o se despega en el río).   | La rana montada se mueve solidaria con el tronco en `update(dt)` en px reales; al saltar re-encaja a celda; verificado jugando en el paso 6. |
| Detección de agua/tronco imprecisa (muere sobre un tronco válido o al revés).    | AABB rana↔tronco con tolerancia; si el centro de la rana no cae sobre ningún tronco del carril de río → ahogo; verificado en el paso 6.      |
| Nenúfar generado inalcanzable o solapado; huecos de tráfico injugables.          | Slots de nenúfar fijos y separados; espaciado de ítems por carril con hueco mínimo jugable; balance verificado en el paso 6.                 |
| Deformación de la rejilla o celdas no cuadradas al reescalar (dpr/tamaño CSS).   | `resize()` recalcula `cell = min(cssW/13, cssH/15)`, centra el tablero y ajusta `devicePixelRatio`; verificado con capturas en el paso 6.    |
| Desincronización HUD↔motor (score/vidas/nivel).                                  | `emitState()` con dedupe por clave es la única fuente de verdad; el paso 2 lo comprueba jugando.                                             |
| Catálogo BD desincronizado del fallback `GAMES`.                                 | La migración copia los valores exactos de la ficha; el seed usa `seededScores(122, 12)`, misma semilla que el fallback.                      |
| Contenido oculto tras `av-bg`/`av-noise` por `z-index` mal portado.              | El paso 6 verifica **por píxeles** (no solo DOM) que HUD, canvas y modal quedan por encima del fondo.                                        |
| `dt` desbocado al volver de una pestaña en segundo plano (spiral-of-death).      | Se conserva el cap `Math.min(dt, 0.05)`; PAUSA detiene `update` cuando procede.                                                              |
| Doble disparo de `onGameOver` (atropello y tiempo agotado en el mismo frame).    | Guard `gameOverFired`: `onGameOver` se dispara una sola vez por partida.                                                                     |

---

## What is **not** in this spec

- Controles táctiles/móviles (gestos de deslizamiento).
- Sonido/audio (salto, atropello, ahogo, nenúfar).
- Peligros/bonus extra (cocodrilos, tortugas que se sumergen, serpientes, mosca, rana rescatable).
- Física continua para la rana (variante B).
- `best` en vivo, `plays` real, dificultad configurable.
- Reutilizar o eliminar `cover-rana`; portar los demás juegos del catálogo.

Cada uno de esos, si se aborda, va en su propio spec.
