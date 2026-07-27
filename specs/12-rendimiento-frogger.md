# SPEC 12 — Rendimiento de Frogger: cero asignaciones por frame y cero re-renders innecesarios

- **Estado:** Implementado
- **Fecha:** 2026-07-26
- **Depende de:** `specs/game-jam/frogger/01-frogger-core.md` (motor y página de Frogger), SPEC 10 (`TouchGamepad`, `useCoarsePointer`). No cambia el comportamiento de ninguna.
- **Objetivo (una frase):** Eliminar los tirones y el crecimiento de memoria de Frogger instrumentando el juego con un overlay de FPS/frame-time/heap activable por `?fps=1`, y suprimiendo tanto las asignaciones por frame del bucle de dibujo como los re-renders innecesarios de React, **sin cambiar un solo píxel de lo que se ve ni nada de la jugabilidad**.

---

## Por qué existe este spec

El síntoma reportado es doble: retrasos perceptibles al jugar **y** memoria del navegador que sube rápido, tanto en desktop como en móvil.

La hipótesis inicial era que React disparaba re-renders innecesarios. Al leer el código resultó ser **parcialmente falsa**: `emitState()` (`engine.ts:356-362`) ya deduplica comparando `score|lives|level|phase`, así que `setGs` no se dispara 60 veces por segundo.

Lo que sí ocurre 60 veces por segundo es basura generada en el bucle de dibujo:

- `engine.ts:357-358` — `emitState()` construye un objeto `GameState` **y** un string de clave por frame, aunque descarte ambos.
- `engine.ts:733` — `p.carBodies[String(lane.row)]`: un `String()` por coche y por frame.
- `engine.ts:857-862` — `drawFrog()` crea el `Record` `fwd` y dos arrays `[-1, 1]` por frame.
- `drawHud()` — reasigna `c.font` con un template string cada frame.

Eso es GC en diente de sierra, que se percibe exactamente como tirones y memoria creciente.

En paralelo sí hay re-renders reales que sobran: `page.tsx` mantiene `gs` en estado, de modo que **cada punto que suma la rana re-renderiza el árbol completo** (HUD, `.crt`, canvas y mando), y `TouchGamepad` no está memoizado ni recibe un `onInput` estable.

De ahí el orden del plan: **primero se mide, después se optimiza**.

---

## Alcance

### Dentro de este spec

**Instrumentación (paso previo obligatorio, no opcional)**

- Nuevo componente `app/components/PerfOverlay.tsx` (`"use client"`), montado **solo** en `app/juego/frogger/jugar/page.tsx`.
- Se activa con el query param `?fps=1` en cualquier entorno (también en producción), para poder medir en un teléfono real. Sin el param no se monta y no cuesta nada.
- Muestra tres métricas: **FPS instantáneo**, **frame-time p95** de los últimos 120 frames, y **heap usado** vía `performance.memory.usedJSHeapSize` (solo Chromium; donde no exista, muestra `—`).
- El overlay se alimenta de su propio `requestAnimationFrame` y escribe por `ref` directo al DOM, **sin `setState`** — instrumentar no puede introducir el problema que va a medir.

**Frente canvas — cero asignaciones en el bucle (`app/juego/frogger/jugar/engine.ts`)**

- `emitState()`: dejar de construir un objeto `GameState` y un string de clave por frame. Comparar los cuatro campos contra escalares guardados y construir el objeto solo cuando algo cambió de verdad.
- `drawEntity()`: eliminar el `String(lane.row)` por coche y por frame, resolviendo el color del carril una sola vez.
- `drawFrog()`: sacar del bucle el `Record` `fwd` y los arrays literales `[-1, 1]`, promoviéndolos a constantes de módulo.
- `drawHud()`: dejar de reasignar `c.font` con un template string cada frame; cachear la cadena y recalcularla solo cuando cambia `world.cell`.

**Frente React (`app/juego/frogger/jugar/page.tsx`, `app/components/TouchGamepad.tsx`)**

- Reestructurar el HUD de `page.tsx` para que se escriba por `ref`, eliminando el estado `gs`.
- Convertir la entrada de nombre del modal en no controlada, eliminando el estado `nameEdit`.
- Envolver `TouchGamepad` en `React.memo` y estabilizar con `useCallback` el `onInput` que le pasa Frogger.
- Estabilizar los handlers de los botones del HUD (pausa, fin, salir, skin) para que no cambien de identidad en cada render.

**Verificación**

- Medición **antes y después** con el overlay, en desktop y en viewport de teléfono, con capturas guardadas en `.playwright-screenshots` con prefijo `perf-frogger-*.png`.
- Verificación de **paridad de píxeles**: capturas del canvas antes y después, en los tres skins, que deben ser idénticas.

### Fuera de este spec (NO se hace aquí)

- **No** se toca ningún otro juego. Asteroids, Tetris, Arkanoid y Snake comparten el patrón y probablemente los mismos defectos, pero se replicará en su propio spec una vez validado el enfoque aquí.
- **No** se toca el `shadowBlur` de la rana (`engine.ts:842`) ni ningún otro efecto visual. Queda descartado el sprite pre-renderizado.
- **No** se toca jugabilidad, física, velocidades, dificultad, temporizador, puntuación ni vidas.
- **No** se toca el catálogo (`GAMES`), Supabase, `insertScore`, ni el leaderboard.
- **No** se toca el CSS del marco CRT (`.crt`, `.crt-screen`, `mix-blend-mode`) ni `globals.css`, aunque el compositing sea un coste real: es otro frente y otro spec.
- **No** se añade `React.memo` indiscriminado ni se reescribe la arquitectura estado↔motor. Solo los puntos nombrados arriba.
- **No** se convierte el overlay en una herramienta general para todo el sitio: vive montado únicamente en la ruta de Frogger.

---

## Modelo de datos

Este spec **no introduce entidades de juego nuevas**. Añade estructuras internas de instrumentación y caché. Ninguna se persiste ni cruza a Supabase.

**1. Muestreo del overlay (`app/components/PerfOverlay.tsx`).** Buffer circular de tamaño fijo: se asigna una vez al montar y nunca crece, para que el medidor no contamine la medición de memoria.

```ts
const SAMPLE_COUNT = 120; // ~2 s a 60 fps

interface PerfSamples {
  frameMs: Float64Array; // buffer circular, longitud SAMPLE_COUNT
  head: number; // índice de escritura
  filled: number; // muestras válidas (satura en SAMPLE_COUNT)
}
```

El p95 se calcula sobre una copia ordenada que se reutiliza (`Float64Array` preasignado), no con `[...arr].sort()` por frame. El overlay refresca el texto del DOM **4 veces por segundo**, no 60: muestrea cada frame, pinta cada 250 ms.

**2. Caché de emisión de estado (`engine.ts`).** Sustituye al string `lastEmitted` actual (`engine.ts:332`), que se construía cada frame:

```ts
// Antes: let lastEmitted = "";  → un template string por frame
let lastScore = -1;
let lastLives = -1;
let lastLevel = -1;
let lastPhase: GamePhase | null = null;
```

`emitState()` compara los cuatro escalares y solo entonces construye el objeto `GameState` que recibe `opts.onState`. Con `force = true` emite igual, como hoy.

**3. Clave de color de carril, cacheada en `Lane`.** Un campo nuevo en la interfaz existente (`engine.ts:260`):

```ts
interface Lane {
  row: number;
  speed: number;
  dir: 1 | -1;
  entities: Entity[];
  carBodyKey: string; // = String(row), calculado una vez en makeLane()
}
```

**Por qué la clave y no el color.** La alternativa era cachear el color ya resuelto (`bodyColor: string`), pero `setSkin()` (`engine.ts:1053-1056`) reasigna `world.palette` en vivo y dejaría los colores cacheados obsoletos. Guardando solo la **clave**, `drawEntity()` sigue leyendo `p.carBodies[lane.carBodyKey] ?? p.carDefault` contra la paleta actual: se elimina el `String()` por coche y por frame y el cambio de skin sigue siendo correcto sin tocar `setSkin`.

**4. Constantes promovidas a nivel de módulo.** No son estructuras nuevas, son las mismas de hoy dejando de nacer en cada frame:

```ts
const FWD: Record<Direction, readonly [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};
const SIGNS = [-1, 1] as const; // usado por patas y ojos en drawFrog()
```

**5. Caché de fuente del HUD.** Dos escalares de módulo junto al resto del estado del motor; `drawHud()` recompone la cadena solo cuando `world.cell` cambió (es decir, tras un `resize()`):

```ts
let hudFontCell = -1; // world.cell con el que se compuso la cadena
let hudFontStr = ""; // p. ej. '14px "Geist Mono", monospace'
```

**6. HUD por `ref`, no por estado (`page.tsx`).** `gs` se parte en dos según su frecuencia:

```ts
// Alta frecuencia: cambia durante la partida → nunca causa render.
const scoreRef = useRef<HTMLDivElement | null>(null);
const livesRef = useRef<HTMLDivElement | null>(null);
const levelRef = useRef<HTMLDivElement | null>(null);

// Baja frecuencia: cambia al pausar/terminar → sí necesita render (overlay EN PAUSA).
const [phase, setPhase] = useState<GamePhase>("playing");
```

El callback `onState` del motor escribe el texto directo al DOM y solo llama a `setPhase` cuando la fase cambió de verdad:

```ts
onState: (s) => {
  if (scoreRef.current)
    scoreRef.current.textContent = s.score.toLocaleString("es-ES");
  if (livesRef.current)
    livesRef.current.textContent = String(s.lives).padStart(2, "0");
  if (levelRef.current)
    levelRef.current.textContent = String(s.level).padStart(2, "0");
  setPhase(s.phase); // React descarta el update si el valor es idéntico
};
```

**Resultado:** durante el juego normal los renders de React pasan de "uno por cada cambio de puntuación" a **cero**. Solo se renderiza al pausar, al reanudar y al morir.

**Por qué es defendible aquí y no en general.** Escribir al DOM por `ref` no es React idiomático, pero esta página **ya** está construida así: el canvas es imperativo y el motor vive fuera de React. El HUD es texto de solo lectura, sin interacción ni hijos, escrito por el mismo motor de 60 fps. Es el caso exacto en que la vía de escape imperativa está justificada.

**7. Entrada de nombre no controlada (`page.tsx`).** `nameEdit` re-renderiza el modal en cada tecla:

```ts
// Antes: const [nameEdit, setNameEdit] = useState<string | null>(null);
const nameRef = useRef<HTMLInputElement | null>(null);
```

El `<input>` pasa a no controlado (`defaultValue={user?.name ?? "INVITADO"}`), el `slice(0, 10)` se aplica con el atributo `maxLength={10}` y el `toUpperCase()` con `style={{ textTransform: "uppercase" }}` más un `.toUpperCase()` al leer. El valor se lee de `nameRef.current.value` al pulsar GUARDAR. **Nota:** el `defaultValue` obliga a remontar el input al reiniciar partida; se resuelve con `key={finalScore}` en el modal.

**Balance final de estado en `page.tsx`: de 7 `useState` a 6.** Los seis restantes cambian **una vez por partida o menos**, nunca en el bucle:

| Estado               | Frecuencia                | Veredicto                              |
| -------------------- | ------------------------- | -------------------------------------- |
| `phase`              | al pausar/morir           | se queda: controla el overlay EN PAUSA |
| `over`, `finalScore` | una vez por partida       | se quedan: abren el modal              |
| `saved`, `saveWarn`  | una vez por partida       | se quedan: es el flujo del guardado    |
| `skin`               | acción manual del usuario | se queda: marca el chip activo         |

Ninguno se puede convertir en `ref` sin romper el renderizado que provocan, que es precisamente su función.

**Convención que se mantiene:** el bucle sigue siendo `requestAnimationFrame` con `dt` acotado a 0.05 s, coordenadas en píxeles CSS y `setTransform(dpr, …)` en `resize()`. Nada de eso cambia.

---

## Plan de implementación

Cada paso deja el juego funcional y es commiteable por separado. El orden no es negociable: **primero se mide, después se optimiza**, porque sin línea base no hay forma de demostrar que algo mejoró.

**Paso 1 — Crear `app/components/PerfOverlay.tsx`.**
Componente `"use client"` con su propio `requestAnimationFrame`. Buffer circular `Float64Array(120)` asignado al montar. Escribe FPS, frame-time p95 y heap directo por `ref` al DOM, refrescando a 4 Hz. Cero `useState`. Limpia su `rAF` en el cleanup del `useEffect`. Si `performance.memory` no existe, el campo de heap muestra `—`.
_Verificación:_ importado en cualquier página, muestra tres cifras que se actualizan y que no crecen solas si el juego está en pausa.

**Paso 2 — Montar el overlay en Frogger y registrar la línea base.**
En `app/juego/frogger/jugar/page.tsx`, montar `<PerfOverlay />` solo si `useSearchParams().get("fps") === "1"`. Sin el param no se importa ni se ejecuta nada.
_Verificación:_ `/juego/frogger/jugar` sin cambios visibles; `?fps=1` muestra el overlay. **Se anotan las cifras de partida (FPS, p95, heap tras 60 s) en desktop y en viewport de teléfono, con capturas `perf-frogger-antes-*.png`.** Este número es el que hay que batir.

**Paso 3 — `engine.ts`: `emitState()` sin asignaciones.**
Sustituir el string `lastEmitted` por los cuatro escalares `lastScore`/`lastLives`/`lastLevel`/`lastPhase`. El objeto `GameState` se construye solo cuando algo cambió. Se conserva el parámetro `force`.
_Verificación:_ el HUD sigue reflejando puntuación, vidas y nivel; el heap del overlay crece más despacio.

**Paso 4 — `engine.ts`: `carBodyKey` en `Lane`.**
Añadir el campo a la interfaz (`engine.ts:260`), calcularlo una vez en `makeLane()`, y en `drawEntity()` leer `p.carBodies[lane.carBodyKey]` en lugar de `p.carBodies[String(lane.row)]`.
_Verificación:_ los coches conservan exactamente sus colores por carril, y siguen cambiando bien al alternar los tres skins.

**Paso 5 — `engine.ts`: constantes `FWD` y `SIGNS` a nivel de módulo.**
Sacar de `drawFrog()` el `Record` `fwd` y los literales `[-1, 1]` de patas y ojos.
_Verificación:_ la rana mira en las cuatro direcciones y saca las patas al saltar, idéntico a antes.

**Paso 6 — `engine.ts`: caché de la fuente del HUD.**
Añadir `hudFontCell`/`hudFontStr`; en `drawHud()` recomponer la cadena de `c.font` solo si `world.cell` cambió.
_Verificación:_ el texto del HUD del canvas se ve igual, y sigue reescalando bien al redimensionar la ventana.

**Paso 7 — `page.tsx`: HUD por `ref` y `phase` como único estado del bucle.**
Eliminar `gs`. Añadir `scoreRef`/`livesRef`/`levelRef` en los tres `<div className="v">` y el estado `phase`. Reescribir `onState` para que escriba `textContent` y llame a `setPhase`. Actualizar los usos de `paused` (`gs.phase === "paused"` → `phase === "paused"`).
_Verificación:_ marcador, vidas y nivel se actualizan al jugar; PAUSA/REANUDAR sigue mostrando y ocultando el overlay EN PAUSA. Con React DevTools en modo "Highlight updates", sumar puntos ya **no** ilumina nada.

**Paso 8 — `page.tsx`: entrada de nombre no controlada.**
Eliminar `nameEdit`. El `<input>` pasa a `defaultValue` + `maxLength={10}` + `textTransform: uppercase`, leído por `nameRef` al guardar. Añadir `key={finalScore}` al modal para que se remonte limpio en cada partida.
_Verificación:_ escribir el nombre no re-renderiza el modal; se guarda en mayúsculas y recortado a 10; tras JUGAR DE NUEVO el campo vuelve al nombre por defecto.

**Paso 9 — Memoizar `TouchGamepad` y estabilizar callbacks.**
Envolver el export de `app/components/TouchGamepad.tsx` en `React.memo`. En `page.tsx`, estabilizar con `useCallback` el `onInput` y los handlers de pausa, fin, salir y cambio de skin.
_Verificación en los cinco juegos_, porque el componente es compartido: el mando responde igual en Asteroids, Tetris, Arkanoid, Snake y Frogger. En móvil, sumar puntos ya no re-renderiza el mando.

**Paso 10 — Medición comparativa y registro de cifras.**
Repetir la medición del paso 2 en las mismas condiciones y **anotar en el PR la tabla antes/después** (FPS medio, frame-time p95, heap a los 60 s; desktop y móvil), con capturas `perf-frogger-despues-*.png`. Capturar además el canvas en los tres skins y confirmar paridad de píxeles contra las capturas del paso 2.
_Verificación:_ existe la tabla comparativa y las capturas de los tres skins son idénticas a las de la línea base.

---

## Criterios de aceptación

**Instrumentación**

- [ ] `/juego/frogger/jugar` sin query param no monta el overlay: no hay ningún nodo `.perf-overlay` en el DOM.
- [ ] `/juego/frogger/jugar?fps=1` muestra FPS, frame-time p95 y heap.
- [ ] El overlay no declara ningún `useState`: `grep -c useState app/components/PerfOverlay.tsx` devuelve `0`.
- [ ] Con el juego en pausa durante 60 s con `?fps=1`, el heap reportado no crece de forma monótona.
- [ ] Al desmontar la página, el `rAF` del overlay queda cancelado (no hay callbacks tras navegar fuera).

**Asignaciones por frame eliminadas**

- [ ] `emitState()` no contiene ningún template literal ni construye `GameState` cuando nada cambió.
- [ ] `grep -n "String(lane.row)" app/juego/frogger/jugar/engine.ts` no devuelve resultados.
- [ ] `drawFrog()` no contiene literales de objeto ni de array; usa `FWD` y `SIGNS` de módulo.
- [ ] `drawHud()` solo reasigna `c.font` cuando `world.cell` cambió respecto al frame anterior.
- [ ] Una grabación de 30 s en el panel Memory de DevTools (Allocation sampling) no muestra asignaciones dentro de `draw()` ni de `emitState()`.

**Re-renders eliminados**

- [ ] `page.tsx` declara exactamente **6** `useState`: `phase`, `over`, `finalScore`, `saved`, `saveWarn`, `skin`. No existen `gs` ni `nameEdit`.
- [ ] Con "Highlight updates" activo en React DevTools, sumar puntos saltando hacia adelante **no ilumina ningún componente**.
- [ ] Escribir en el campo de nombre del modal no ilumina ningún componente.
- [ ] Pausar sí re-renderiza y muestra el overlay EN PAUSA; reanudar lo oculta.
- [ ] `TouchGamepad` está envuelto en `React.memo` y su prop `onInput` en Frogger viene de un `useCallback` con dependencias estables.

**Rendimiento medido (antes vs. después, mismas condiciones, 60 s de partida)**

- [ ] Existe en el PR la tabla comparativa con FPS medio, frame-time p95 y heap a 60 s, para desktop y móvil.
- [ ] El frame-time p95 después es **menor o igual** que el de la línea base, en desktop y en móvil.
- [ ] El crecimiento de heap a los 60 s es **menor** que el de la línea base en Chromium desktop.
- [ ] En desktop, el FPS medio durante partida es **≥ 58**.

**Cero regresiones visuales y de juego**

- [ ] Las capturas del canvas en los tres skins (`clasico`, `neon`, `retro`) son **idénticas píxel a píxel** a las de la línea base.
- [ ] El `shadowBlur` de la rana sigue presente en `engine.ts` y sin modificar.
- [ ] Los coches conservan su color por carril en los tres skins, y cambiar de skin en vivo los actualiza.
- [ ] Puntuación, vidas, nivel, temporizador y velocidad de los carriles se comportan igual que antes: llegar a una meta suma lo mismo, morir resta una vida, subir de nivel acelera igual.
- [ ] Guardar puntuación desde el modal sigue enviando nombre en mayúsculas de máximo 10 caracteres.
- [ ] Tras JUGAR DE NUEVO el campo de nombre vuelve al valor por defecto.
- [ ] El mando táctil sigue funcionando en los **cinco** juegos (Asteroids, Tetris, Arkanoid, Snake, Frogger).
- [ ] `npm run lint` y `npm run build` pasan sin errores nuevos.

---

## Decisiones

**Sobre el diagnóstico**

- **Sí:** medir antes de optimizar, con el overlay como paso 1 y 2 del plan. La hipótesis inicial ("son re-renders de React") resultó parcialmente falsa al leer el código: `emitState()` ya deduplicaba por clave (`engine.ts:356-362`), así que `setGs` nunca se disparaba 60 veces por segundo. Sin medición se habría optimizado el sitio equivocado.
- **Sí:** atacar los dos frentes —canvas y React— dentro de Frogger. Si el spec se hubiera limitado a React, la medición podría señalar el canvas y no habríamos podido tocarlo.
- **No:** asumir una única causa raíz. Los síntomas (tirones **y** memoria creciente, en desktop **y** móvil) apuntan a GC en diente de sierra por asignaciones por frame, no a un solo cuello de botella.

**Sobre la instrumentación**

- **Sí:** overlay activable con `?fps=1` en cualquier entorno, incluida producción. El problema se nota en el teléfono real, y un overlay solo-desarrollo no se puede usar ahí.
- **No:** overlay limitado a `NODE_ENV !== "production"`. Descartado por lo anterior.
- **Sí:** el overlay escribe por `ref` al DOM, con cero `useState` y refresco a 4 Hz. Un medidor que re-renderiza a 60 fps falsea justo lo que mide.
- **Sí:** buffer circular `Float64Array` preasignado y copia de orden reutilizada para el p95. Un `[...arr].sort()` por frame añadiría la basura que venimos a eliminar.
- **No:** trazas automatizadas con Playwright ni medición solo con el panel Performance de DevTools. El overlay es autoverificable, funciona en el móvil y queda disponible para los siguientes juegos.

**Sobre el canvas**

- **Sí:** cachear la **clave** del color de carril (`carBodyKey`), no el color resuelto. `setSkin()` reasigna `world.palette` en vivo (`engine.ts:1053-1056`) y un color cacheado quedaría obsoleto al cambiar de skin.
- **No:** tocar el `shadowBlur` de la rana (`engine.ts:842`), pese a ser la operación más cara del dibujo. Decisión del usuario: paridad de píxeles absoluta.
- **No:** sprite pre-renderizado en canvas oculto para el glow de la rana. Era la optimización de mayor impacto individual, descartada por la misma razón. Si tras medir hiciera falta, va en otro spec con el cambio visual aceptado explícitamente.
- **No:** tocar el CSS del marco CRT (`mix-blend-mode: multiply` sobre un canvas que cambia cada frame). Es un coste de compositing real y probablemente significativo, pero es otro frente; el overlay dirá si hay que abrirlo.

**Sobre React**

- **Sí:** HUD escrito por `ref` en lugar de por estado. No es idiomático, pero la página ya es imperativa —canvas y motor viven fuera de React— y el HUD es texto de solo lectura alimentado por un bucle de 60 fps. Es el caso en que la vía de escape está justificada.
- **Sí:** conservar `phase` como estado. Controla el overlay EN PAUSA, que es renderizado real y cambia pocas veces por partida.
- **No:** convertir a `ref` los seis estados restantes. Todos cambian una vez por partida o menos, y cada uno existe precisamente para provocar el render que provoca.
- **Sí:** entrada de nombre no controlada, con `key={finalScore}` en el modal para forzar el remontaje al reiniciar. Sin esa `key`, el `defaultValue` conservaría el nombre de la partida anterior.
- **Sí:** `React.memo` en `TouchGamepad` pese a ser componente compartido por los cinco juegos. Es aditivo y no altera comportamiento; a cambio, el paso 9 obliga a verificar los cinco.
- **No:** memoizar componentes de forma indiscriminada, ni reescribir la arquitectura estado↔motor. Solo los puntos nombrados.

**Sobre el alcance**

- **Sí:** limitar el spec a Frogger. Los otros cuatro juegos comparten el patrón y casi con seguridad los mismos defectos, pero conviene validar el enfoque y las cifras en uno antes de replicarlo.
- **No:** una pasada de rendimiento simultánea sobre los cinco juegos. Habría multiplicado por cinco la superficie de regresión antes de saber si el enfoque funciona.
- **No:** documentar un "presupuesto de rendimiento" para juegos futuros. Tiene sentido, pero después de tener las cifras reales de este spec, no antes.

---

## Riesgos

| Riesgo                                                                                                                      | Mitigación                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El HUD por `ref` deja de actualizarse si el motor emite antes de que React monte los nodos.                                 | `onState` comprueba `if (ref.current)` antes de escribir. El motor se crea dentro del `useEffect`, que corre después del montaje, así que los nodos ya existen.                                      |
| `setPhase` se llama en cada `onState`, aunque el valor no cambie.                                                           | React descarta el update cuando el valor es idéntico (`Object.is`), así que no hay render. El motor además ya deduplica antes de invocar `onState`.                                                  |
| El `<input>` no controlado conserva el nombre de la partida anterior.                                                       | `key={finalScore}` en el modal fuerza el remontaje. Cubierto por un criterio de aceptación explícito.                                                                                                |
| `React.memo` en `TouchGamepad` rompe el mando en alguno de los otros cuatro juegos que pasan callbacks inline sin memoizar. | `React.memo` sin callbacks estables solo pierde la optimización, **no** rompe nada: el componente re-renderiza como hoy. El paso 9 exige verificar los cinco juegos igualmente.                      |
| `performance.memory` no existe en Firefox ni Safari, y el criterio de heap no se puede verificar ahí.                       | El campo muestra `—` y el criterio de heap está acotado a "Chromium desktop". FPS y frame-time sí se miden en todos los navegadores.                                                                 |
| `?fps=1` con `useSearchParams()` fuerza renderizado dinámico de la ruta y cambia su comportamiento de build.                | Verificar en `node_modules/next/dist/docs/` cuál es la vía correcta en Next.js 16.2.9. `page.tsx` ya es `"use client"`, pero conviene confirmar el `Suspense` requerido antes de escribir el código. |
| Tras los diez pasos las cifras apenas mejoran.                                                                              | No es un fallo del spec: significa que el coste está en el compositing del CRT, deliberadamente fuera de alcance. El overlay del paso 1 queda como herramienta para el spec siguiente.               |
| El motor y `page.tsx` cambian a la vez, y una regresión visual es difícil de atribuir.                                      | Los pasos 3-6 (canvas) y 7-9 (React) son commits separados. La paridad de píxeles se compara contra la línea base del paso 2.                                                                        |

---

## Lo que **no** entra en este spec

- Optimizar Asteroids, Tetris, Arkanoid o Snake. Solo Frogger.
- Tocar el `shadowBlur` de la rana o cualquier otro efecto visual. Paridad de píxeles absoluta.
- Tocar el CSS del marco CRT, `mix-blend-mode` o `globals.css`.
- Cambiar jugabilidad, física, velocidades, dificultad, temporizador, puntuación o vidas.
- Tocar el catálogo `GAMES`, Supabase, `insertScore` o el leaderboard.
- Convertir el overlay en herramienta global del sitio.
- Documentar un presupuesto de rendimiento para juegos futuros.

Cada uno de ellos, si llega, va en su propio spec.
