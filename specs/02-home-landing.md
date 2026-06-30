# SPEC 02 — Landing page (Home) de Arcade Vault

> **Status:** Aprobado
> **Depends on:** SPEC 01
> **Date:** 2026-06-30
> **Objective:** Portar la landing `home.jsx` de `references/templates/home-about/` a Next.js 16 como ruta raíz `/`, moviendo la biblioteca actual a `/biblioteca`.

---

## Scope

**In:**

- Nueva ruta raíz `app/page.tsx` = **Home (landing)**, portando `home.jsx`: hero con siluetas flotantes, sección "¿Por qué Arcade Vault?", preview de juegos, stats, actividad en vivo (ticker + top jugadores), precios + FAQ y CTA final.
- Mover la biblioteca actual a `app/biblioteca/page.tsx` (la ruta `/` deja de ser la biblioteca).
- Actualizar `app/components/Nav.tsx`: añadir enlace **"Inicio"** (`/`) y apuntar **"Biblioteca"** a `/biblioteca`; recalcular los estados activos (`Inicio` activo en `/`; `Biblioteca` activo en `/biblioteca`, `/juego/*`, `/jugar/*`).
- Actualizar todos los enlaces internos que hoy apuntan a `/` como "biblioteca" y pasarlos a `/biblioteca`: `app/auth/page.tsx` (2 redirecciones), `app/juego/[id]/page.tsx` ("VOLVER AL VAULT"), `app/jugar/[id]/page.tsx` (salir), `app/salon/page.tsx` ("volver"). El logo del Nav se mantiene en `/` (ahora es el home).
- Mini-cards del preview usando los datos reales `GAMES` (`GAMES.slice(0, 6)`), igual que el template; cada una navega a `/juego/[id]`.
- Animación de revelado al hacer scroll (`IntersectionObserver` → clase `.in`) portada a un componente cliente.
- Portar a `app/globals.css` el CSS de la landing que aún no existe (`.home-*`, `.feature-*`, `.mini-*`, `.section-*`, `.home-stats`/`.stat-*`, `.activity-*`/`.tick-*`/`.top-*`, `.pricing-*`/`.price-*`/`.faq-*`, `.home-final`, `.hero-*`, `.home-silos`, `.reveal`/`.in`, keyframes `float`/`bounce`/ticker y sus media queries), desde `references/templates/home-about/styles.css`.
- **Verificación anti-regresión del bug de z-index** (contenido que desaparecía detrás de las capas `av-bg`/`av-noise`): comprobar con **capturas reales** (no solo el DOM) que todas las secciones del home y de la biblioteca movida quedan visibles por encima del fondo, sobre todo el contenido animado con `.reveal`/`.in`.

**Out of scope (for future specs):**

- La pantalla **"Acerca de"** (`about.jsx`) y su formulario de contacto: van en otro spec.
- Conectar el ticker de "últimas puntuaciones", el "top jugadores · hoy" y las stats (`12+`, `MILES`, `GLOBAL`) a datos reales: se portan **hardcodeados** tal cual el template.
- Lógica real detrás de los CTA de precios/FAQ (siguen llevando a `/auth` o `/biblioteca`).
- Cualquier juego real, backend, autenticación real o tests automatizados (heredado de SPEC 01).
- Metadata/SEO por ruta más allá del título global.

---

## Data model

Esta feature **no introduce nuevas estructuras de datos persistentes**. Reutiliza el modelo de SPEC 01:

- `GAMES` (`app/data/games.ts`, tipo `Game`) para las mini-cards del preview (`GAMES.slice(0, 6)`).
- `ArcadeProvider`/`useArcade()` para el estado de sesión que ya consume el `Nav`.

El contenido restante del home es **estático y local al componente** (no es un modelo de datos reutilizable, va embebido en `app/page.tsx` tal cual el template):

```ts
// Filas del ticker "ÚLTIMAS PUNTUACIONES" (hardcodeadas en app/page.tsx)
type TickRow = { p: string; g: string; s: number; t: string; c: "magenta" | "yellow" | "green" | "cyan" };

// Filas de "TOP JUGADORES · HOY" (hardcodeadas)
type TopRow = { r: number; p: string; s: number };

// Bloques de stats (hardcodeados)
type StatBlock = { n: string; u: string; s: string };

// Tarjetas de "¿POR QUÉ ARCADE VAULT?" (hardcodeadas)
type Feature = { i: "GAMEPAD" | "FREE" | "TROPHY" | "ROCKET"; t: string; d: string; c: "cyan" | "yellow" | "magenta" | "green" };
```

Estos tipos son opcionales (pueden quedar como literales inline). No se añaden claves de `localStorage` ni se modifica ninguna existente.

---

## Implementation plan

1. **Portar el CSS de la landing.** Añadir a `app/globals.css` las reglas de la landing que faltan (`.home-*`, `.feature-*`, `.mini-*`, `.section-*`, `.home-stats`/`.stat-*`, `.activity-*`/`.tick-*`/`.top-*`, `.pricing-*`/`.price-*`/`.faq-*`, `.home-final`, `.hero-*`, `.home-silos`, `.reveal`/`.in`, keyframes `float`/`bounce`/ticker y sus media queries) desde `references/templates/home-about/styles.css`. Verificar que `.reveal`/`.in` y el contenido del home queden con `z-index`/`position` por encima de `av-bg`/`av-noise`. Test manual: `npm run lint` pasa; no hay selectores duplicados conflictivos.

2. **Mover la biblioteca a `/biblioteca`.** Crear `app/biblioteca/page.tsx` con el contenido actual de `app/page.tsx` (la biblioteca). Dejar `app/page.tsx` temporalmente como placeholder mínimo. Test manual: `/biblioteca` renderiza la biblioteca completa (hero, búsqueda, chips, grid).

3. **Actualizar enlaces internos a `/biblioteca`.** Cambiar a `/biblioteca`: `app/auth/page.tsx` (líneas 19 y 94, `router.push`), `app/juego/[id]/page.tsx` ("VOLVER AL VAULT"), `app/jugar/[id]/page.tsx` (salir, `router.push`), `app/salon/page.tsx` ("volver"). Test manual: login, "volver" y "salir" llevan a `/biblioteca`.

4. **Actualizar el Nav.** En `app/components/Nav.tsx` añadir el enlace **"Inicio"** (`/`) antes de "Biblioteca", apuntar "Biblioteca" a `/biblioteca`, y recalcular activos: `isHome = pathname === "/"`; `isLibrary = pathname.startsWith("/biblioteca") || pathname.startsWith("/juego/") || pathname.startsWith("/jugar/")`. Replicar también en el panel móvil. Test manual: cada ruta resalta el enlace correcto.

5. **Componente de revelado al scroll.** Crear `app/components/Reveal.tsx` (`"use client"`) que monte el `IntersectionObserver` y añada la clase `.in` a los `.reveal` (portado de `useReveal` en `home.jsx`). Test manual: compila; el hook se monta sin error.

6. **Hero de la landing.** Reescribir `app/page.tsx` (`"use client"`) con la estructura base del home: `<div className="home fade-in">`, el componente `FloatingSilhouettes` (los 8 SVG de siluetas) y la sección hero (eyebrow, título de 3 líneas, subtítulo, CTAs a `/biblioteca` y `/auth`, indicador de scroll). Montar `<Reveal />`. Test manual: `/` muestra el hero con siluetas y los botones navegan.

7. **Sección "¿Por qué Arcade Vault?".** Añadir la grilla de 4 `feature-card` con `FeatureIcon` (los 4 SVG pixel) y los textos hardcodeados. Test manual: se ven las 4 tarjetas con icono y color.

8. **Preview de juegos.** Añadir la sección con `MiniCard` sobre `GAMES.slice(0, 6)` (navegan a `/juego/[id]`) y el botón "VER TODOS LOS JUEGOS" → `/biblioteca`. Test manual: se ven 6 mini-cards y abren el detalle correcto.

9. **Stats + actividad en vivo.** Añadir la banda de stats (3 bloques hardcodeados) y la sección de actividad: ticker "ÚLTIMAS PUNTUACIONES" y "TOP JUGADORES · HOY" (ambas listas hardcodeadas), con el enlace "VER SALÓN" → `/salon`. Test manual: ambas tarjetas se ven con sus filas y animación de ticker.

10. **Precios, FAQ y CTA final.** Añadir la sección de precios (price-card + lista), el bloque FAQ (3 ítems) y la sección `home-final` con el CTA "INSERTAR MONEDA" → `/biblioteca`. Test manual: se ven precios, FAQ y CTA final; los botones navegan.

11. **Verificación anti-regresión z-index + cierre.** Tomar capturas reales (Playwright → `.playwright-screenshots`) de `/` (todas las secciones, incluidas las animadas con `.reveal`) y de `/biblioteca`, confirmando que ningún contenido desaparece detrás de `av-bg`/`av-noise`. Ejecutar `npm run build` y `npm run lint`. Test manual: build y lint sin errores; capturas muestran todo el contenido visible.

---

## Acceptance criteria

- [ ] `npm run build` y `npm run lint` terminan sin errores.
- [ ] No hay errores en la consola del navegador al cargar `/` ni `/biblioteca`.
- [ ] La ruta `/` muestra la landing completa: hero con siluetas flotantes, "¿Por qué Arcade Vault?", preview de juegos, stats, actividad en vivo, precios + FAQ y CTA final.
- [ ] La biblioteca completa (hero, búsqueda, chips de categoría, grid de los 8 juegos) se renderiza ahora en `/biblioteca`.
- [ ] En el hero, "EXPLORAR JUEGOS" navega a `/biblioteca` y "CREAR CUENTA" navega a `/auth`.
- [ ] El preview muestra 6 mini-cards desde `GAMES`; hacer click en una abre su `/juego/[id]` correcto.
- [ ] "VER TODOS LOS JUEGOS" y el CTA final "INSERTAR MONEDA" navegan a `/biblioteca`; "VER SALÓN" navega a `/salon`.
- [ ] El Nav muestra "Inicio" y "Biblioteca"; "Inicio" se resalta en `/` y "Biblioteca" en `/biblioteca`, `/juego/*` y `/jugar/*` (también en el panel móvil).
- [ ] Tras iniciar sesión o entrar como invitado en `/auth`, la redirección lleva a `/biblioteca` (no a `/`).
- [ ] "VOLVER AL VAULT" (detalle), salir del reproductor y "volver" del salón llevan a `/biblioteca`.
- [ ] Las secciones con `.reveal` aparecen (clase `.in`) al hacer scroll y son visibles.
- [ ] **Anti-regresión z-index:** en capturas reales de `/` y `/biblioteca`, todas las secciones (incluidas las animadas) se ven por encima de `av-bg`/`av-noise`; ningún bloque queda invisible.
- [ ] El logo del Nav sigue navegando a `/` (home).

---

## Decisions

- **Sí:** El home pasa a ser la ruta raíz `/` y la biblioteca se mueve a `/biblioteca`. Es lo idiomático: la primera impresión es la landing, no el catálogo.
- **No:** Dejar el home en `/inicio` manteniendo la biblioteca en `/`. Funciona, pero deja la landing en una ruta secundaria, poco habitual para un producto.
- **Sí:** Las redirecciones post-login y los "volver/salir" apuntan a `/biblioteca`. Preserva el flujo de SPEC 01 (el usuario aterriza en el catálogo para jugar), no en la landing de marketing.
- **Sí:** Ticker, top jugadores y stats se portan **hardcodeados** tal cual el template. Es contenido de maqueta; conectarlo a datos reales abriría alcance y riesgo de hydration sin aportar al objetivo visual.
- **No:** Derivar el ticker/top de `seededScores`. Se hará en un spec posterior si se decide darle dinamismo real.
- **Sí:** Las mini-cards usan `GAMES` reales (`slice(0, 6)`), igual que el template. El catálogo ya existe y mantiene los enlaces a `/juego/[id]` coherentes.
- **Sí:** "Acerca de" (`about.jsx`) queda fuera de este spec. El argumento pedía "el sitio home"; el About merece su propio spec por su formulario de contacto.
- **Sí:** El revelado al scroll se extrae a un componente cliente `Reveal` reutilizable en lugar de un hook inline. El mismo patrón servirá para el futuro About.
- **Sí:** Portar el CSS de la landing a `app/globals.css` (fuente única de estilos, decisión heredada de SPEC 01) en vez de un CSS Module nuevo.
- **No:** Crear un `home.module.css` aparte. Rompería la convención de un único `globals.css` ya establecida.
- **Sí:** Verificación explícita anti-regresión del bug de z-index con capturas reales (no solo DOM/`getComputedStyle`). Ya ocurrió antes que contenido quedara invisible detrás de las capas de fondo.

---

## Risks

| Riesgo | Mitigación |
| ------ | ---------- |
| El contenido del home desaparece detrás de `av-bg`/`av-noise` por `z-index`/`position` mal portados (bug ya visto antes). | El CSS de la landing fija `position`/`z-index` sobre el fondo; el paso 11 verifica con **capturas reales** que todas las secciones son visibles, no solo el DOM. |
| Queda algún enlace interno apuntando a `/` esperando la biblioteca, llevando ahora al home. | Lista cerrada de archivos a tocar (`auth`, `juego/[id]`, `jugar/[id]`, `salon`, `Nav`); el criterio de aceptación verifica cada flujo de "volver/salir/login". |
| `IntersectionObserver` en SSR o secciones que entran ya visibles sin disparar `.in`, dejando contenido oculto si el CSS de `.reveal` parte de `opacity: 0`. | `Reveal` es `"use client"` y observa tras el montaje; verificar en capturas que las secciones above-the-fold también reciben `.in`. |
| Colisión de selectores al portar el CSS (p. ej. `.stat-*`, `.section-*`) con reglas ya existentes en `globals.css`. | El paso 1 revisa duplicados antes de pegar; `npm run lint` y la inspección visual confirman que no se rompe la biblioteca. |
| Olvidar `"use client"` en `app/page.tsx` o `Reveal` rompe el build de Next.js 16 (usan hooks/eventos). | El plan marca explícitamente qué archivos llevan `"use client"`; el paso 11 lo confirma con `npm run build`. |

---

## What is **not** in this spec

- La pantalla "Acerca de" (`about.jsx`) y su formulario de contacto.
- Conectar ticker, top jugadores y stats a datos reales (`seededScores` u otro origen).
- Lógica real de precios/FAQ/registro.
- Juegos reales, backend, autenticación real, tests automatizados y metadata SEO por ruta.

Cada uno de esos, si se aborda, va en su propio spec.
