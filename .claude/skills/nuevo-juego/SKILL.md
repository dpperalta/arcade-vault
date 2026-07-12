---
name: nuevo-juego
description: Integra un juego jugable con su leaderboard en Arcade Vault siguiendo el patrón de SPEC 05 + SPEC 06. Escribe primero un spec en specs/ usando la skill /spec como referencia, y luego porta un game.js de references/started-games o andamia uno nuevo, crea el motor TS, la página cliente, la ficha de catálogo, la portada CSS y siembra el leaderboard en Supabase.
disable-model-invocation: true
argument-hint: "<slug-del-juego> o descripción corta del juego"
---

# /nuevo-juego — Integrador de juegos jugables en Arcade Vault

Esta skill integra **un** juego jugable, de punta a punta, en la plataforma Arcade Vault:
motor en canvas real + página cliente + ficha de catálogo + portada CSS + leaderboard en
Supabase. Automatiza el patrón que las specs **05** (juego Asteroids en canvas) y **06**
(catálogo y leaderboard en Supabase) ya dejaron implementado para `asteroids`.

El juego **puede venir o no** de `references/started-games/`:

- **Portar** — existe un `game.js` vanilla (p. ej. `03-tetris`, `04-arkanoid`): se traslada su
  física a un motor TypeScript.
- **Andamiar** — no hay fuente: se crea un motor mínimo desde la descripción, respetando el
  mismo contrato.

## Filosofía

`asteroids` **ya es la plantilla viva**. No inventes una arquitectura nueva: lee los archivos
reales de `asteroids` y reprodúcelos con los cambios propios del juego. El valor de esta skill
es aplicar el mismo patrón sin volver a leer dos specs ni improvisar la frontera motor↔React.

**Frontera que siempre se respeta:** el motor es headless (TypeScript, client-only), no sabe
nada de React salvo el `canvas` que recibe y el `GameState` que emite; React no sabe nada de la
lógica salvo el `GameState` que pinta. Esa frontera es lo que se replica para cada juego.

## Reglas duras del repo (no negociables)

- **Next.js 16.** Antes de escribir o cambiar código de Next, lee la guía relevante en
  `node_modules/next/dist/docs/` (App Router, `"use client"`, `use(params)`). Hay breaking
  changes respecto a versiones anteriores.
- **Motor client-only.** El módulo del motor **no** accede a `document`/`window` en el import;
  todo el acceso al DOM ocurre dentro de `createX(canvas, ...)`, instanciado en un `useEffect`
  de una página `"use client"`. De lo contrario rompe el build de servidor.
- **Portada con `/frontend-design`.** El arte de la portada `cover-<slug>` se diseña invocando
  la skill `/frontend-design` de Anthropic (regla del `CLAUDE.md`).
- **Idioma.** Responde siempre en el idioma del prompt inicial (español en este repo).
- **Formato/lint.** Un hook `PostToolUse` formatea y lintea tras cada Write/Edit. Deja el
  sistema compilando y navegable en cada fase.

## Flujo por fases

Sigue las fases **en orden estricto**. **Pausa tras cada fase** para que el usuario revise el
diff antes de continuar (igual que `/spec-impl`). No avances si la fase anterior no quedó bien.

**Esta skill es spec-driven.** Antes de escribir una sola línea de implementación, la **Fase 2**
crea el archivo de especificación del juego en `specs/`, leyendo y siguiendo como referencia la
skill `/spec` del repo. Las fases de implementación (3 en adelante) ejecutan **ese** spec.

Lee `checklist.md` (en esta misma carpeta) antes de la Fase 3 (motor): contiene el checklist
técnico de porteo del motor, la plantilla del contrato y la plantilla SQL de seed.

---

### Fase 1 — Contexto e identidad del juego

1. Lee `CLAUDE.md` y `AGENTS.md` para reconfirmar convenciones (Next 16, skills, dominio).
2. Reúne la identidad del juego. Si el argumento no la trae, **pregunta en un bloque** (no una
   pregunta suelta tras otra):
   - `slug` — id en minúsculas y sin espacios, usado en la URL `/juego/<slug>` y como `game_id`.
   - `title` — en mayúsculas, estilo del catálogo (p. ej. `CAÍDA`).
   - `cat` — una de: `ARCADE`, `PUZZLE`, `SHOOTER`, `VERSUS`.
   - `color` — uno de: `cyan`, `magenta`, `yellow`, `green` (color del botón JUGAR).
   - `short` — descripción de una línea para la card.
   - `long` — descripción de párrafo para el detalle.
   - `cover` — siempre `cover-<slug>`.
   - `best` y `plays` — valores de escaparate (mock), como el resto del catálogo.
3. **Determina el origen.** Mira si existe `references/started-games/NN-<x>/game.js` que
   corresponda al juego:
   - Si existe → modo **portar**. Lee su `game.js`, su `CLAUDE.md` y su `index.html` para
     entender clases, estado, loop, constantes y cómo pinta el HUD.
   - Si no existe → modo **andamiar**. Acláralo con el usuario y trabaja desde la descripción.
4. **Comprueba colisiones de `slug`:** que no exista ya en `GAMES` (`app/data/games.ts`) ni en la
   tabla `public.games` de Supabase (usa `execute_sql` de solo lectura o `list_tables`).

Confirma al usuario la identidad recogida y el modo (portar/andamiar) antes de seguir.

---

### Fase 2 — Especificación en `specs/` (leyendo la skill `/spec`)

Antes de implementar, escribe el spec del juego siguiendo el método spec-driven del repo.

1. **Lee la skill `/spec` como referencia obligatoria:**
   - `.claude/skills/spec/SKILL.md` — su método (fases, tono de preguntas, cómo desarrolla las
     secciones, cómo numera y guarda en `specs/`).
   - `.claude/skills/spec/template.md` — la **estructura exacta** que debe tener el spec (header con
     estado/dependencias/fecha/objetivo de una frase, Scope con "In"/"Out", Data model, Implementation
     plan, Acceptance criteria, Decisions, Risks).
2. **Usa `specs/05-juego-asteroids-canvas.md` y `specs/06-catalogo-y-leaderboard-supabase.md` como
   modelos de contenido**: son specs del mismo dominio (integrar un juego + su leaderboard). El spec
   nuevo es esencialmente "SPEC 05 + 06 aplicadas a `<slug>`". Reaprovecha su forma y su nivel de detalle.
3. **Redacta el spec del juego** respetando el `template.md`. Debe cubrir, como mínimo:
   - **Header:** `Status: Borrador`, `Depends on:` SPEC 05 y SPEC 06, fecha actual, objetivo de una frase.
   - **Scope:** In = motor `engine.ts`, página `/juego/<slug>/jugar`, ficha en `GAMES`, portada
     `cover-<slug>`, fila en `games` + seed de `scores`. Out = controles táctiles, sonido, y lo que las
     specs 05/06 dejaron fuera.
   - **Data model:** la entrada de `Game` concreta (con `playHref`), el `GameState` propio del juego, y
     el contrato `createX(canvas, { onState, onGameOver })`.
   - **Implementation plan:** los pasos que ejecutarán las Fases 3–8 de esta skill (motor → página →
     ficha → portada → Supabase → verificación), cada uno dejando el sistema compilando.
   - **Acceptance criteria:** checklist booleano derivado de los criterios de SPEC 05 + 06 para este juego.
   - **Decisions / Risks:** decisiones propias (modo portar/andamiar, campos del `GameState`) y riesgos
     (client-only, fugas de rAF, paridad BD↔fallback, z-index sobre `av-bg`/`av-noise`).
4. **Sigue las convenciones de guardado de `/spec`:** determina el siguiente número secuencial mirando
   `specs/`, genera el slug (usa el `<slug>` del juego), y **confirma el nombre del archivo con el
   usuario** antes de escribir `specs/NN-<slug>.md`. Guárdalo en estado `Borrador`.
5. **Muestra el spec al usuario y espera su visto bueno.** A diferencia del `/spec` autónomo (que se
   detiene tras guardar), aquí el flujo **continúa**: una vez el usuario aprueba el spec, avanza a la
   Fase 3 e implementa siguiendo su Implementation plan. Si el usuario pide cambios, edítalo antes de seguir.

_Nota:_ el `PostToolUse` de formato aplica también a `.md`. No invoques `/spec-impl`: esta skill hace la
implementación directamente en sus fases siguientes.

---

### Fase 3 — Motor `app/juego/<slug>/jugar/engine.ts`

Usa `app/juego/asteroids/jugar/engine.ts` como **plantilla viva** (léelo entero). Aplica el
**checklist de porteo** de `checklist.md`. Puntos clave:

- Define el **contrato**: `GamePhase`, `GameState` (campos propios del juego — p. ej. tetris →
  `{ score, lines, level, phase }`), `<X>Handle` con `pause/resume/restart/forceGameOver/resize/destroy`,
  y `<X>Options` con `onState(s)` y `onGameOver(finalScore)`.
- **Modo portar:** copia la física y las clases **1:1** de `game.js`; sustituye las constantes
  globales `W`/`H`/`ctx` por un objeto `World { W, H, ctx, keys }` que se pasa a cada
  `update(dt, w)` / `draw(w)`; encapsula todo el estado en **closures** dentro de
  `createX(canvas, opts)` (nada de estado a nivel de módulo). **Elimina del original**
  `drawHUD`/iconos de vida, el overlay interno "GAME OVER" y el reinicio por tecla.
- **Modo andamiar:** implementa el motor mínimo desde la descripción, respetando el mismo
  contrato y las mismas piezas (loop, colisiones, estado).
- **En ambos modos, añade:**
  - `resize()` con `devicePixelRatio`: mide `getBoundingClientRect()`, fija
    `canvas.width = cssW * dpr`, aplica `ctx.setTransform(dpr,0,0,dpr,0,0)` y **reescala las
    posiciones proporcionalmente** (`sx = cssW/oldW`), manteniendo velocidades en **px/s absolutos**.
  - `emitState()` con **dedupe por clave string** (solo llama `onState` cuando cambia un valor
    relevante; evita re-renders a 60 fps). `force=true` en transiciones (pause/resume/restart).
  - Loop con `requestAnimationFrame` que **dibuja siempre** y hace `update(dt)` **solo si no
    `paused`**, con `dt` capado a `Math.min(..., 0.05)`.
  - `GAME_KEYS` (las teclas del juego) con `e.preventDefault()` en keydown/keyup para no
    scrollear la página.
  - `destroy()` que hace `cancelAnimationFrame` y quita los listeners.

_Test:_ `npm run lint` y `npm run build` sin errores; el módulo no accede a `document`/`window`
en el import.

---

### Fase 4 — Página cliente `app/juego/<slug>/jugar/page.tsx`

Copia `app/juego/asteroids/jugar/page.tsx` (es prácticamente un template) y ajusta:

- Import del motor (`createX`, `<X>Handle`, `GameState`) desde `./engine`.
- El `id`/`slug` del juego y `const GAME = GAMES.find((g) => g.id === "<slug>")!`.
- Los campos del HUD específicos del juego (p. ej. tetris muestra `Líneas` en vez de `Vidas`).
- `router.push("/juego/<slug>")` en el botón **SALIR**.

Reutiliza el chrome existente **tal cual** (`.av-player`, `.player-hud`, `.crt`/`.crt-screen`/
`.crt-bottom`, `.modal-bd`/`.modal`). Monta el motor en un `useEffect` con `canvasRef`, guarda el
`handle`, cablea un `ResizeObserver` a `handle.resize()`, y limpia con `ro.disconnect()` +
`handle.destroy()`. Botones PAUSA/REANUDAR, FIN (`forceGameOver`), SALIR. Al `onGameOver`, abre el
modal "FIN DEL JUEGO" y guarda con
`insertScore({ gameId: "<slug>", playerName: name, score: finalScore })`
(`name = nameEdit ?? user?.name ?? "INVITADO"`, mayúsculas, máx. 10). "JUGAR DE NUEVO" →
`restart()`; "VOLVER AL VAULT" → `/biblioteca`.

_Test:_ `/juego/<slug>/jugar` carga, se ve el juego moverse, sin errores en consola; flechas/espacio
no scrollean; PAUSA congela y reanuda.

---

### Fase 5 — Ficha de fallback en `app/data/games.ts`

Añade la entrada al array `GAMES` con todos los campos recogidos en la Fase 1,
`cover: "cover-<slug>"` y `playHref: "/juego/<slug>/jugar"`. Es la **red de seguridad** cuando la
BD cae: debe replicar **exactamente** los valores que se sembrarán en la tabla `games` (Fase 7).
No toques las fichas existentes.

_Test:_ `/biblioteca` muestra la card; `/juego/<slug>` renderiza el detalle; "JUGAR AHORA" apunta a
`/juego/<slug>/jugar`; `npm run lint` pasa.

---

### Fase 6 — Portada `.cover-<slug>` en `app/globals.css`

Invoca **`/frontend-design`** y crea arte pixel/neón propio siguiendo el patrón de las demás
`cover-*`: un `background` (gradiente base) + pseudo-elemento `::after` con capas de
`radial-gradient`/`repeating-linear-gradient`, y opcional `::before` para una figura/glifo con
`clip-path` + `drop-shadow` neón. Debe ser distinta de las portadas existentes. Verifica
`z-index`/`position` para que quede por encima de `av-bg`/`av-noise`.

_Test:_ la card y la portada del detalle muestran arte propio, no un bloque vacío ni oculto.

---

### Fase 7 — Supabase: catálogo + leaderboard sembrado (auto vía MCP)

Aplica los cambios con `apply_migration` (una migración con nombre descriptivo, p. ej.
`add_game_<slug>`). Sigue la **plantilla SQL** de `checklist.md`:

1. **Insertar la fila del catálogo** en `public.games` con **los mismos valores** que la ficha de
   la Fase 5. `sort_order` = siguiente entero (consulta el máximo actual). `play_href =
'/juego/<slug>/jugar'`. Respeta los `check` de `cat` y `color`.
2. **Sembrar ~12 filas** en `public.scores` para `game_id = '<slug>'`, `user_id = null`. Para que
   la BD y el fallback (`seededScores(slug.length*17+3, 12)`) muestren el **mismo** leaderboard,
   **genera las filas con la lógica real de `seededScores`**: corre un script Node que importe/replique
   `app/data/scores.ts`, produzca las 12 filas (`name`, `score`) y emita el `INSERT` con esos valores
   exactos. No uses un `generate_series` con valores arbitrarios (rompería la paridad BD↔fallback).
   Ver `checklist.md` para el script y el SQL.
3. **Verifica** con `get_advisors` (categoría `security`) que no aparecen tablas sin RLS ni
   hallazgos nuevos.

_Test:_ `select * from scores where game_id='<slug>' order by score desc` devuelve ~12 filas; la
fila de `games` existe con `sort_order` correcto.

---

### Fase 8 — Verificación y cierre

1. `npm run build` y `npm run lint` sin errores.
2. Capturas reales con Playwright (guárdalas en `.playwright-screenshots`) de:
   `/biblioteca` (card), `/juego/<slug>` (detalle + portada + leaderboard real), partida en curso,
   estado PAUSA y modal de fin. **Verifica píxeles, no DOM** (el bug clásico de este repo es
   contenido oculto tras `av-bg`/`av-noise`).
3. Juega de verdad: comprueba HUD real, pausa, fin de partida e inserción de puntuación
   (visible en `/salon` de ese juego tras recargar).

Cierra confirmando los criterios cumplidos y qué archivos se crearon/tocaron.

## Reglas al implementar

- **Reproduce el patrón de `asteroids`, no reinventes.** Ante una duda de arquitectura, mira cómo
  lo resolvió `asteroids` y hazlo igual.
- **Física intacta al portar.** Si portas, la física/clases se copian 1:1; solo se parametriza
  `W/H`→`World`, se quita el render de HUD/overlay y se envuelve en la fábrica. No "mejores" la
  jugabilidad por sorpresa.
- **BD y fallback siempre en paridad.** Los valores de la fila `games` (Fase 7) y de la ficha
  `GAMES` (Fase 5) deben ser idénticos; el seed de scores usa la misma semilla que el fallback.
- **Una ambigüedad = una pausa.** Si el juego necesita un campo de `GameState` que no encaja
  (p. ej. no tiene "vidas"), para, propón 2-3 opciones y espera decisión.
- **No toques lo existente.** `rocas`, `asteroids`, el placeholder `/jugar/[id]` y los demás
  juegos quedan intactos.

## Argumentos

- `/nuevo-juego caida` → usa `caida` como `slug` propuesto; busca fuente en
  `references/started-games/` (tetris) y arranca la Fase 1 confirmando el resto de la identidad,
  antes de escribir el spec en la Fase 2.
- `/nuevo-juego` sin argumentos → empieza pidiendo la identidad del juego y el origen.
