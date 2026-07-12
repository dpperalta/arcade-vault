# SPEC 07 — Juego Tetris en canvas real

> **Status:** Borrador
> **Depends on:** SPEC 01 (HUD, CRT, modal, `.av-player`), SPEC 02 (Home/biblioteca), SPEC 05 (patrón motor+página de Asteroids), SPEC 06 (catálogo y leaderboard en Supabase)
> **Date:** 2026-07-12
> **Objective:** Portar el Tetris de `references/started-games/03-tetris/game.js` a un motor TypeScript client-only que corre en `/juego/tetris/jugar`, integrado con el HUD, el marco CRT y el guardado de puntuaciones, y publicarlo como ficha nueva `tetris` en el catálogo (BD + fallback) conviviendo con el mock `caida`.

---

## Section 1 — Por qué este spec

Ya existe el patrón completo para integrar un juego de canvas real (SPEC 05, Asteroids) y la
infraestructura de catálogo/leaderboard en Supabase con fallback (SPEC 06). Este spec **aplica
ese mismo patrón** a un segundo juego, Tetris, sin inventar arquitectura nueva: reproduce la
frontera motor headless ↔ chrome React de Asteroids y añade la fila de catálogo + el seed del
leaderboard como hizo SPEC 06 para el resto de juegos. Se decide una **identidad propia `tetris`**
(igual que `asteroids` convive con el mock `rocas`), dejando la ficha mock `caida` intacta.

---

## Scope

**In:**

- **Motor portado a TypeScript** (`app/juego/tetris/jugar/engine.ts`): rejilla 10×20, las 8 piezas
  del original (7 tetrominós + la pieza **tuerca** `N`), rotación con wall-kicks, colisión, line
  clear, **pieza fantasma**, **hard-drop** y **soft-drop**, niveles por velocidad de caída, y
  vista de la **siguiente pieza**. Client-only. Expone `createTetris(canvas, { onState, onGameOver })`
  con `pause/resume/restart/forceGameOver/resize/destroy` y emite el estado a React.
- **Página cliente dedicada** `app/juego/tetris/jugar/page.tsx` (`"use client"`) que monta el
  `<canvas>` por `ref`, cablea el motor y reusa el chrome de la plataforma: **HUD** (Jugador /
  Puntuación / **Líneas** / Nivel + botones **PAUSA/FIN/SALIR**), **marco CRT** y **modal
  "FIN DEL JUEGO"** con input de nombre.
- **HUD alimentado por el motor**: se descarta el HUD DOM del original (`#score`/`#lines`/`#level`)
  y el overlay interno; Puntuación/Líneas/Nivel salen del `GameState` real en el HUD React.
- **Ficha `tetris` nueva** en `app/data/games.ts` (fallback) con `playHref: "/juego/tetris/jugar"`
  y `cover: "cover-tetris"`. Convive con el mock `caida` (no se toca).
- **Portada CSS `cover-tetris`** en `app/globals.css`, arte pixel/neón propio (tetrominós apilados)
  distinto de `cover-tetro`.
- **Supabase**: fila `tetris` en `public.games` (mismos valores que el fallback) y **~12 filas
  sembradas** en `public.scores` con la lógica de `seededScores` para paridad BD↔fallback.
- **Guardado real** al game over vía `insertScore({ gameId: "tetris", playerName, score })`.
- **Control por la plataforma**: **PAUSA** congela `update`/`draw` y muestra "EN PAUSA"; **FIN**
  fuerza el game over; **SALIR** vuelve a `/juego/tetris`. Se desactiva el reinicio interno y la
  pausa por tecla `P`; el reinicio va por "JUGAR DE NUEVO" del modal.
- **Teclado**: ← → (mover), ↑/X (rotar), ↓ (soft-drop), Espacio (hard-drop), con `preventDefault`.
- **Mundo responsive**: el tablero portrait 10×20 se centra dentro de la pantalla CRT (aspecto
  4/3) con letterboxing; `resize()` re-mide y ajusta `devicePixelRatio` para nitidez.

**Out of scope (specs futuros):**

- Controles táctiles/móviles.
- Cablear el juego a la ficha `caida` o unificar `caida`/`tetris`.
- Cambio de tema claro/oscuro del original (la plataforma tiene su propio estilo CRT).
- `best` derivado en vivo, `plays` real, sonido/audio, dificultad configurable.
- Portar los demás juegos del catálogo.

---

## Data model

Esta feature **no introduce estructuras nuevas de datos de plataforma**: reusa el tipo `Game`
(con `playHref`, ya existente), la tabla `games`/`scores` de SPEC 06 y `insertScore`. Introduce
**una ficha de catálogo**, **una fila de BD + seed** y el **contrato interno del motor**.

### 1. Ficha en `GAMES` (`app/data/games.ts`) y fila en `public.games`

```ts
{
  id: "tetris",
  title: "TETRIS",
  short: "Encaja las piezas y limpia líneas antes de que el muro te sepulte.",
  long: "El clásico de encaje, real y jugable: rota y deja caer tetrominós —más una pieza tuerca especial— sobre una rejilla de 10×20. Usa la pieza fantasma para afinar, el hard-drop para rematar y limpia líneas mientras la velocidad sube cada 10 líneas.",
  cat: "PUZZLE",
  cover: "cover-tetris",
  color: "cyan",
  best: 184220,
  plays: "0",
  playHref: "/juego/tetris/jugar",
}
```

La fila de `public.games` replica **exactamente** estos valores (con `play_href` snake_case y
`sort_order` = máximo actual + 1). El seed de `public.scores` para `game_id = "tetris"` se genera
con `seededScores("tetris".length * 17 + 3, 12)` para que BD y fallback coincidan.

### 2. Contrato del motor (`app/juego/tetris/jugar/engine.ts`)

```ts
export type GamePhase = "playing" | "paused" | "gameover";

export interface GameState {
  score: number;
  lines: number; // líneas totales limpiadas
  level: number;
  phase: GamePhase;
}

export interface TetrisHandle {
  pause(): void;
  resume(): void;
  restart(): void;
  forceGameOver(): void;
  resize(): void;
  destroy(): void;
}

export function createTetris(
  canvas: HTMLCanvasElement,
  opts: {
    onState: (s: GameState) => void;
    onGameOver: (finalScore: number) => void;
  },
): TetrisHandle;
```

**Convenciones:**

- El motor es la fuente de verdad de score/lines/level; React refleja (`onState`) y persiste al
  final (`onGameOver`).
- Tetris no tiene "vidas": el `GameState` no incluye `lives` y el HUD muestra **Líneas** en ese
  hueco. No hay fase `dead` (a diferencia de Asteroids): el fin es directo `playing → gameover`.
- El tablero (10×20, portrait) se dibuja centrado en la pantalla CRT con márgenes; la "siguiente
  pieza" se pinta como panel dentro del mismo canvas.
- El nombre de guardado sigue la lógica del placeholder: `nameEdit ?? user?.name ?? "INVITADO"`,
  mayúsculas, máx. 10.

---

## Implementation plan

Cada paso deja el sistema compilando y navegable. (Se corresponden con las Fases 3–8 de la skill
`/nuevo-juego`.)

1. **Motor `engine.ts`.** Portar `game.js` a TypeScript estricto usando `app/juego/asteroids/jugar/engine.ts`
   como plantilla: mover `COLS/ROWS/BLOCK`/`ctx` y el estado a closures dentro de `createTetris`;
   copiar 1:1 la lógica (piezas, `collide`, `rotateCW`+kicks, `clearLines`, ghost, hard/soft drop,
   niveles); sustituir el HUD DOM y el overlay por `emitState()`/`onGameOver`; loop con `paused`,
   `dt` capado; `resize()` con `devicePixelRatio` + letterboxing del tablero; `GAME_KEYS`
   (←→↑↓, X, Espacio) con `preventDefault`; `destroy()` que quita listeners y cancela el rAF.
   Quitar el reinicio interno y la pausa por `P` (los maneja React). _Test:_ `lint`/`build` sin
   errores; sin acceso a `document`/`window` en el import.

2. **Página cliente `page.tsx`.** Copiar la de Asteroids y ajustar: import de `./engine`, `id`
   `tetris`, HUD con **Líneas** en vez de Vidas, `router.push("/juego/tetris")` en SALIR, modal con
   `insertScore({ gameId: "tetris", ... })`. `ResizeObserver` → `handle.resize()`; cleanup con
   `destroy()`. _Test:_ `/juego/tetris/jugar` carga, caen piezas, sin errores; teclas no scrollean;
   PAUSA congela/reanuda.

3. **Ficha fallback en `games.ts`.** Añadir la entrada `tetris` (valores de arriba). _Test:_
   `/biblioteca` muestra la card TETRIS; `/juego/tetris` renderiza el detalle; "JUGAR AHORA" apunta
   a `/juego/tetris/jugar`; `lint` pasa.

4. **Portada `cover-tetris`.** Añadir la clase en `globals.css` con arte propio (tetrominós/rejilla
   neón), distinta de `cover-tetro`. Verificar `z-index` sobre `av-bg`/`av-noise`. _Test:_ card y
   detalle muestran arte propio.

5. **Supabase (migración).** `apply_migration add_game_tetris`: `insert` en `games` (mismos valores,
   `sort_order` siguiente) + seed de ~12 filas en `scores` generadas con `seededScores`. `get_advisors`
   (security) sin hallazgos nuevos. _Test:_ `select ... where game_id='tetris'` devuelve ~12 filas.

6. **Verificación y cierre.** `build`/`lint` limpios; capturas Playwright (→ `.playwright-screenshots`)
   de biblioteca, detalle, partida, PAUSA y modal; jugar de verdad y confirmar que la puntuación
   aparece en `/salon` de Tetris tras recargar.

---

## Acceptance criteria

- [ ] `npm run build` y `npm run lint` terminan sin errores.
- [ ] No hay errores en consola al cargar `/juego/tetris/jugar` ni durante la partida.
- [ ] `/biblioteca` muestra una card **TETRIS** con portada `cover-tetris` propia (distinta de
      `cover-tetro`); `/juego/tetris` renderiza el detalle con esa portada.
- [ ] En `/juego/tetris`, "JUGAR AHORA" navega a `/juego/tetris/jugar`; el mock `caida` y su ruta
      siguen intactos.
- [ ] En `/juego/tetris/jugar`: las piezas caen y se aceleran por nivel; ← → mueven, ↑/X rotan con
      wall-kick, ↓ hace soft-drop, Espacio hace hard-drop; la **pieza fantasma** se ve; la
      **siguiente pieza** se muestra; limpiar líneas suma según `[0,100,300,500,800] × nivel`.
- [ ] El HUD de plataforma (Puntuación / **Líneas** / Nivel) refleja el estado real del motor; el
      canvas no dibuja HUD DOM ni overlay propio.
- [ ] **PAUSA** congela y muestra "EN PAUSA"; **REANUDAR** continúa; **FIN** fuerza el fin;
      **SALIR** vuelve a `/juego/tetris`.
- [ ] Las flechas y Espacio no hacen scroll de la página.
- [ ] Al llegar a game over se abre el modal "FIN DEL JUEGO" con la puntuación real; guardar inserta
      la fila con `game_id: "tetris"` y es visible en `/salon` tras recargar.
- [ ] "JUGAR DE NUEVO" reinicia limpio (score 0, 0 líneas, nivel 1); "VOLVER AL VAULT" va a `/biblioteca`.
- [ ] Redimensionar la ventana no deforma el tablero (se mantiene centrado con letterboxing); el
      juego sigue jugable.
- [ ] Al desmontar la página se cancela el `requestAnimationFrame` y se quitan los listeners.
- [ ] Existe la fila `tetris` en `public.games` y ~12 filas en `public.scores`; `get_advisors`
      (security) no reporta tablas sin RLS.

---

## Decisions

- **Sí:** Ficha nueva `tetris` conviviendo con el mock `caida`. **No:** cablear el motor a `caida`;
  se replica la decisión de identidad propia de Asteroids (`asteroids` vs `rocas`).
- **Sí:** Ruta dedicada `/juego/tetris/jugar` + `playHref`. **No:** resolver el placeholder genérico
  `/jugar/[id]`.
- **Sí:** `GameState = { score, lines, level, phase }` — Líneas en el hueco de Vidas del HUD. **No:**
  forzar un campo `lives` inexistente en Tetris.
- **Sí:** Sin fase `dead`; el fin es directo `playing → gameover`. **No:** copiar el respawn de
  Asteroids, que no aplica.
- **Sí:** Tablero portrait centrado con letterboxing en la pantalla CRT 4/3; "siguiente pieza" dentro
  del canvas. **No:** deformar el tablero al aspecto de la pantalla ni sacar el preview a un segundo canvas.
- **Sí:** Color de botón `cyan` (pieza I), distinto del magenta de `caida`. **No:** reusar el magenta.
- **Sí:** Conservar la pieza **tuerca** `N` y toda la física del original. **No:** recortarla.
- **Sí:** Portada CSS propia `cover-tetris`. **No:** reusar `cover-tetro`.

---

## Risks

| Riesgo                                                                               | Mitigación                                                                                                            |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| El motor accede a `document`/`window` en el import y rompe el build de servidor.     | Módulo client-only; se instancia solo en `useEffect` de una página `"use client"`; el paso 1 lo verifica con `build`. |
| Tablero portrait deformado dentro de la pantalla CRT 4/3.                            | `resize()` centra el tablero con letterboxing y escala por celdas enteras; verificado en el paso 6.                   |
| Fuga de `requestAnimationFrame`/listeners al navegar fuera.                          | `destroy()` cancela el rAF y quita listeners; se llama en el cleanup del `useEffect`.                                 |
| Flechas/Espacio hacen scroll o `Space` hace hard-drop no intencionado al ganar foco. | `preventDefault` en `GAME_KEYS`; el foco de teclado se gestiona en la página; verificado en el paso 2.                |
| Desincronización HUD↔motor (score/líneas/nivel).                                     | `emitState()` con dedupe por clave es la única fuente; el paso 2 lo comprueba jugando.                                |
| Catálogo BD desincronizado del fallback `GAMES`.                                     | La migración copia los valores exactos de la ficha; el seed usa la misma semilla que el fallback.                     |
| Contenido oculto tras `av-bg`/`av-noise` por `z-index`.                              | El paso 6 verifica con capturas reales que HUD, canvas y modal quedan por encima del fondo.                           |

---

## What is **not** in this spec

- Controles táctiles/móviles.
- Cablear el juego a la ficha `caida` o unificar `caida`/`tetris`.
- Tema claro/oscuro del original.
- `best` en vivo, `plays` real, sonido/audio, dificultad configurable.
- Portar los demás juegos del catálogo.

Cada uno de esos, si se aborda, va en su propio spec.
