# SPEC (game-jam) — RANARIA (variante B · esquiva continua de autopista, endless)

> **Status:** Borrador
> **Depends on:** SPEC 01 (HUD, CRT, modal, `.av-player`), SPEC 05 (patrón motor+página de Asteroids), SPEC 06 (catálogo y leaderboard en Supabase)
> **Date:** 2026-07-22
> **Objective:** Andamiar un dodge de autopista (tema RANARIA) donde una rana se mueve en **física continua px/s** por una carretera interminable esquivando tráfico que **acelera sin fin**, sumando cruces y distancia hasta el primer impacto, corriendo en `/juego/ranaria/jugar` e integrado con el HUD, el marco CRT y el guardado de puntuaciones.

---

## Section 1 — Por qué este spec

El patrón para integrar un juego de canvas real ya está establecido por SPEC 05 (Asteroids), SPEC 07
(Tetris), SPEC 08 (Arkanoid) y SPEC 09 (Snake), sobre la infraestructura de catálogo/leaderboard en
Supabase con fallback de SPEC 06. Este spec **aplica ese mismo patrón** a RANARIA en modo **andamiar**
(no existe `game.js` de referencia): se construye el motor desde cero respetando la frontera motor
headless ↔ chrome React.

**Identidad de catálogo — matiz respecto a Snake:** en `asteroids↔rocas`, `tetris↔caida`,
`arkanoid↔bloque-buster`, `snake↔serpentina`, el juego real recibía un **slug nuevo** distinto del
mock. Aquí el mock del catálogo **ya se llama `ranaria`** (nombre canónico del tema). Por eso, y
siguiendo la instrucción del game-jam de usar `game-id = ranaria`, este spec **resuelve/actualiza la
ficha mock `ranaria` en su sitio** para convertirla en jugable (le añade `playHref` y una portada
propia) en lugar de crear un slug paralelo. No hay colisión de slug: se promociona el existente. La
variante A comparte esta misma identidad `ranaria` y solo se implementará **una** de las dos.

**Eje mecánico de esta variante (B):** en vez del Frogger canónico por saltos (variante A), aquí la
rana se mueve en **física continua px/s** en las 4/8 direcciones (plantilla Asteroids/Arkanoid),
esquivando un tráfico que **no se detiene y acelera de forma continua** con la distancia. **No hay
río** ni troncos: es una autopista pura de reflejos, tipo _Freeway_. **Progresión endless** con
**una sola vida**: la partida termina al **primer impacto**, y la puntuación es la **distancia + los
cruces** logrados. La dificultad sube **continuamente** (no por escalones). Es la variante "arcade de
supervivencia" del mismo tema.

---

## Scope

**In:**

- **Motor andamiado en TypeScript** (`app/juego/ranaria/jugar/engine.ts`): mundo lógico continuo
  **800×600 px** con una carretera de varios carriles horizontales. La rana se mueve en **px/s
  continuos** con **← → ↑ ↓ / WASD** (movimiento suave, 8 direcciones por combinación de ejes),
  acotada a los bordes laterales; el objetivo es subir de la orilla inferior a la superior. Cada
  **cruce completo** (llegar arriba) suma puntos y **reaparece abajo** con el tráfico más rápido. El
  tráfico son coches que recorren carriles con dirección y velocidad propias y **envoltura toroidal
  horizontal**; su velocidad global **crece de forma continua** con la puntuación. **Una sola vida**:
  al primer choque AABB rana↔coche → `gameover` directo. **Score**: se acumula por **distancia**
  (progreso hacia arriba, sin descontar al retroceder) y **+100 por cruce** completo. Render con
  **primitivas neón** (rana, coches, líneas de carril). Client-only. Expone
  `createRanaria(canvas, { onState, onGameOver })` con
  `pause/resume/restart/forceGameOver/resize/destroy`.
- **Página cliente dedicada** `app/juego/ranaria/jugar/page.tsx` (`"use client"`) que monta el
  `<canvas>` por `ref`, cablea el motor y reusa el chrome: **HUD** (Jugador / Puntuación / **Distancia**
  / Nivel + botones **PAUSA/FIN/SALIR**), **marco CRT** y **modal "FIN DEL JUEGO"** con input de nombre.
- **HUD alimentado por el motor**: Puntuación / **Distancia** / Nivel salen del `GameState` real; el
  canvas no dibuja HUD propio ni overlays. **Distancia** ocupa el hueco de "Vidas" del HUD de
  plataforma (como "Líneas" en Tetris o "Longitud" en Snake), porque esta variante es de una sola vida.
- **Ficha `ranaria` promocionada** en `app/data/games.ts`: se **actualiza** la entrada mock existente
  para añadir `playHref: "/juego/ranaria/jugar"` y `cover: "cover-ranaria"`, y afinar `short`/`long` al
  juego real. Mantiene `cat: "ARCADE"` y `color: "green"`.
- **Portada CSS `cover-ranaria`** en `app/globals.css`, arte pixel/neón propio (rana verde + autopista
  con coches en fuga), diseñada con la skill **`/frontend-design`**, distinta de `cover-rana` (que queda
  huérfana).
- **Supabase**: fila `ranaria` en `public.games` (mismos valores que el fallback) —**upsert** porque el
  mock pudo sembrarse en SPEC 06— y **~12 filas sembradas** en `public.scores` con
  `seededScores("ranaria".length * 17 + 3, 12)` = `seededScores(122, 12)` para paridad BD↔fallback.
- **Guardado real** al game over vía `insertScore({ gameId: "ranaria", playerName, score })`.
- **Control por la plataforma**: **PAUSA** congela `update`/`draw` y muestra "EN PAUSA"; **FIN** fuerza
  el game over; **SALIR** vuelve a `/juego/ranaria`.
- **Controles**: **← → ↑ ↓** y **WASD** (movimiento continuo, con `preventDefault` en las flechas para
  no scrollear).
- **Mundo responsive**: el área 4/3 (800×600) encaja en la pantalla CRT; `resize()` re-mide, reescala
  posiciones proporcionalmente y ajusta `devicePixelRatio`.

**Out of scope (specs futuros):**

- Controles táctiles/móviles.
- Sonido/audio (movimiento, choque, cruce).
- **Río/troncos, nenúfares y temporizador** (eso es la variante A: cruce clásico por rejilla).
- Vidas múltiples / niveles discretos (esta variante es una sola vida + dificultad continua).
- Power-ups (invulnerabilidad, cámara lenta), obstáculos fijos, tráfico con patrones scriptados.
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
  short: "Esquiva la autopista de pixeles y sobrevive el mayor tiempo posible.",
  long: "El cruce llevado al límite: mueve la rana en continuo por una autopista interminable, esquiva coches que aceleran sin freno y suma distancia y cruces hasta el primer impacto. Una sola vida, reflejos máximos, y un tráfico que nunca deja de correr más rápido.",
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
// No hay fase "dead": una sola vida; al chocar → gameover directo (como Snake).
export type GamePhase = "playing" | "paused" | "gameover";

export interface GameState {
  score: number; // distancia acumulada + 100 por cruce
  distance: number; // metros/filas recorridas hacia arriba (ocupa el hueco de "Vidas" del HUD)
  level: number; // escalón informativo derivado de la dificultad continua (⌊score / STEP⌋ + 1)
  phase: GamePhase;
}

export interface RanariaHandle {
  pause(): void;
  resume(): void;
  restart(): void;
  forceGameOver(): void; // botón FIN
  resize(): void; // re-mide el contenedor y reescala el mundo
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

- El motor es la **fuente de verdad** de score/distancia/nivel; React refleja (`onState`) y persiste al
  final (`onGameOver`).
- RANARIA (variante B) **no tiene vidas**: el HUD de plataforma muestra **Puntuación / Distancia /
  Nivel** (Distancia sustituye el hueco de "Vidas", como "Líneas" en Tetris y "Longitud" en Snake).
  `emitState()` usa dedupe por clave `"score|distance|level|phase"`.
- **Una sola vida = fin directo**: al primer impacto AABB rana↔coche → `phase = "gameover"` +
  `onGameOver(score)` (una sola vez, guard `gameOverFired`). No hay respawn ni fase `dead`.
- **Dificultad continua**: la velocidad global del tráfico crece con `score` (sin escalones); `level`
  es solo un indicador derivado (`⌊score / LEVEL_STEP⌋ + 1`) para el HUD, no cambia la lógica por saltos.
- **Cruce**: al alcanzar la orilla superior, `+CROSS_BONUS`, la rana reaparece abajo y el tráfico está
  un poco más rápido (por el score sumado). La distancia no se descuenta al retroceder.
- El nombre de guardado sigue la lógica del placeholder: `nameEdit ?? user?.name ?? "INVITADO"`,
  mayúsculas, máx. 10.

### 3. Constantes del motor (andamiadas, mundo lógico 800×600 px)

```ts
WORLD_W = 800;
WORLD_H = 600;
FROG_SIZE = 26; // lado de la rana (px lógicos)
FROG_SPEED = 240; // px/s de movimiento continuo (por eje; diagonal = combinación)
LANE_COUNT = 7; // carriles de tráfico entre la orilla inferior y la superior
LANE_H = 64; // alto lógico de cada carril
CAR_W = 70; // ancho base del coche (varía ±)
CAR_H = 34;
BASE_TRAFFIC = 120; // px/s del tráfico al empezar (por carril × su multiplicador)
TRAFFIC_GROWTH = 0.06; // px/s extra por punto de score (aceleración continua)
MAX_TRAFFIC = 520; // cota superior de velocidad del tráfico
DIST_PER_ROW = 10; // score por avanzar el equivalente a un carril hacia arriba
CROSS_BONUS = 100; // score por cruce completo
LANE_DIRS = [+1, -1, +1, -1, ...]; // sentido alterno por carril
LANE_SPEED_MULT = [...]; // multiplicador relativo por carril (variedad)
LEVEL_STEP = 500; // score por "nivel" informativo del HUD
// resize(): reescala posiciones proporcionalmente; velocidades en px/s absolutos.
```

**Modelo de movimiento (clave del andamiaje):** a diferencia de la variante A (rana por salto discreto
de rejilla), aquí **toda** la simulación es **física continua px/s**, igual que Asteroids/Arkanoid: la
rana integra su posición con la entrada de teclado (`pos += dir * FROG_SPEED * dt`, acotada a los bordes
laterales), y los coches integran `x += speed * LANE_DIR * dt` con envoltura toroidal horizontal. Cada
frame: `update(dt)` mueve rana y coches, actualiza `distance`/`score` según el progreso vertical récord,
comprueba colisiones AABB rana↔coche (→ `gameover` directo), detecta cruce (rana en la orilla superior →
`+CROSS_BONUS` + reaparecer abajo), y recalcula la velocidad del tráfico
`min(BASE_TRAFFIC + score * TRAFFIC_GROWTH, MAX_TRAFFIC)`. `draw` se ejecuta cada frame. No hay tick de
rejilla ni acumulador de pasos.

---

## Implementation plan

Cada paso deja el sistema compilando y navegable. (Se corresponden con las Fases 3–8 de la skill
`/nuevo-juego`.) **Restricción Next.js 16:** antes de tocar código de Next (App Router, `"use client"`,
`use(params)`) leer `node_modules/next/dist/docs/`. **Restricción client-only:** el motor no accede a
`document`/`window` en el import; se instancia solo dentro de `useEffect` de una página `"use client"`.

**Las 10 transformaciones de porteo (aplicadas al andamiar desde cero):**

1. **Contrato público arriba del archivo:** `GamePhase`, `GameState`, `RanariaHandle`, opciones y
   `createRanaria(canvas, opts)`.
2. **`World` en vez de globales:** `interface World { W; H; ctx; keys }`; nada de `const W`/`const H`
   global; se pasa a `update(dt, w)`/`draw(w)`.
3. **Estado en closures:** `frog: {x,y}`, `cars: Car[]` (cada uno `{ lane, x, w, dir, speed }`),
   `score`, `distance`, `bestY` (progreso récord de esta travesía), `phase` **dentro** de
   `createRanaria`. Nada a nivel de módulo (SSR-safe).
4. **`resize()` con devicePixelRatio:** mide `getBoundingClientRect()`; `canvas.width = cssW*dpr`;
   `ctx.setTransform(dpr,0,0,dpr,0,0)`; **reescala posiciones proporcionalmente** (`sx = cssW/oldW`,
   `sy = cssH/oldH`). Las velocidades quedan en **px/s absolutos** (no se escalan).
5. **`emitState()` con dedupe por clave** `"score|distance|level|phase"`; `force=true` en transiciones
   (pausa, game over, restart). Se llama cada frame; dispara solo en cambios.
6. **Loop con pausa:** `loop(ts)` agenda siempre el siguiente rAF, **dibuja siempre**, y hace
   `update(dt)` solo si `!paused`; `dt = Math.min((ts-last)/1000, 0.05)`.
7. **Handle completo:** `pause/resume` (flag + `emitState(true)`); `restart` (`lastTime=null`, re-init:
   rana en la orilla inferior centrada, `score=0`, `distance=0`, tráfico base, coches recolocados);
   `forceGameOver` (guard `gameOverFired`, dispara `onGameOver` una vez); `resize`; `destroy`.
8. **`destroy()` limpio:** `cancelAnimationFrame(raf)` + quitar listeners de teclado. Se llama en el
   cleanup del `useEffect`.
9. **`GAME_KEYS` + `preventDefault`:** `Set` con `ArrowLeft/Right/Up/Down` + `w/a/s/d`; se mantiene un
   mapa `keys` para el movimiento continuo (keydown/keyup), con `preventDefault` en las flechas.
   Listeners en `window`, removidos en `destroy()`.
10. **Sin HUD ni overlays en canvas:** no se dibuja "Score"/"GAME OVER" dentro del canvas (lo gestiona
    React). La física de rana y tráfico vive en el motor.

Pasos:

1. **Motor `engine.ts` (andamiado).** Crear `app/juego/ranaria/jugar/engine.ts` en TypeScript estricto
   usando `app/juego/asteroids/jugar/engine.ts` como plantilla viva (física continua px/s):
   - Contrato público arriba; `World` + estado en closures (punto 2/3).
   - **Construcción de carriles**: `LANE_COUNT` carriles con `LANE_DIRS`/`LANE_SPEED_MULT`; coches
     espaciados con hueco jugable, velocidad = `traffic × mult`.
   - **`update(dt)`**: integrar la rana con el mapa `keys` (acotada a bordes laterales), integrar los
     coches con envoltura toroidal, actualizar `bestY`/`distance`/`score` según el progreso vertical,
     detectar **colisión AABB** rana↔coche → `gameover` directo, detectar **cruce** (orilla superior →
     `+CROSS_BONUS` + reaparecer abajo), recalcular velocidad del tráfico
     `min(BASE_TRAFFIC + score*TRAFFIC_GROWTH, MAX_TRAFFIC)`.
   - **Render neón**: bandas de carril (asfalto gris-neón con líneas discontinuas), coches como rects
     con glow y sentido, orillas superior/inferior verdes, rana verde con ojos según dirección. **Sin**
     HUD ni overlays en canvas.
   - `resize()` (punto 4), `emitState()` (punto 5), loop con pausa (punto 6), handle (punto 7),
     `destroy()` (punto 8), `GAME_KEYS` con mapa `keys` (punto 9).
     _Test:_ `npm run lint` y `npm run build` sin errores; sin acceso a `document`/`window` en el
     import.

2. **Página cliente `page.tsx`.** Copiar `app/juego/asteroids/jugar/page.tsx` y ajustar: import de
   `./engine` (`createRanaria`), `id` `ranaria`, HUD con **Distancia** en el hueco de Vidas (Puntuación
   / Distancia / Nivel), `router.push("/juego/ranaria")` en SALIR, modal con
   `insertScore({ gameId: "ranaria", playerName: name, score })`. `ResizeObserver` → `handle.resize()`;
   cleanup con `destroy()`. El canvas real ocupa `.crt-screen` (sin `.game-arena` decorativa ni
   `setInterval` falso). _Test:_ `/juego/ranaria/jugar` carga, se ve la rana moviéndose en continuo y
   el tráfico, sin errores en consola; las flechas no scrollean; WASD y flechas mueven; PAUSA
   congela/reanuda.

3. **Ficha fallback en `games.ts`.** Actualizar la entrada `ranaria` con `playHref`, `cover-ranaria` y
   textos del Data model. _Test:_ `/biblioteca` muestra la card RANARIA con la nueva portada; `/juego/
ranaria` renderiza el detalle; "JUGAR AHORA" apunta a `/juego/ranaria/jugar`; `lint` pasa.

4. **Portada `cover-ranaria`.** Invocar la skill **`/frontend-design`** para el arte y añadir la clase
   en `app/globals.css` (rana verde + autopista con coches en fuga). Verificar `z-index`/`position`
   sobre `av-bg`/`av-noise`. _Test:_ card y detalle muestran arte propio distinto de `cover-rana`.

5. **Supabase (migración).** `apply_migration promote_game_ranaria`: **upsert** en `public.games`
   (mismos valores que el fallback, `play_href = /juego/ranaria/jugar`, `on conflict (id) do update`
   preservando `sort_order`; si no existe, `max(sort_order)+1`) + seed de ~12 filas en `public.scores`
   generadas con `seededScores(122, 12)` (ver plantilla Node de la skill; `created_at` a medianoche UTC
   del `DD/MM/2026` de la semilla). `get_advisors` (security) sin hallazgos nuevos. _Test:_
   `select count(*) from public.scores where game_id='ranaria'` = 12;
   `select * from public.games where id='ranaria'` = 1 fila con `play_href` correcto.

6. **Verificación y cierre.** `npm run build`/`npm run lint` limpios; capturas Playwright
   (→ `.playwright-screenshots`) de biblioteca (card), detalle (portada), partida en curso (rana +
   tráfico), estado PAUSA y modal de fin; jugar de verdad (avanzar, cruzar varias veces, notar la
   aceleración continua del tráfico, morir al primer impacto) y confirmar que la puntuación aparece en
   `/salon` de RANARIA tras recargar. Verificar por **píxeles** (no solo DOM) que nada queda oculto tras
   `av-bg`/`av-noise`.

---

## Acceptance criteria

- [ ] `npm run build` y `npm run lint` terminan sin errores.
- [ ] No hay errores en consola al cargar `/juego/ranaria/jugar` ni durante la partida.
- [ ] `/biblioteca` muestra una card **RANARIA** con portada `cover-ranaria` propia (distinta de
      `cover-rana`); `/juego/ranaria` renderiza el detalle con esa portada.
- [ ] En `/juego/ranaria`, "JUGAR AHORA" navega a `/juego/ranaria/jugar`.
- [ ] En `/juego/ranaria/jugar`: la rana se mueve en **continuo** (px/s) con **← → ↑ ↓** y con **WASD**,
      incluidas diagonales, y queda acotada a los bordes laterales.
- [ ] El tráfico recorre los carriles con envoltura toroidal y **acelera de forma continua** con la
      puntuación (sin escalones perceptibles), hasta `MAX_TRAFFIC`.
- [ ] Avanzar hacia arriba suma **Distancia**/Puntuación; completar un **cruce** suma **+100** y
      reaparece abajo; retroceder no descuenta distancia.
- [ ] El **primer impacto** rana↔coche termina la partida y abre el modal "FIN DEL JUEGO" con la
      puntuación real (una sola vida, sin respawn).
- [ ] El HUD de plataforma muestra **Puntuación / Distancia / Nivel** desde el estado real del motor
      (Distancia ocupa el hueco de "Vidas"); el canvas no dibuja HUD propio ni overlays.
- [ ] **PAUSA** congela y muestra "EN PAUSA"; **REANUDAR** continúa; **FIN** fuerza el fin; **SALIR**
      vuelve a `/juego/ranaria`.
- [ ] Las flechas **no** hacen scroll de la página.
- [ ] Guardar en el modal inserta la fila con `game_id: "ranaria"` y es visible en `/salon` tras
      recargar.
- [ ] "JUGAR DE NUEVO" reinicia limpio (score 0, distancia 0, tráfico base); "VOLVER AL VAULT" va a
      `/biblioteca`.
- [ ] Redimensionar la ventana no deforma la rana/coches (se mantiene el aspecto 4/3); el juego sigue
      jugable.
- [ ] Al desmontar la página se cancela el `requestAnimationFrame` y se quitan los listeners de teclado
      (sin fugas ni logs de "canvas null").
- [ ] Existe la fila `ranaria` en `public.games` con `play_href` correcto y ~12 filas en
      `public.scores`; `get_advisors` (security) no reporta tablas sin RLS.

---

## Decisions

- **Sí (eje de esta variante):** **física continua px/s** para rana y tráfico, **endless** con
  **dificultad continua** y **una sola vida**. **No:** salto discreto por rejilla, río/nenúfares,
  temporizador ni niveles por escalones (eso es la variante A).
- **Sí:** Promocionar la ficha mock **`ranaria` en su sitio** (añadir `playHref`/`cover`), porque el
  mock ya lleva el nombre canónico del tema. **No:** crear un slug paralelo ni mantener dos fichas.
- **Sí:** Ruta dedicada `/juego/ranaria/jugar` + `playHref`. **No:** resolver el placeholder genérico
  `/jugar/[id]`.
- **Sí:** **Andamiar** el motor desde cero (no hay `game.js`), reusando el patrón/plantilla de Asteroids
  (física continua, bucle, handle). **No:** portar un `game.js` inexistente.
- **Sí:** `GameState = { score, distance, level, phase }` con HUD **Puntuación / Distancia / Nivel**
  (Distancia ocupa el hueco de "Vidas", como "Líneas"/"Longitud"), porque es una sola vida. **No:**
  mostrar "Vidas" (no las hay).
- **Sí:** **Fin al primer impacto** (`gameover` directo, como Snake). **No:** vidas múltiples ni
  respawn/fase `dead`.
- **Sí:** Dificultad **continua** (velocidad del tráfico crece con el score hasta `MAX_TRAFFIC`);
  `level` es solo indicador del HUD. **No:** aceleración por escalones discretos.
- **Sí:** Render con **primitivas neón**, coherente con el resto del catálogo. **No:** spritesheet ni
  assets externos.
- **Sí:** Controles **flechas + WASD**, movimiento continuo con mapa `keys`, `preventDefault` en
  flechas. **No:** salto discreto por pulsación.
- **Sí:** `cat "ARCADE"`, `color "green"` (identidad rana). **No:** cambiar la categoría/color del tema.
- **Sí:** Portada CSS propia **`cover-ranaria`** vía `/frontend-design`; `cover-rana` queda huérfana.
  **No:** reutilizar `cover-rana`.
- **Sí:** Guardado real con `insertScore({ gameId: "ranaria" })` y seed `seededScores(122, 12)` para
  paridad BD↔fallback. **No:** `localStorage`.

---

## Risks

| Riesgo                                                                            | Mitigación                                                                                                                                   |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| El motor accede a `document`/`window` en el import y rompe el build de servidor.  | Módulo client-only; estado en closures; se instancia solo en `useEffect` de una página `"use client"`; el paso 1 lo verifica con `build`.    |
| Colisión/upsert del slug `ranaria` ya presente en el catálogo mock/BD.            | La ficha se **promociona en su sitio**; la migración usa `on conflict (id) do update` preservando `sort_order`; el paso 5 lo verifica.       |
| Fuga de `requestAnimationFrame`/listeners de teclado al navegar fuera.            | `destroy()` cancela el rAF y quita los listeners; se llama en el cleanup del `useEffect`.                                                    |
| Las flechas hacen scroll de la página o roban foco.                               | `preventDefault` en las flechas de `GAME_KEYS`; verificado en el paso 2.                                                                     |
| El tráfico acelera demasiado rápido y el juego se vuelve injugable en segundos.   | `TRAFFIC_GROWTH` suave + cota `MAX_TRAFFIC`; huecos de carril con separación mínima jugable; balance verificado en el paso 6.                |
| Colisión AABB demasiado estricta/laxa (muerte injusta o coches que atraviesan).   | Hitbox de la rana ligeramente reducida respecto al sprite; AABB por frame con `dt` capado; verificado jugando en el paso 6.                  |
| Deformación de la rana/coches o pérdida de nitidez al reescalar (dpr/tamaño CSS). | `resize()` reescala posiciones proporcionalmente, mantiene el aspecto 4/3 y ajusta `devicePixelRatio`; verificado con capturas en el paso 6. |
| Desincronización HUD↔motor (score/distancia/nivel).                               | `emitState()` con dedupe por clave es la única fuente de verdad; el paso 2 lo comprueba jugando.                                             |
| Catálogo BD desincronizado del fallback `GAMES`.                                  | La migración copia los valores exactos de la ficha; el seed usa `seededScores(122, 12)`, misma semilla que el fallback.                      |
| Contenido oculto tras `av-bg`/`av-noise` por `z-index` mal portado.               | El paso 6 verifica **por píxeles** (no solo DOM) que HUD, canvas y modal quedan por encima del fondo.                                        |
| `dt` desbocado al volver de una pestaña en segundo plano (spiral-of-death).       | Se conserva el cap `Math.min(dt, 0.05)`; el movimiento continuo no da saltos gigantes; PAUSA detiene `update` cuando procede.                |
| Doble disparo de `onGameOver` (impacto + FIN en el mismo frame).                  | Guard `gameOverFired`: `onGameOver` se dispara una sola vez por partida.                                                                     |

---

## What is **not** in this spec

- Controles táctiles/móviles.
- Sonido/audio (movimiento, choque, cruce).
- Río/troncos, nenúfares y temporizador (variante A).
- Vidas múltiples / niveles discretos.
- Power-ups, obstáculos fijos, tráfico scriptado.
- `best` en vivo, `plays` real, dificultad configurable.
- Reutilizar o eliminar `cover-rana`; portar los demás juegos del catálogo.

Cada uno de esos, si se aborda, va en su propio spec.
