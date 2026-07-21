---
name: nuevo-juego
description: Diseña el spec de integración de un juego jugable con su leaderboard en Arcade Vault, siguiendo el patrón de SPEC 05 + SPEC 06 y usando la skill /spec como referencia de formato. NO escribe código ni toca la base de datos — solo produce el archivo de especificación en specs/ y luego recomienda revisarlo y ejecutar la implementación aparte con /spec-impl.
disable-model-invocation: true
argument-hint: "<slug-del-juego> o descripción corta del juego"
---

# /nuevo-juego — Diseñador de specs de integración de juegos

Esta skill **diseña el spec** para integrar un juego jugable con su leaderboard en Arcade Vault
(motor en canvas real + página cliente + ficha de catálogo + portada CSS + leaderboard en
Supabase), aplicando el patrón que las specs **05** (juego Asteroids en canvas) y **06**
(catálogo y leaderboard en Supabase) dejaron establecido para `asteroids`.

**Aquí no se escribe código.** El único artefacto que produces es el archivo `.md` del spec en
`specs/`. La implementación la hace el usuario después, revisando el spec y ejecutando
`/spec-impl`. El valor de esta skill es entregar un spec **sin ambigüedad**: que quien lo
implemente (persona o `/spec-impl`) no tenga que adivinar ni una decisión.

El juego **puede venir o no** de `references/started-games/`:

- **Portar** — existe un `game.js` vanilla (p. ej. `03-tetris`, `04-arkanoid`): el spec describe
  cómo trasladar su física a un motor TypeScript.
- **Andamiar** — no hay fuente: el spec describe el motor mínimo a construir desde la descripción.

## Filosofía

El patrón ya existe: `asteroids` es la plantilla viva y las specs 05/06 son los modelos de
contenido. Tu trabajo **no** es inventar arquitectura, es **capturar todas las decisiones** de
este juego concreto en un spec que respete ese patrón. Un spec vago hace que la implementación
improvise; por eso esta skill es **deliberadamente lenta en las preguntas** y termina en cuanto el
spec está escrito.

**Frontera que el spec siempre documenta:** el motor es headless (TypeScript, client-only), no
sabe nada de React salvo el `canvas` que recibe y el `GameState` que emite; React no sabe nada de
la lógica salvo el `GameState` que pinta. Esa frontera es lo que el spec describe para cada juego.

## Restricciones del repo que el spec debe recoger

El spec debe dejar constancia explícita de estas restricciones (para que la implementación las
respete), pero **esta skill no las ejecuta**:

- **Next.js 16.** La implementación deberá leer `node_modules/next/dist/docs/` antes de tocar
  código de Next (App Router, `"use client"`, `use(params)`). El spec lo anota como restricción.
- **Motor client-only.** El módulo del motor no debe acceder a `document`/`window` en el import;
  se instancia dentro de `useEffect` en una página `"use client"`. El spec lo anota como riesgo.
- **Portada con `/frontend-design`.** El plan del spec debe indicar que el arte de `cover-<slug>`
  se diseña invocando la skill `/frontend-design` durante la implementación.
- **Idioma.** Responde siempre en el idioma del prompt inicial (español en este repo).

## Flujo por fases

Sigue las fases **en orden estricto**. No avances si la fase anterior no quedó cerrada.

Lee `checklist.md` (en esta misma carpeta) antes de la Fase 3: contiene el checklist técnico de
porteo del motor, la plantilla del contrato y la plantilla SQL de seed. Es la **fuente de detalle**
que debes verter en el spec (Data model + Implementation plan) para que la implementación no tenga
que consultarla: el spec debe bastarse por sí solo.

---

### Fase 1 — Contexto e identidad del juego

1. Lee `CLAUDE.md` y `AGENTS.md` para reconfirmar convenciones (Next 16, skills, dominio).
2. Lee los modelos: `specs/05-juego-asteroids-canvas.md` y `specs/06-catalogo-y-leaderboard-supabase.md`.
   Si existen specs de otros juegos ya integrados (p. ej. `07-...`), léelos también: fijan el nivel
   de detalle y las convenciones que tu spec debe igualar.
3. **Determina el origen.** Mira si existe `references/started-games/NN-<x>/game.js` que corresponda:
   - Si existe → modo **portar**. Lee su `game.js`, su `CLAUDE.md` y su `index.html` para entender
     clases, estado, loop, constantes, controles y cómo pinta el HUD. Este análisis alimenta las
     preguntas de la Fase 2.
   - Si no existe → modo **andamiar**. Trabaja desde la descripción del usuario.
4. **Comprueba colisiones de `slug`:** que no exista ya en `GAMES` (`app/data/games.ts`) ni en la
   tabla `public.games` de Supabase (consulta de **solo lectura** con `execute_sql` o `list_tables`).

---

### Fase 2 — Clarificación: preguntar hasta eliminar toda ambigüedad

**Esta es la fase más importante.** Tu objetivo es que, al terminar, puedas responder sin asumir
nada: (a) qué archivos aparecen o cambian, (b) cuál es el primer paso ejecutable y cuál el último,
(c) cómo se verifica que está terminado. Si no puedes responder alguna, sigue preguntando.

**Cómo preguntar:**

- Pregunta en **bloques de 3 a 5** preguntas, no una suelta tras otra. Tras cada bloque, espera
  respuesta antes de seguir.
- Preguntas **concretas con opciones**, no abiertas. Cuando ofrezcas opciones, da 2–4, marca tu
  recomendación y por qué. Usa la herramienta de preguntas del entorno cuando aporte claridad.
- Propón un valor por defecto sensato para lo trivial (tomándolo del patrón de `asteroids` y del
  catálogo) y **confírmalo**, en vez de dejarlo en blanco.

**Categorías que SIEMPRE debes cubrir** (no cierres la fase con alguna sin resolver):

1. **Identidad de catálogo.** `slug` (id/URL), `title` (mayúsculas), `cat`
   (`ARCADE|PUZZLE|SHOOTER|VERSUS`), `color` (`cyan|magenta|yellow|green`), `short` (card),
   `long` (detalle), `best` y `plays` (escaparate), `cover` = `cover-<slug>`.
2. **Convivencia con el catálogo existente.** ¿Ficha **nueva** propia (como `asteroids` junto a
   `rocas`) o **cablear** un mock existente (p. ej. Tetris → `caida`)? Decide y registra por qué.
3. **Origen y alcance del porteo.** Portar `game.js` (¿cuál?) o andamiar. Si se porta: ¿se copia la
   física **1:1**? ¿Qué se elimina del original (HUD DOM, overlays, reinicio/pausa por tecla, temas)?
4. **Contrato `GameState`.** ¿Qué estadísticas expone el juego? (score siempre; ¿`lives`, `lines`,
   `level`, power-ups, combo…?). **Mapeo del HUD:** si no tiene "Vidas", ¿qué muestra ese hueco?
5. **Fases del juego.** ¿Necesita una fase intermedia tipo `dead`/respawn (como Asteroids) o el fin
   es directo `playing → gameover` (como Tetris)?
6. **Controles.** ¿Qué teclas usa cada acción? ¿Cuáles requieren `preventDefault` para no scrollear?
   ¿Hay acciones mantenidas (held) vs pulsaciones discretas?
7. **Render y layout responsive.** ¿El área de juego encaja en la pantalla CRT (aspecto ~4/3) o es
   portrait/otro aspecto que exige **letterboxing** y centrado? ¿Hay paneles auxiliares (siguiente
   pieza, vidas, etc.) que se dibujan dentro del mismo canvas? ¿`devicePixelRatio`?
8. **Mecánicas especiales a conservar.** Power-ups, niveles, dificultad creciente, piezas/enemigos
   especiales, físicas concretas: ¿cuáles se mantienen tal cual?
9. **Persistencia y leaderboard.** Confirmar `insertScore({ gameId: "<slug>", ... })`, seed de ~12
   filas con `seededScores(slug.length*17+3, 12)` para paridad BD↔fallback, y valores de escaparate.
10. **Portada.** Dirección de arte para `cover-<slug>` (motivo, colores), distinta de las existentes.
11. **Fuera de alcance.** Qué se difiere explícitamente (táctil, sonido, récords online, etc.).
12. **Decisiones cerradas.** Cualquier decisión que el usuario ya tomó y no quiere reabrir.

**Cuándo parar:** cuando las tres preguntas del inicio de esta fase tengan respuesta sin suposiciones.

---

### Fase 3 — Redactar el spec sección por sección

Usa la skill `/spec` como referencia de método y formato:

- Lee `.claude/skills/spec/SKILL.md` (su método) y `.claude/skills/spec/template.md` (la estructura
  exacta: Header, Scope In/Out, Data model, Implementation plan, Acceptance criteria, Decisions, Risks).
- Desarrolla el spec **sección por sección**, mostrando cada una y esperando confirmación antes de la
  siguiente (como hace `/spec`). No lo generes todo de una sola vez.

El spec debe quedar **autosuficiente para implementar sin preguntar**. Como mínimo:

- **Header:** `Status: Borrador`, `Depends on:` SPEC 05 y SPEC 06, fecha actual, objetivo de una frase.
- **Scope:** In = motor `app/juego/<slug>/jugar/engine.ts`, página `page.tsx`, ficha en `GAMES`,
  portada `cover-<slug>`, fila en `games` + seed de `scores`. Out = lo diferido (Fase 2, cat. 11).
- **Data model:** la entrada de `Game` concreta (con `playHref`), el `GameState` exacto del juego
  (campos de la Fase 2, cat. 4), el contrato `createX(canvas, { onState, onGameOver })` y el `Handle`.
  Vierte aquí el detalle de `checklist.md` (contrato + convenciones) para que no haya que consultarlo.
- **Implementation plan:** pasos numerados que reproducen el patrón (motor → página → ficha → portada
  → Supabase → verificación), cada uno dejando el sistema compilando. Incorpora las 10 transformaciones
  de porteo y la plantilla SQL de seed de `checklist.md`, e indica invocar `/frontend-design` para la
  portada y Playwright para la verificación.
- **Acceptance criteria:** checklist booleano derivado de SPEC 05 + 06 para este juego concreto.
- **Decisions / Risks:** todas las decisiones tomadas en la Fase 2 (con su porqué) y los riesgos
  (client-only, fugas de rAF, paridad BD↔fallback, z-index sobre `av-bg`/`av-noise`, layout responsive).

**Guardado (convención de `/spec`):** determina el siguiente número secuencial mirando `specs/`, usa
el `<slug>` del juego como slug del archivo, **confirma el nombre `specs/NN-<slug>.md` con el usuario**
y escríbelo en estado `Borrador`.

---

### Fase 4 — Cierre: revisión manual e implementación aparte

Una vez guardado el spec, **termina aquí**. Muestra al usuario:

```
✅ Spec creado: specs/NN-<slug>.md   (estado: Borrador)

Siguientes pasos (manuales):
  1. Revisa el spec de arriba a abajo. Ajusta lo que no encaje.
  2. Cuando estés conforme, cambia su estado a "Aprobado" (lo hace la persona, no el agente).
  3. Ejecuta /spec-impl NN-<slug> para implementarlo paso a paso.
```

**No implementes nada.** No crees `engine.ts`/`page.tsx`, no edites `games.ts`/`globals.css`, no
apliques migraciones a Supabase, no lances Playwright. Tu trabajo acaba cuando el spec está escrito
y has recomendado la revisión manual y `/spec-impl`.

## Reglas duras

- **Nunca escribas código en esta skill.** El único archivo que creas es el `.md` del spec.
- **Nunca toques la base de datos** (ni `apply_migration` ni `execute_sql` de escritura). Las lecturas
  de la Fase 1 son solo para comprobar colisiones de `slug`.
- **Nunca propongas ni empieces la implementación tras guardar el spec.** El usuario ejecuta
  `/spec-impl` cuando quiera.
- **Nunca asumas decisiones que el usuario no confirmó.** Si falta información, pregunta (Fase 2).
- **Nunca generes el spec entero de una vez.** Sección por sección, con confirmación (Fase 3).
- **No toques lo existente** (`rocas`, `asteroids`, `caida`, el placeholder `/jugar/[id]`, etc.); el
  spec convive con ellos, no los modifica.

## Argumentos

- `/nuevo-juego caida` → usa `caida`/`tetris` como `slug` propuesto; busca fuente en
  `references/started-games/` y arranca la Fase 1, luego clarifica (Fase 2) y redacta el spec.
- `/nuevo-juego` sin argumentos → empieza pidiendo la identidad del juego y el origen.
