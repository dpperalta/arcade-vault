# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Critical: Next.js version

This repo runs **Next.js 16.2.9** (App Router, React 19). It contains breaking changes versus older Next.js that may be in your training data. **Before writing or changing any Next.js code, read the relevant guide under `node_modules/next/dist/docs/`** (`01-app`, `02-pages`, `03-architecture`). These docs also embed `AI agent hint` comments for specific features — heed them (e.g. instant navigation requires exporting `unstable_instant` from the route, not just Suspense).

## Commands

```bash
npm run dev     # start dev server (http://localhost:3000)
npm run build   # production build
npm run start   # serve the production build
npm run lint    # ESLint (flat config, eslint-config-next core-web-vitals + typescript)
```

There is no test runner configured yet.

## Skills

Usa siempre /frontend-desgin de Anthropic para el diseño de interfaces de usuario

Skills propias del repo, en `.claude/skills/`:

- **`/spec`** — diseña un spec nuevo sección por sección, preguntando hasta eliminar ambigüedad. Guarda en `specs/NN-<slug>.md` en estado `Borrador`.
- **`/spec-impl`** — implementa un spec ya `Aprobado`, paso a paso.
- **`/nuevo-juego`** — diseña (sin escribir código) el spec de integración de un juego jugable nuevo con su leaderboard, siguiendo el patrón que dejaron SPEC 05 (Asteroids) y SPEC 06 (catálogo/leaderboard en Supabase). Produce únicamente el `.md` en `specs/`; la implementación se hace después con `/spec-impl`.

## Subagentes

Subagentes propios del repo, en `.claude/agents/`:

- **`game-planer`** — planifica y decide **qué** juego nuevo conviene agregar a continuación, considerando únicamente candidatos que encajen con el patrón de los juegos ya implementados (mismo motor canvas headless `engine.ts` + `page.tsx`, misma complejidad, categorías `ARCADE|PUZZLE|SHOOTER|VERSUS`). Solo recomienda: no escribe specs ni código ni invoca `/nuevo-juego`. Mantiene memoria de sugerencias previas en `.claude/agents/game-planer/memoria.md` y publica la recomendación vigente (formato TODO) en `references/sugerencias-juegos-todo.md`. El flujo es: `game-planer` decide el juego → el usuario aprueba → `/nuevo-juego` escribe el spec → `/spec-impl` lo implementa.

- **`game-jam`** — recibe un **tema** y genera **automáticamente** (sin la ronda de preguntas de `/nuevo-juego`) specs de juegos que encajan con el patrón del repo. Por cada juego que deriva del tema crea una carpeta `specs/game-jam/<game-id>/` con **≥2 archivos de spec completos y end-to-end** (formato SPEC 07/08/09, estado `Borrador`) que son **variantes alternativas del mismo juego** (misma identidad temática, distinta mecánica); el usuario revisa y elige **una** para implementar. Solo escribe `.md`: no toca código, catálogo ni base de datos. El flujo es: `game-jam` genera variantes por tema → el usuario elige una y la marca `Aprobado` → `/spec-impl` la implementa. Se diferencia de `game-planer` (que solo recomienda qué juego, sin escribir specs) y de `/nuevo-juego` (que escribe un único spec preguntando bloque a bloque).

- **`skin-designer`** — recibe un juego **ya implementado** (`app/juego/<slug>/jugar/`) y garantiza que ofrezca **al menos 3 skins** seleccionables: **Neon**, **Retro** y **Clásico** (Clásico = default). Primero **valida** contra la convención "paleta por engine + selector UI" (el `engine.ts` exporta `SkinName` + `SKINS: Record<SkinName, Palette>`, el motor acepta `skin?` con default `clasico` y expone `setSkin`, y `page.tsx` muestra un selector con Clásico preseleccionado) y, si falta algo, lo **implementa**: extrae los colores hardcodeados a las paletas (el skin `clasico` debe quedar pixel-idéntico al look actual), crea `neon`/`retro`, cablea la opción de tema y añade el selector. Solo cambia apariencia: **no** altera jugabilidad, catálogo ni base de datos. Verifica con capturas los 3 skins. A diferencia de `game-planer`/`game-jam` (que operan sobre juegos nuevos vía specs), `skin-designer` opera sobre un juego existente para dotarlo de skins.

## Architecture

- **App Router** under `app/`. `app/layout.tsx` is the root layout (Geist fonts via `next/font/google`, Tailwind via `app/globals.css`); `app/page.tsx` is the home route. Add routes as nested folders with `page.tsx`/`layout.tsx`.
- **Styling**: Tailwind CSS v4 through the PostCSS plugin (`@tailwindcss/postcss`, configured in `postcss.config.mjs`). No `tailwind.config.js` — v4 is configured in CSS.
- **TypeScript**: `strict` mode. Import alias `@/*` resolves to the project root (e.g. `@/app/...`).
- **Domain**: Arcade Vault es una plataforma online donde los usuarios juegan y compiten por el mejor puntaje. Ya no es solo el scaffold inicial: tiene catálogo, biblioteca, salón de la fama, auth y cuatro juegos jugables en canvas con leaderboard real en Supabase.

### Rutas principales (`app/`)

- `page.tsx` — home/landing.
- `biblioteca/page.tsx` — catálogo de juegos (grid de `GameCard`).
- `salon/page.tsx` — salón de la fama / leaderboard global.
- `acerca/page.tsx` + `acerca/actions.ts` — página "Acerca de" con formulario de contacto (Server Action que envía correo vía **Resend**).
- `auth/page.tsx` — login/registro (usa `ArcadeProvider` para el estado de sesión en cliente).
- `juego/[id]/page.tsx` — ficha de detalle de un juego del catálogo.
- `jugar/[id]/page.tsx` — placeholder de "jugar" para juegos que aún no tienen motor propio.
- `juego/<slug>/jugar/` — juegos **reales, jugables en canvas**, cada uno con `engine.ts` (motor headless, client-only) + `page.tsx` (wrapper `"use client"` que instancia el motor en `useEffect`). Slugs implementados: **`asteroids`**, **`tetris`**, **`arkanoid`**, **`snake`** (este último añade `atlas.ts` para el sprite atlas).
  (see `references\juegos-implementados.md`) when you need to check which games are implemented and how to implement new ones, review that list.

### Datos y Supabase (`app/data/`)

- `games.ts` — catálogo mock hardcodeado (`GAMES`), usado como **fallback** si Supabase no responde.
- `scores.ts` — puntuaciones mock deterministas (`seededScores`), fallback del leaderboard.
- `catalog.ts` / `useCatalog.ts` — acceso real a Supabase (`@/utils/supabase/client`, tablas `games` y `scores`). Todo `fetch*` tiene timeout (`DB_TIMEOUT_MS`) y cae al mock si la BD falla, no responde o no tiene filas — así la UI nunca se cuelga ni queda vacía. `insertScore()` escribe puntuaciones reales (por ahora `user_id` siempre `null`, sin auth ligado todavía).
- El patrón "un juego nuevo" es: motor en canvas → página cliente → ficha en `GAMES` → portada CSS (`cover-<slug>`, diseñada con `/frontend-design`) → fila en `games` + seed en `scores` en Supabase. Ver SPEC 05, 06, 07, 08, 09 y la skill `/nuevo-juego`.

### Componentes (`app/components/`)

- `ArcadeProvider.tsx` — contexto cliente con el estado de sesión/usuario (`login`, etc.).
- `Nav.tsx`, `Footer.tsx` — navegación y pie compartidos.
- `GameCard.tsx` — tarjeta de juego del catálogo.
- `Leaderboard.tsx` — tabla de puntuaciones (usada en detalle de juego y salón).
- `ContactForm.tsx` — formulario de "Acerca de" que llama a `acerca/actions.ts` (Resend).
- `Reveal.tsx` — wrapper de animación de entrada/scroll.

## Workflow: Spec-Driven Design

This project follows spec-driven design using the `/spec` and `/spec-impl` skills from [Klerith/fernando-skills](https://github.com/Klerith/fernando-skills). Write/refine a spec with `/spec` before implementing it with `/spec-impl`.

Specs existentes en `specs/` (orden cronológico, cada una construye sobre la anterior):

1. `01-mvp-visual.md` — scaffold visual inicial.
2. `02-home-landing.md` — home/landing.
3. `03-acerca-contacto-resend.md` — página "Acerca de" + formulario de contacto vía Resend.
4. `04-integracion-supabase.md` — integración base de Supabase (cliente, tipos, tablas `games`/`scores`).
5. `05-juego-asteroids-canvas.md` — primer juego real en canvas (Asteroids); establece el patrón motor/página que siguen los siguientes.
6. `06-catalogo-y-leaderboard-supabase.md` — catálogo y leaderboard reales leyendo/escribiendo en Supabase, con fallback a los mocks.
7. `07-juego-tetris-canvas.md` — Tetris.
8. `08-arkanoid.md` — Arkanoid.
9. `09-snake.md` — Snake.

Para integrar un juego nuevo, usa `/nuevo-juego` en vez de escribir el spec a mano — replica el patrón de las specs 05/06 automáticamente.
