# SPEC 05 — Juego Asteroids en canvas real

> **Status:** Aprobado
> **Depends on:** SPEC 01 (MVP visual: HUD, CRT, modal, `.av-player`), SPEC 02 (Home/biblioteca), SPEC 04 (base Supabase — no se usa aquí)
> **Date:** 2026-07-01
> **Objective:** Portar el juego de Asteroids en canvas (`references/started-games/02-asteroids/game.js`) a un módulo TypeScript que corre en una página cliente dedicada `/juego/asteroids/jugar`, integrada con el HUD, el marco CRT y el guardado de puntuaciones de la plataforma, y publicarlo como una ficha nueva `asteroids` en el catálogo.

---

## Scope

**In:**

- **Nueva ficha `asteroids` en el catálogo** (`app/data/games.ts`): entrada en `GAMES` con `id: "asteroids"`, título, descripción corta/larga, `cat`, portada `cover-asteroids`, color, `best`, `plays`. Convive con la ficha existente `rocas` (no se toca).
- **Campo opcional `playHref`** en el tipo `Game`: para `asteroids` apunta a `/juego/asteroids/jugar`; el resto de juegos siguen con el default `/jugar/${id}` (placeholder genérico intacto).
- **Portada CSS `cover-asteroids`** en `app/globals.css`, arte propio pixel/neón (nave triangular + rocas) al estilo de las demás portadas.
- **Enlace del detalle**: `app/juego/[id]/page.tsx` usa `game.playHref ?? `/jugar/${game.id}`` en el botón "JUGAR AHORA". La página de detalle genérica ya funciona para el nuevo `id`.
- **Motor portado a TypeScript** (`game.js` → módulo TS): clases `Bullet`, `Asteroid`, `PowerUp`, `Ship`, `Particle`, bucle `requestAnimationFrame`, colisiones, split de asteroides, partículas, power-up de **disparo triple `3x`**, niveles y vidas internos. Se expone una API para arrancar/pausar/reanudar/reiniciar/forzar fin/redimensionar/destruir y para **emitir el estado** (score, vidas, nivel, `tripleShot`, fase) a React.
- **Página cliente dedicada** `app/juego/asteroids/jugar/page.tsx` (`"use client"`) que monta el `<canvas>` vía `ref`, cablea el motor, y reusa el chrome de la plataforma: **HUD** (`player-hud`: Jugador/Puntuación/Vidas/Nivel + botones **PAUSA/FIN/SALIR**), **marco CRT** (`.crt`/`.crt-screen`/`.crt-bottom`) y **modal "FIN DEL JUEGO"** con input de nombre.
- **HUD alimentado por el motor**: se oculta el HUD interno que dibujaba el canvas (`drawHUD`); Puntuación/Vidas/Nivel/`3x` salen del estado real del juego en el HUD React.
- **Guardado de puntuación**: al game over real, el modal guarda vía `saveScore({ game: "asteroids", score, name })` (localStorage `av_scores`, integrado con el Salón de la Fama).
- **Control de estados por la plataforma**: **PAUSA** congela `update`/`draw` y muestra "EN PAUSA"; **FIN** fuerza el game over y abre el modal; **SALIR** vuelve al detalle. Se desactiva el reinicio interno por ESPACIO y el overlay "GAME OVER" del canvas (los maneja React).
- **Mundo responsive**: el motor deja de usar `W/H` fijos 800×600; mide el contenedor, reescala posiciones proporcionalmente al redimensionar en vivo, y mantiene **velocidades absolutas (px/s)**.
- **Teclado**: flechas (rotar/propulsar) + Espacio (disparar), con `preventDefault` para no hacer scroll de la página.

**Out of scope (specs futuros):**

- **Controles táctiles/móviles** (botones/gestos en pantalla). Diferido pese al "TÁCTIL" del detalle.
- **Cablear el juego real a la ficha `rocas`** o unificar `rocas`/`asteroids`: siguen como fichas separadas.
- **Mover puntuaciones a Supabase**: se sigue usando `saveScore` en localStorage; el leaderboard del detalle sigue con `seededScores` mock.
- **Escalar velocidades/tamaños al tamaño del mundo** o congelar el mundo al iniciar: se usa re-ajuste en vivo con px/s absolutos.
- **Portar los demás juegos** del catálogo a canvas real (siguen con el placeholder `/jugar/[id]`).
- **Sonido / efectos de audio**, tabla de récords online, dificultad configurable.

---

## Data model

Esta feature introduce **una entrada de catálogo** y **un campo opcional** en un tipo existente, más el **contrato interno del motor**. No crea claves nuevas de `localStorage` ni tablas: la persistencia reusa `SavedScore` (`av_scores`) vía `saveScore`.

### 1. Tipo `Game` — nuevo campo opcional

```ts
// app/data/games.ts
export interface Game {
  // ...campos existentes...
  playHref?: string; // destino de "JUGAR AHORA". Default: `/jugar/${id}`.
  // Para asteroids: "/juego/asteroids/jugar"
}
```

### 2. Nueva ficha en `GAMES`

```ts
{
  id: "asteroids",
  title: "ASTEROIDS",
  short: "Rota, propúlsate y pulveriza rocas en gravedad cero.",
  long: "El clásico de culto, real y jugable: pilota una nave triangular por un campo de asteroides toroidal, divídelos en fragmentos cada vez menores y sobrevive con 3 vidas. Recoge el power-up 3x para disparo triple.",
  cat: "SHOOTER",
  cover: "cover-asteroids",
  color: "yellow",
  best: 41200,
  plays: "0",
  playHref: "/juego/asteroids/jugar",
}
```

_(Los valores `best`/`plays` son de escaparate, como el resto del catálogo mock. Ajustables al implementar.)_

### 3. Contrato del motor (módulo TS portado)

```ts
// Estado que el motor emite a React en cada cambio relevante
export type GamePhase = "playing" | "dead" | "paused" | "gameover";

export interface GameState {
  score: number;
  lives: number;
  level: number;
  tripleShot: number; // segundos restantes del power-up 3x (0 = inactivo)
  phase: GamePhase;
}

// Fábrica que ata el motor a un <canvas> ya montado
export interface AsteroidsHandle {
  pause(): void;
  resume(): void;
  restart(): void;
  forceGameOver(): void; // botón FIN
  resize(): void; // re-mide el contenedor y reescala el mundo
  destroy(): void; // cancela el rAF y quita listeners
}

export function createAsteroids(
  canvas: HTMLCanvasElement,
  opts: {
    onState: (s: GameState) => void; // HUD React
    onGameOver: (finalScore: number) => void; // abre el modal
  },
): AsteroidsHandle;
```

### 4. Persistencia (sin cambios de esquema)

```ts
// Reusa el SavedScore existente de ArcadeProvider:
saveScore({ game: "asteroids", score, name }); // → localStorage "av_scores"
```

**Convenciones:**

- El motor es la **fuente de verdad** de score/vidas/nivel; React solo refleja (`onState`) y persiste al final (`onGameOver`).
- `W`/`H` dejan de ser constantes: pasan a leerse del canvas/contenedor y se recalculan en `resize()`. `wrap()`, spawns y `SAFE_DIST` se referencian a las dimensiones vigentes.
- El nombre de guardado sigue la lógica del placeholder: `nameEdit ?? user?.name ?? "INVITADO"`, mayúsculas, máx. 10.

---

## Implementation plan

Cada paso deja el sistema compilando y navegable.

1. **Ficha `asteroids` + campo `playHref` en el catálogo.** En `app/data/games.ts`: añadir `playHref?: string` al tipo `Game` y la nueva entrada `asteroids` (con `playHref: "/juego/asteroids/jugar"`). _Test manual:_ `/biblioteca` muestra la card ASTEROIDS; `/juego/asteroids` renderiza el detalle; `npm run lint` pasa.

2. **Portada `cover-asteroids`.** Añadir la clase en `app/globals.css` con arte pixel/neón propio (nave + rocas), al estilo de las demás `cover-*`. Verificar `z-index`/`position` sobre `av-bg`/`av-noise`. _Test manual:_ la card ASTEROIDS y la portada del detalle muestran arte propio, distinto de `cover-rocas`.

3. **Enlace "JUGAR AHORA" respeta `playHref`.** En `app/juego/[id]/page.tsx`, el botón usa `game.playHref ?? `/jugar/${game.id}``. _Test manual:_ en `/juego/asteroids`, "JUGAR AHORA" apunta a `/juego/asteroids/jugar`; en cualquier otro juego sigue a `/jugar/[id]`.

4. **Portar el motor a TypeScript.** Antes de escribir, revisar el `game.js` original y (por Next 16) confirmar que el módulo es client-only (nada de `document`/`window` en import de servidor). Crear el módulo del motor (p. ej. `app/juego/asteroids/jugar/engine.ts`) portando `Bullet`/`Asteroid`/`PowerUp`/`Ship`/`Particle`, el bucle, colisiones, split, partículas y disparo triple, con tipos estrictos. Cambios respecto al original: `W`/`H` dinámicos leídos del canvas; **quitar `drawHUD`** y el overlay interno "GAME OVER"; **quitar el reinicio por ESPACIO**; exponer `createAsteroids(canvas, { onState, onGameOver })` con `pause/resume/restart/forceGameOver/resize/destroy`; emitir `onState` cuando cambien score/vidas/nivel/`tripleShot`/fase y `onGameOver(finalScore)` al agotar vidas. _Test manual:_ `npm run lint` y `tsc` (build) sin errores; el módulo no rompe el build de servidor.

5. **Página cliente dedicada.** Crear `app/juego/asteroids/jugar/page.tsx` (`"use client"`): monta `<canvas>` con `ref`, en `useEffect` llama `createAsteroids(...)`, guarda el `handle`, y limpia con `handle.destroy()` al desmontar. Reusa el chrome de la plataforma (`.av-player`, `.player-hud`, `.crt`/`.crt-screen`/`.crt-bottom`, `.modal`) tomando como base el placeholder `app/jugar/[id]/page.tsx`, pero **sin** el `setInterval` falso ni la `.game-arena` decorativa: el canvas real ocupa `.crt-screen`. Estado React alimentado por `onState`. _Test manual:_ `/juego/asteroids/jugar` carga, se ve la nave y las rocas moviéndose, sin errores en consola.

6. **HUD y controles de plataforma cableados al motor.** El `player-hud` muestra Puntuación/Vidas/Nivel/`3x` desde `GameState`. **PAUSA** → `pause()`/`resume()` y overlay "EN PAUSA"; **FIN** → `forceGameOver()`; **SALIR** → `router.push("/juego/asteroids")`. Teclado (flechas + Espacio) con `preventDefault` para no scrollear. _Test manual:_ jugar realmente (rotar, propulsar, disparar, partir rocas, coger el 3x); PAUSA congela y reanuda; el HUD refleja los valores reales; la página no hace scroll con las flechas/espacio.

7. **Fin de partida + guardado.** Al `onGameOver`, abrir el modal "FIN DEL JUEGO" con la puntuación real, input de nombre (`nameEdit ?? user?.name ?? "INVITADO"`, mayúsculas, máx 10) y `saveScore({ game: "asteroids", score, name })`. "JUGAR DE NUEVO" → `restart()` y cerrar modal; "VOLVER AL VAULT" → `/biblioteca`. _Test manual:_ al perder las 3 vidas aparece el modal con la puntuación real; guardar la añade al Salón de la Fama (verificable en `/salon`); "JUGAR DE NUEVO" reinicia limpio.

8. **Mundo responsive.** Cablear `resize()` a un `ResizeObserver`/listener del contenedor: re-mide el canvas, reescala posiciones proporcionalmente y mantiene velocidades en px/s. `wrap()`, spawns y `SAFE_DIST` usan las dimensiones vigentes; ajustar `devicePixelRatio` para nitidez. _Test manual:_ redimensionar la ventana durante la partida no deforma la nave ni saca objetos del área; el juego sigue jugable a distintos tamaños.

9. **Verificación y cierre.** Capturas reales con Playwright (→ `.playwright-screenshots`) de: `/biblioteca` con la card, `/juego/asteroids` (detalle+portada), partida en curso, estado PAUSA y modal de fin. Confirmar que nada queda oculto tras `av-bg`/`av-noise`. Ejecutar `npm run build` y `npm run lint`. _Test manual:_ build y lint sin errores; capturas muestran el juego real integrado y jugable.

---

## Acceptance criteria

- [ ] `npm run build` y `npm run lint` terminan sin errores.
- [ ] No hay errores en la consola del navegador al cargar `/juego/asteroids/jugar` ni durante la partida.
- [ ] `/biblioteca` muestra una card **ASTEROIDS** con portada `cover-asteroids` propia (distinta de `cover-rocas`); `/juego/asteroids` renderiza el detalle con esa portada.
- [ ] En `/juego/asteroids`, "JUGAR AHORA" navega a `/juego/asteroids/jugar`; en cualquier otro juego sigue navegando a `/jugar/[id]` (placeholder intacto).
- [ ] En `/juego/asteroids/jugar` se monta el canvas real: la nave rota con `←`/`→`, se propulsa con `↑` y dispara con `Espacio`; los asteroides grandes se parten en medianos y estos en pequeños.
- [ ] El power-up **`3x`** aparece, se recoge y activa disparo triple durante su duración; el HUD muestra el tiempo restante.
- [ ] El HUD de plataforma (Puntuación/Vidas/Nivel) refleja el estado **real** del motor; el canvas **no** dibuja su propio HUD ni el overlay "GAME OVER".
- [ ] **PAUSA** congela el juego y muestra "EN PAUSA"; **REANUDAR** continúa; **FIN** fuerza el fin de partida; **SALIR** vuelve a `/juego/asteroids`.
- [ ] Las teclas de flecha y Espacio **no** hacen scroll de la página.
- [ ] Al perder las 3 vidas se abre el modal "FIN DEL JUEGO" con la puntuación **real**; guardar añade la entrada con `game: "asteroids"` y es visible en `/salon`.
- [ ] "JUGAR DE NUEVO" reinicia una partida limpia (score 0, 3 vidas, nivel 1); "VOLVER AL VAULT" navega a `/biblioteca`.
- [ ] Redimensionar la ventana durante la partida no deforma la nave ni deja objetos fuera del área jugable; el juego sigue jugable a distintos tamaños.
- [ ] Al desmontar la página (navegar fuera) se cancela el `requestAnimationFrame` y se quitan los listeners (sin fugas ni logs de "canvas null").
- [ ] La ficha `rocas` y el placeholder genérico `/jugar/[id]` siguen funcionando sin cambios.

---

## Decisions

- **Sí:** Portar `game.js` a un **módulo TypeScript** con canvas por `ref`. Encaja con `strict` + ESLint del repo y permite exponer el estado a React. **No:** cargar el `game.js` vanilla tal cual; choca con TS estricto y con el acceso global a `document`/`window` en Next 16.
- **Sí:** **Ficha nueva `asteroids`** en el catálogo, conviviendo con `rocas`. **No:** cablear el motor a `rocas` ni renombrarlo; se decidió una identidad propia en inglés para el juego real, dejando `rocas` como ficha mock intacta.
- **Sí:** **Ruta dedicada** `/juego/asteroids/jugar` (segmento propio bajo el detalle) en vez de resolver el placeholder genérico `/jugar/[id]`. **No:** tocar `/jugar/[id]`; el placeholder de los demás juegos queda intacto.
- **Sí:** Campo opcional **`playHref`** en `Game` (default `/jugar/${id}`). Aísla la excepción de asteroids sin ramificar la lógica del detalle. **No:** condicionar por `id === "asteroids"` en el componente; ensucia el render.
- **Sí:** **HUD de la plataforma** alimentado por el motor (fuente de verdad) y se **quita `drawHUD`** del canvas. Coherencia visual con el resto de la plataforma. **No:** mantener el HUD interno del canvas; rompería la estética unificada.
- **Sí:** **Modal de plataforma + `saveScore`** (localStorage `av_scores`) al game over, integrando con el Salón de la Fama. **No:** el overlay interno "GAME OVER / ESPACIO PARA REINICIAR"; no persiste ni integra.
- **Sí:** Control de estados por botones (**PAUSA/FIN/SALIR**) y **desactivar el reinicio por ESPACIO**. El reinicio va por "JUGAR DE NUEVO" del modal. **No:** delegar pausa/reinicio solo al teclado del juego.
- **Sí:** **Mundo verdaderamente responsive** con re-ajuste en vivo y **velocidades absolutas (px/s)**. Simplicidad y fluidez. **No:** escalar velocidades/tamaños al mundo ni congelar el tamaño al iniciar; más cálculo y ajuste de balance del que necesitamos ahora.
- **Sí:** **Solo teclado** en este spec, con `preventDefault` del scroll. **No:** controles táctiles; se difieren a un spec propio pese al "TÁCTIL" que anuncia el detalle.
- **Sí:** Conservar los **power-ups (`3x`)** y el sistema de niveles/vidas internos del `game.js` original. **No:** recortarlos; ya están implementados y aportan al juego.
- **Sí:** **Portada CSS propia `cover-asteroids`** (arte pixel/neón). **No:** reusar `cover-rocas` (dos fichas idénticas) ni un mini-preview del canvas (acopla la card al motor).

---

## Risks

| Riesgo                                                                                                                     | Mitigación                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| El motor accede a `document`/`window` en el import y **rompe el build de servidor** de Next 16.                            | El módulo del motor es client-only y solo se instancia dentro de `useEffect` en una página `"use client"`; el paso 4 lo verifica con `npm run build`.        |
| **Fuga de `requestAnimationFrame`/listeners** al navegar fuera (varios loops corriendo, "canvas null").                    | `destroy()` cancela el rAF y quita los listeners; el `useEffect` lo llama en el cleanup. Hay criterio de aceptación específico.                              |
| Las **flechas/Espacio hacen scroll** de la página o roban foco a otros elementos.                                          | `preventDefault` en los `keydown` relevantes mientras el juego está activo; verificado en el paso 6.                                                         |
| El **mundo responsive** deforma la nave/rocas o saca objetos del área al reescalar (aspecto, `devicePixelRatio`).          | `resize()` re-mide, reescala posiciones proporcionalmente y ajusta `devicePixelRatio`; `wrap`/spawns usan las dimensiones vigentes; verificado en el paso 8. |
| **Desincronización HUD↔motor**: el HUD React se queda atrás respecto a score/vidas/nivel reales.                           | El motor emite `onState` en cada cambio relevante y es la única fuente de verdad; el paso 6 lo comprueba jugando.                                            |
| **`hydration mismatch`** por leer tamaño/estado del cliente en el primer render.                                           | El canvas se mide y el motor se instancia tras montar (`useEffect`); el estado inicial del HUD es determinista (score 0, 3 vidas, nivel 1).                  |
| Contenido de la página dedicada **oculto tras `av-bg`/`av-noise`** por `z-index` mal portado (bug visto en specs previos). | El paso 9 verifica con capturas reales que HUD, canvas y modal quedan por encima del fondo.                                                                  |
| **`dt` desbocado** al volver de una pestaña en segundo plano (spiral-of-death).                                            | Se conserva el cap de `dt` (`Math.min(..., 0.05)`) del original; PAUSA detiene el loop cuando procede.                                                       |

---

## What is **not** in this spec

- Controles táctiles/móviles (botones o gestos en pantalla).
- Cablear el juego real a la ficha `rocas` o unificar `rocas`/`asteroids`.
- Mover puntuaciones a Supabase (sigue `saveScore` en localStorage; leaderboard del detalle sigue mock).
- Escalar velocidades/tamaños al tamaño del mundo o congelar el mundo al iniciar.
- Portar los demás juegos del catálogo a canvas real.
- Sonido/audio, récords online, dificultad configurable.

Cada uno de esos, si se aborda, va en su propio spec.
