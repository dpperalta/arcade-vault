# SPEC 01 — MVP visual de Arcade Vault

> **Status:** Aprobado
> **Depends on:** —
> **Date:** 2026-06-29
> **Objective:** Portar las cinco pantallas de la maqueta de `references/templates/` a Next.js 16 (App Router) como interfaz visual navegable, sin implementar ningún juego real.

---

## Scope

**In:**

- Cinco rutas reales del App Router, en español: `app/page.tsx` (biblioteca), `app/juego/[id]/page.tsx` (detalle), `app/jugar/[id]/page.tsx` (reproductor), `app/auth/page.tsx`, `app/salon/page.tsx`.
- Componentes compartidos en `app/components/`: `Nav`, `Footer`, `GameCard`, `Leaderboard` y el `ArcadeProvider` (Context).
- Datos mock en `app/data/`: catálogo de juegos (`GAMES`), categorías (`CATS`) y generador de puntuaciones (`seededScores`), portados a TypeScript.
- Estado global vía React Context + `localStorage` para sesión de usuario (`av_user`) y puntuaciones guardadas (`av_scores`).
- Capas de fondo (`av-bg`, `av-noise`) y footer montados en el layout para envolver todas las rutas.
- La pantalla Reproductor mantiene el placeholder visual del template tal cual (simulación de score/vidas/nivel, pausa, modal de "FIN DEL JUEGO" con guardado de puntuación).
- Reutilización de `app/globals.css` ya existente como única fuente de estilos.
- Diseño responsive idéntico a la maqueta (menú móvil del Nav incluido).

**Out of scope (for future specs):**

- Cualquier juego real o lógica de juego dentro del reproductor.
- Backend / base de datos real (los datos mock se reemplazarán en otro spec).
- Autenticación real: validación de contraseña, login social (Google/GitHub), registro persistido.
- Contador de "CRÉDITOS · 03" funcional (queda como decoración).
- Puntuaciones reales por usuario en el Salón de la Fama (se siguen generando con `seededScores`).
- Tests automatizados.
- SEO/metadata por ruta más allá del título global existente.

---

## Data model

Se introduce un módulo de datos mock y la forma del estado global. Tipos en TypeScript:

```ts
// app/data/games.ts
export type GameColor = "cyan" | "magenta" | "yellow" | "green";
export type GameCat = "ARCADE" | "PUZZLE" | "SHOOTER" | "VERSUS";

export interface Game {
  id: string;        // slug, p.ej. "bloque-buster"
  title: string;
  short: string;     // descripción corta (card)
  long: string;      // descripción larga (detalle)
  cat: GameCat;
  cover: string;     // clase CSS de portada, p.ej. "cover-bricks"
  color: GameColor;  // color del botón JUGAR
  best: number;      // mejor puntuación global
  plays: string;     // partidas, formateado ("12.4K")
}

export const GAMES: Game[];
export const CATS: readonly ["TODOS", "ARCADE", "PUZZLE", "SHOOTER", "VERSUS"];
```

```ts
// app/data/scores.ts
export interface ScoreRow {
  rank: number;
  name: string;
  score: number;
  date: string;      // "DD/MM/2026"
}

// generador determinista (misma firma que el template)
export function seededScores(seed: number, count?: number): ScoreRow[];
```

```ts
// app/components/ArcadeProvider.tsx — estado global
export interface User {
  name: string;      // mayúsculas, máx 10 chars
}

export interface SavedScore {
  game: string;      // Game["id"]
  score: number;
  name: string;
  at: number;        // Date.now()
}

interface ArcadeContext {
  user: User | null;
  login: (u: User | null) => void;   // null = invitado
  signOut: () => void;
  saveScore: (entry: Omit<SavedScore, "at">) => void;
}
```

**Claves de `localStorage`** (idénticas al template, sin versión por ahora):

- `av_user` → `User | null`
- `av_scores` → `SavedScore[]`

---

## Implementation plan

1. **Datos mock.** Crear `app/data/games.ts` (tipos `Game`/`GameCat`/`GameColor`, `GAMES`, `CATS`) y `app/data/scores.ts` (`ScoreRow`, `seededScores`) portando `data.jsx` a TypeScript. Test manual: `npm run lint` pasa.
2. **Estado global.** Crear `app/components/ArcadeProvider.tsx` (`"use client"`) con Context, hidratación desde `localStorage` (`av_user`, `av_scores`) y `login`/`signOut`/`saveScore`. Exponer hook `useArcade()`. Test manual: compila; `useArcade()` accesible.
3. **Layout global.** Modificar `app/layout.tsx` para montar `<div className="av-bg">`, `<div className="av-noise">`, `<ArcadeProvider>`, `<Nav>`, `<main className="av-main">{children}</main>` y `<Footer>`. Crear `app/components/Footer.tsx`. Test manual: el fondo y footer aparecen en todas las rutas.
4. **Nav.** Crear `app/components/Nav.tsx` (`"use client"`) portando `nav.jsx`: usar `usePathname()`/`<Link>` para rutas activas y `useArcade()` para usuario/sign-out, incluyendo panel móvil. Test manual: navegar entre Biblioteca y Salón resalta el enlace correcto.
5. **Biblioteca (`/`).** Crear `app/components/GameCard.tsx` y reescribir `app/page.tsx` (`"use client"`) portando `biblioteca.jsx`: hero, búsqueda, chips de categoría, grid y estado vacío. Las cards navegan a `/juego/[id]`. Test manual: filtrar y buscar funciona; click abre detalle.
6. **Detalle (`/juego/[id]`).** Crear `app/juego/[id]/page.tsx` portando `detalle.jsx` con `Leaderboard` (`app/components/Leaderboard.tsx`) usando `seededScores`. Botón "JUGAR AHORA" → `/jugar/[id]`, "VOLVER" → `/`. Test manual: abrir un juego muestra info + tabla; botones navegan.
7. **Reproductor (`/jugar/[id]`).** Crear `app/jugar/[id]/page.tsx` (`"use client"`) portando `reproductor.jsx` con el placeholder visual completo (HUD, CRT, simulación, modal FIN) usando `useArcade().saveScore`. Test manual: el score sube, pausa/fin funcionan, guardar puntuación persiste en `localStorage`.
8. **Auth (`/auth`).** Crear `app/auth/page.tsx` (`"use client"`) portando `auth.jsx`: tabs, formulario decorativo, "jugar como invitado" y botones sociales sin lógica; `useArcade().login` + redirección a `/`. Test manual: iniciar sesión guarda el usuario y vuelve a la biblioteca.
9. **Salón (`/salon`).** Crear `app/salon/page.tsx` (`"use client"`) portando `salon.jsx`: tabs por juego, podio y tabla con `seededScores`, fila "TU MEJOR MARCA" si hay usuario. Test manual: cambiar de juego refresca la tabla; con sesión aparece la fila del usuario.
10. **Limpieza.** Eliminar restos del starter de `app/page.tsx` (import de `Image`, assets no usados). Test manual: `npm run build` y `npm run lint` pasan sin errores.

---

## Acceptance criteria

- [ ] `npm run build` y `npm run lint` terminan sin errores.
- [ ] No hay errores en la consola del navegador al cargar cada una de las cinco rutas.
- [ ] `/` muestra hero, búsqueda, chips de categoría y el grid con los 8 juegos de `GAMES`.
- [ ] Escribir en la búsqueda filtra las cards por título; sin coincidencias se muestra el bloque "NO HAY RESULTADOS".
- [ ] Seleccionar un chip de categoría filtra el grid; "TODOS" muestra todos.
- [ ] Click en una card o en "JUGAR" navega a `/juego/[id]` con la URL correcta.
- [ ] `/juego/[id]` muestra portada, descripción larga, stats y la tabla de mejores puntuaciones.
- [ ] En el detalle, "JUGAR AHORA" navega a `/jugar/[id]` y "VOLVER AL VAULT" navega a `/`.
- [ ] `/jugar/[id]` incrementa la puntuación automáticamente; "PAUSA" la detiene y "FIN" abre el modal "FIN DEL JUEGO".
- [ ] En el modal, guardar la puntuación la añade a `av_scores` en `localStorage` y muestra "PUNTUACIÓN GUARDADA".
- [ ] `/auth` permite iniciar sesión (guarda `av_user`) y redirige a `/`; "JUGAR COMO INVITADO" también redirige a `/`.
- [ ] Con sesión activa, el Nav muestra el nombre del usuario y permite cerrar sesión (borra `av_user`).
- [ ] `/salon` muestra podio y tabla; cambiar de pestaña de juego refresca las filas.
- [ ] Con sesión activa, el Salón muestra la fila "TU MEJOR MARCA".
- [ ] El Nav resalta el enlace activo según la ruta y el panel móvil abre/cierra en pantallas pequeñas.
- [ ] Las capas `av-bg`, `av-noise` y el footer aparecen en las cinco rutas.
- [ ] Recargar la página conserva la sesión de usuario y las puntuaciones guardadas.

---

## Decisions

- **Sí:** Rutas reales del App Router en español (`/`, `/juego/[id]`, `/jugar/[id]`, `/auth`, `/salon`). URLs compartibles y navegación nativa, más idiomático que replicar el hash router.
- **No:** Router por hash dentro de un único componente con estado (como el template). Funciona, pero desaprovecha el App Router y rompe las URLs profundas.
- **Sí:** React Context (`ArcadeProvider`) + `localStorage` para usuario y puntuaciones, montado en el layout. Comparte estado entre rutas reales sin prop-drilling.
- **No:** Que cada página lea `localStorage` directamente. Duplicaría la lógica de hidratación y la mantendría desincronizada entre pantallas.
- **Sí:** Mantener el placeholder visual del reproductor tal cual (simulación de score/vidas/nivel). Es parte de la maqueta y puede copiarse a la pantalla real del juego cuando se implemente.
- **No:** Implementar lógica de juego real ahora. Es explícitamente un MVP solo visual.
- **Sí:** Conservar las claves `av_user` y `av_scores` sin prefijo de versión. Coinciden con el template y el MVP no necesita migraciones todavía.
- **No:** Versionar las claves de `localStorage` (`:v1`). Se añadirá cuando exista un esquema real que pueda cambiar.
- **Sí:** Datos mock en `app/data/` (`games.ts`, `scores.ts`) en TypeScript. Punto único de reemplazo cuando llegue la base de datos.
- **No:** Conectar una base de datos o API real. Va en otro spec.
- **Sí:** Mantener "CRÉDITOS · 03", login social y validación de contraseña como decoración sin lógica. El MVP es visual; añadir lógica real abriría alcance de autenticación.
- **Sí:** Reutilizar `app/globals.css` existente como única fuente de estilos en lugar de re-portar `styles.css`. Ya fue migrado globalmente en un commit previo.

---

## Risks

| Riesgo | Mitigación |
| ------ | ---------- |
| Acceso a `localStorage` durante SSR lanza error o causa hydration mismatch (usuario aparece distinto entre servidor y cliente). | `ArcadeProvider` es `"use client"` e hidrata el estado en `useEffect` tras el montaje; el render inicial asume "sin sesión". |
| `seededScores` con semilla determinista debería coincidir servidor/cliente, pero la fila "TU MEJOR MARCA" depende del usuario (solo cliente) y puede desajustar el render inicial. | Esa fila se renderiza solo tras hidratar el usuario, evitando el mismatch. |
| Componentes con hooks/eventos olvidan `"use client"` y rompen el build de Next.js 16. | El plan marca explícitamente qué archivos llevan `"use client"`; verificación en el paso 10 con `npm run build`. |
| Las clases de portada (`cover-*`) o utilidades dependen de que `globals.css` ya las contenga. | Confirmado: `app/globals.css` (978 líneas) ya incluye todos los estilos del template; no se re-portan. |

---

## What is **not** in this spec

- Juegos reales ni lógica de juego en el reproductor.
- Backend, base de datos o API real (los datos siguen siendo mock en `app/data/`).
- Autenticación real: validación de contraseña, login social y registro persistido.
- Puntuaciones reales por usuario (el Salón sigue usando `seededScores`).
- Contador de "CRÉDITOS" funcional.
- Tests automatizados y metadata SEO por ruta.

Cada uno de esos, si se aborda, va en su propio spec.
