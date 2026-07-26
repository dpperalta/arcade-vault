# SPEC 10 — Controles táctiles móviles para los juegos

- **Estado:** Implementado
- **Fecha:** 2026-07-22
- **Depende de:** SPEC 05 (patrón motor/página en canvas), 07, 08, 09 (los cuatro juegos jugables) y de la convención de skins por engine.
- **Objetivo (una frase):** Que los cuatro juegos jugables (Asteroids, Tetris, Arkanoid, Snake) se puedan jugar en un teléfono táctil en vertical, mostrando en dispositivos `pointer: coarse` un mando en pantalla (cruceta de 4 direcciones + 2 botones) bajo el canvas que inyecta input en el motor existente, sin alterar la jugabilidad ni la experiencia en desktop.

---

## Alcance

### Dentro de este spec

- **Los 4 juegos jugables**: `app/juego/{asteroids,tetris,arkanoid,snake}/jugar/`.
- **Input táctil**: nuevo método genérico `input(code: string, down: boolean)` en cada `Handle`, que reutiliza la lógica de teclado existente (`onKeyDown`/`onKeyUp`, `world.keys`, `justPressed`).
- **Mando en pantalla**: componente React compartido (overlay) con cruceta de 4 direcciones + 2 botones de acción, etiquetados por juego, que llama a `input(...)`. Direcciones/botones no usados por un juego se muestran atenuados e inertes.
- **Layout responsivo de la ruta de juego** solo cuando `pointer: coarse`: HUD compacto arriba (con PAUSA/FIN/SALIR compactados y, donde exista, el selector de SKIN convertido a lista desplegable), canvas en medio, mando abajo. Diseñado para **vertical (portrait)**.
- **Verificación visual** con capturas en viewport móvil (Playwright).

### Fuera de este spec (NO se hace aquí)

- **No** se rediseñan biblioteca, salón, home, auth, ni las fichas de catálogo — solo `/juego/<slug>/jugar/`.
- **No** se optimiza para horizontal (landscape): funcionará sin romperse, pero sin layout dedicado, sin bloqueo ni aviso de "gira el teléfono".
- **No** se altera la jugabilidad, física, dificultad ni el sistema de puntuación de ningún juego.
- **No** se crean selectores de SKIN nuevos: la lista desplegable solo aplica donde ya existe (hoy Asteroids).
- **No** se toca Supabase, el catálogo (`GAMES`), ni el leaderboard.
- **No** se añaden gestos sobre el canvas (swipe/tap/arrastrar); el control es exclusivamente el mando en pantalla.

---

## Modelo de datos

Este spec introduce dos estructuras nuevas (ambas de configuración de UI, ninguna persistida):

### 1. Ampliación del `Handle` de cada motor

Cada uno de los cuatro `*Handle` (`AsteroidsHandle`, `TetrisHandle`, `ArkanoidHandle`, `SnakeHandle`) suma un método:

```ts
input(code: string, down: boolean): void;
```

- `code` es un `KeyboardEvent.code` (p. ej. `"ArrowLeft"`, `"Space"`, `"KeyX"`).
- Internamente enruta al **mismo** camino que el teclado (`onKeyDown`/`onKeyUp`), de modo que respeta `justPressed`, `preventDefault` de `GAME_KEYS` y el estado `world.keys` sin duplicar lógica.

### 2. Config del mando por juego (`TouchGamepad`)

Estructura que describe qué botones se activan y qué `code` inyecta cada uno. Vive junto al componente compartido:

```ts
type PadDir = "up" | "down" | "left" | "right";

interface PadButton {
  label: string; // etiqueta visible: "A", "B", "↻", "⤓", …
  code: string; // KeyboardEvent.code que inyecta al motor
  hold?: boolean; // true = mantener (down/up); false = pulso (tap)
}

interface GamepadConfig {
  dirs: Partial<Record<PadDir, string>>; // dirección → code; ausente = flecha atenuada/inerte
  a: PadButton | null; // botón A (null = atenuado/inerte)
  b: PadButton | null; // botón B
}
```

Mapa concreto por juego:

| Juego     | ← / →                                   | ↑                      | ↓                          | A                        | B                                  |
| --------- | --------------------------------------- | ---------------------- | -------------------------- | ------------------------ | ---------------------------------- |
| Asteroids | girar (`ArrowLeft`/`ArrowRight`)        | propulsión (`ArrowUp`) | —                          | Disparar (`Space`, hold) | Hiperespacio/escudo (según engine) |
| Tetris    | mover (`ArrowLeft`/`ArrowRight`)        | rotar (`ArrowUp`)      | bajada suave (`ArrowDown`) | Rotar `↻` (`KeyX`, tap)  | Hard-drop `⤓` (`Space`, tap)       |
| Arkanoid  | mover paleta (`ArrowLeft`/`ArrowRight`) | —                      | —                          | Lanzar (`Space`, tap)    | inerte                             |
| Snake     | dirección (`ArrowLeft`/`ArrowRight`)    | dirección (`ArrowUp`)  | dirección (`ArrowDown`)    | inerte                   | inerte                             |

Los `code` exactos del botón B de Asteroids se confirmarán leyendo su `engine.ts` durante la implementación (usar la tecla que ya tenga asignada; si no existe hiperespacio/escudo, el botón B queda inerte).

---

## Plan de implementación

Cada paso deja el sistema funcional y verificable.

**Paso 1 — Método `input()` en los 4 motores.**
En cada `engine.ts`, refactorizar `onKeyDown`/`onKeyUp` para que el manejo del estado de tecla viva en una función interna reutilizable (p. ej. `applyKey(code, down)`), y exponer `input(code, down)` en el `Handle` que llame a esa función. Los listeners de teclado siguen funcionando igual. Verificación: el teclado sigue jugando idéntico en desktop; `handle.input("ArrowLeft", true)` mueve como la flecha.

**Paso 2 — Componente compartido `TouchGamepad`.**
Crear `app/components/TouchGamepad.tsx` (`"use client"`): recibe un `GamepadConfig` y una función `onInput(code, down)`. Renderiza cruceta de 4 flechas + botones A/B; direcciones/botones sin `code` salen atenuados e inertes. Botones `hold` disparan `down` en `pointerdown`/`pointerup`/`pointercancel`/`pointerleave`; botones tap disparan un pulso `down`+`up`. `touch-action: none` y `preventDefault` para evitar scroll/zoom al jugar. Verificación: montado en una página de prueba, pulsar flechas/botones llama a `onInput` con los `code` correctos.

**Paso 3 — Detección `pointer: coarse` y cableado en las 4 páginas.**
En cada `page.tsx`, detectar dispositivo táctil con `window.matchMedia("(pointer: coarse)")` (hook cliente, reactivo). Cuando es táctil, renderizar `<TouchGamepad>` con la config del juego, pasando `onInput={(c,d) => handleRef.current?.input(c,d)}`. En desktop no se monta nada. Verificación: en viewport desktop no aparece el mando; en emulación móvil sí, y mueve la nave/pieza/paleta/serpiente.

**Paso 4 — Layout responsivo de la ruta de juego (portrait).**
En `app/globals.css`, dentro de `@media (pointer: coarse)` (o combinada con ancho), reestructurar `.av-player`: HUD compacto arriba (stats en fila condensada, PAUSA/FIN/SALIR compactados, selector de SKIN → `<select>` donde exista), canvas con altura acotada al viewport, mando abajo. Asegurar que el modal de fin de partida entre en pantalla móvil. Verificación por capturas: canvas arriba, mando abajo, sin solapes, sin scroll horizontal.

**Paso 5 — Selector de SKIN como lista desplegable en móvil.**
Solo en Asteroids (único con selector): en móvil el grupo de chips se presenta como `<select>` compacto que llama a `setSkin`/`handle.setSkin`. En desktop se conservan los chips actuales. Verificación: cambiar skin desde el `<select>` en móvil actualiza el juego en vivo.

**Paso 6 — Verificación final con capturas.**
Con Playwright en viewport de teléfono (portrait), capturar los 4 juegos: HUD compacto + canvas + mando, y probar que cada dirección/botón responde. Guardar capturas en `.playwright-screenshots`.

---

## Criterios de aceptación

- [ ] Cada uno de los 4 `Handle` expone `input(code: string, down: boolean)` y `handle.input("ArrowLeft", true/false)` produce el mismo efecto que pulsar la flecha en teclado.
- [ ] El teclado sigue funcionando idéntico en desktop en los 4 juegos (sin regresión).
- [ ] Existe `app/components/TouchGamepad.tsx` compartido, usado por los 4 juegos.
- [ ] En dispositivo `pointer: coarse` aparece el mando (cruceta + 2 botones) bajo el canvas; en desktop **no** se monta.
- [ ] Direcciones y botones no usados por un juego se ven atenuados y no hacen nada al pulsarlos.
- [ ] El mapeo por juego coincide con la tabla del modelo de datos (Asteroids girar/propulsión/disparar; Tetris mover/rotar/bajada/rotar/hard-drop; Arkanoid mover/lanzar; Snake dirección).
- [ ] Los botones de mantener (hold) responden a `pointerdown/up/cancel/leave`; los de pulso disparan un `down`+`up`.
- [ ] Al usar el mando no hay scroll ni zoom de la página (`touch-action: none`).
- [ ] En viewport móvil vertical: HUD compacto arriba, canvas en medio, mando abajo; sin solapes ni scroll horizontal.
- [ ] PAUSA/FIN/SALIR siguen accesibles en el HUD compacto móvil.
- [ ] En Asteroids, en móvil el selector de SKIN es un `<select>` funcional; en desktop siguen los chips.
- [ ] El modal de "FIN DEL JUEGO" es usable en pantalla de teléfono (entra completo, botones pulsables).
- [ ] Se juega cada juego de principio a fin con el dedo en emulación móvil, verificado por capturas en `.playwright-screenshots`.
- [ ] No hay cambios en jugabilidad, física, dificultad, puntuación, catálogo ni Supabase.

---

## Decisiones tomadas y descartadas

- **Mando en pantalla (elegido) vs. gestos sobre el canvas.** Se optó por un mando explícito (cruceta + 2 botones) porque es universal, descubrible y coincide con la referencia visual del usuario. Se descartaron los gestos (swipe/tap/arrastrar) por ser menos evidentes y más difíciles de mapear de forma uniforme entre juegos con controles distintos.
- **Mando uniforme para los 4 juegos (elegido) vs. mando a medida por juego.** Se eligió un único componente con cruceta de 4 direcciones + 2 botones, atenuando lo que cada juego no usa, por coherencia visual y menor superficie de código. Se descartó un mando distinto por juego.
- **Inyección genérica `input(code, down)` (elegida) vs. métodos discretos (`fire()`, `rotate()`, …).** Se eligió reutilizar el camino del teclado inyectando `code`, para no duplicar la lógica de cada acción ni desincronizarse del comportamiento real de teclas. Se descartaron los métodos discretos por multiplicar la superficie del `Handle` y arriesgar divergencias.
- **Detección por `pointer: coarse` (elegida) vs. por ancho de viewport o siempre visible.** Un teléfono táctil conserva el mando aunque gire a horizontal, y un desktop nunca lo ve, sin depender de un breakpoint arbitrario.
- **Solo portrait (elegido) vs. optimizar landscape / bloquear orientación.** Se diseña para vertical; horizontal funciona sin optimizar. Se descartó bloqueo y aviso de "gira el teléfono" por simplicidad.
- **Selector de SKIN como `<select>` en móvil (elegido) vs. mantener los chips.** Se convierte a lista desplegable en móvil para no romper el layout compacto, conservando los chips en desktop. No se crean selectores nuevos en los juegos que hoy no lo tienen.

---

## Riesgos identificados

- **Edge-triggered vs. hold.** Acciones como rotar (Tetris) o disparar (Asteroids) dependen de `justPressed`/pulso; si un botón tap no emite `down`+`up` limpio (o repite por eventos duplicados `pointer`/`touch`), la acción puede dispararse doble o no dispararse. Mitigación: unificar en eventos `pointer*` y `preventDefault`.
- **Scroll/zoom accidental.** Sin `touch-action: none` y `preventDefault`, arrastrar sobre el mando desplaza la página. Mitigación explícita en el Paso 2.
- **Altura del canvas en portrait.** Reservar espacio para el mando puede dejar el canvas demasiado bajo; hay que acotar su alto al viewport para que HUD + canvas + mando entren sin scroll.
- **`ResizeObserver`/`resize()` al reflowear.** Al cambiar el layout, el canvas se remide; conviene confirmar que `handle.resize()` sigue disparándose correctamente y el mundo no se deforma.
