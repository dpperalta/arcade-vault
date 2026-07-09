# SPEC 06 — Catálogo y leaderboard en Supabase

> **Status:** Aprobado
> **Depends on:** SPEC 04 (clientes Supabase), SPEC 01 (HUD/modal/`.av-player`), SPEC 02 (Home/biblioteca), SPEC 05 (juego Asteroids que escribe puntuaciones)
> **Date:** 2026-07-08
> **Objective:** Mover el catálogo de juegos y las puntuaciones desde datos hardcodeados a dos tablas de Supabase (`games` y `scores`), leídas en cliente con fallback a los datos actuales y sembradas por migración, e insertar las puntuaciones reales en la BD al terminar una partida.

---

## Scope

**In:**

- **Tabla `games` en Supabase**: réplica del catálogo actual (`app/data/games.ts`), con `sort_order` para preservar el orden del array. Se crea y se siembra por migración con los 9 juegos actuales y sus valores exactos (incluidos `best` y `plays` como columnas estáticas).
- **Tabla `scores` en Supabase**: `id`, `game_id`, `player_name`, `score`, `created_at` y `user_id` opcional (nullable, para el futuro spec de auth). Sembrada por migración con ~12 filas por juego generadas con la lógica de `seededScores` (≈108 filas), para que ningún leaderboard salga vacío.
- **RLS en ambas tablas**:
  - `games`: lectura pública (`select` anónimo); sin inserción/edición desde la app.
  - `scores`: lectura pública + inserción pública anónima, con guardas (`score >= 0`, `player_name` no vacío y ≤ 10 chars, `game_id` debe existir).
- **Módulo de acceso cliente** `app/data/catalog.ts`: `fetchGames()` y `fetchScores(gameId, limit)` usando el browser client de `utils/supabase/client.ts`; cada uno devuelve `{ rows, source: "db" | "fallback" }` y cae a los datos hardcodeados si la BD no responde.
- **Hooks cliente** `useGames()` y `useScores(gameId)` (en `app/data/catalog.ts` o junto a él) que envuelven los `fetch*` con estado de carga y fallback.
- **`/biblioteca`**: consume `useGames()` en vez de importar `GAMES` directamente; el filtro por categoría y la búsqueda siguen igual.
- **`/salon`** (Salón de la Fama): las pestañas por juego salen de `useGames()`; las filas del podio y la tabla salen de `useScores(gameId)` en vez de `seededScores`.
- **`/juego/[id]`**: se convierte a **componente cliente** (opción a); lee el juego con `useGames()` y el leaderboard lateral con `useScores(id)`.
- **Inserción real al game over**: `saveScore` pasa a **insertar en `scores` de Supabase** (`game_id`, `player_name`, `score`, `user_id: null`). Afecta al modal de `app/jugar/[id]/page.tsx` y al juego real de Asteroids (`app/juego/asteroids/jugar/page.tsx`).
- **Tipos TypeScript del esquema**: generados desde Supabase (ahora que existen tablas) y usados por el módulo de acceso.
- **`app/data/games.ts` y `app/data/scores.ts` se conservan** como única fuente de fallback hardcodeado (no se borran).

**Out of scope (para specs futuros):**

- **Autenticación**: `user_id` se inserta siempre `null`; `player_name` guarda el nombre de usuario actual (o "INVITADO"). Enlazar scores a usuarios reales va en el spec de auth.
- **`best` derivado en vivo** desde `scores`: `best` sigue siendo columna estática sembrada. Recalcularlo desde puntuaciones reales es otro spec.
- **`plays` real** (contador de partidas): sigue siendo columna estática de escaparate.
- **Escritura en `localStorage` de puntuaciones** (`av_scores`): se elimina el camino de escritura; sólo se inserta en la BD (sin cola offline).
- **Panel de administración** o edición del catálogo desde la app: `games` se mantiene por migración.
- **Moderación / anti-abuso** más allá de las guardas de RLS (rate-limit, captcha, etc.).
- **Paginación / scroll infinito** del leaderboard: se lee un `limit` fijo por juego.

---

## Data model

Se introducen **dos tablas** en el esquema `public` de Supabase y **un módulo de acceso cliente**. Los tipos hardcodeados (`Game`, `ScoreRow`, `SavedScore`) se conservan como fallback y contrato de UI.

### 1. Tabla `games`

```sql
create table public.games (
  id          text primary key,          -- slug actual: "bloque-buster", "asteroids", ...
  title       text not null,
  short       text not null,
  long        text not null,
  cat         text not null,             -- "ARCADE" | "PUZZLE" | "SHOOTER" | "VERSUS"
  cover       text not null,             -- clase CSS: "cover-bricks", ...
  color       text not null,             -- "cyan" | "magenta" | "yellow" | "green"
  best        integer not null,
  plays       text not null,             -- escaparate: "12.4K"
  play_href   text,                      -- null = default `/jugar/${id}` en la app
  sort_order  integer not null           -- preserva el orden del array GAMES
);
```

- `cat` y `color` se validan con `check` contra los valores permitidos.
- La app **no** escribe en esta tabla; se siembra por migración.

### 2. Tabla `scores`

```sql
create table public.scores (
  id           uuid primary key default gen_random_uuid(),
  game_id      text not null references public.games(id),
  player_name  text not null check (char_length(player_name) between 1 and 10),
  score        integer not null check (score >= 0),
  user_id      uuid,                     -- nullable; para el futuro spec de auth
  created_at   timestamptz not null default now()
);
create index scores_game_id_score_idx on public.scores (game_id, score desc);
```

### 3. RLS

```sql
alter table public.games  enable row level security;
alter table public.scores enable row level security;

-- games: sólo lectura pública
create policy "games_select_public" on public.games
  for select using (true);

-- scores: lectura pública + inserción anónima
create policy "scores_select_public" on public.scores
  for select using (true);
create policy "scores_insert_public" on public.scores
  for insert with check (
    score >= 0
    and char_length(player_name) between 1 and 10
    and exists (select 1 from public.games g where g.id = game_id)
  );
```

### 4. Módulo de acceso cliente (`app/data/catalog.ts`)

```ts
import type { Game } from "./games";
import type { ScoreRow } from "./scores";

export interface LoadResult<T> {
  rows: T;
  source: "db" | "fallback";
}

// Lee el catálogo ordenado por sort_order; cae a GAMES si la BD falla.
export async function fetchGames(): Promise<LoadResult<Game[]>>;

// Lee las mejores puntuaciones de un juego (score desc, limit);
// cae a seededScores(...) si la BD falla.
export async function fetchScores(
  gameId: string,
  limit?: number,
): Promise<LoadResult<ScoreRow[]>>;

// Inserta una puntuación real (user_id siempre null por ahora).
export async function insertScore(entry: {
  gameId: string;
  playerName: string;
  score: number;
}): Promise<{ ok: boolean }>;
```

### 5. Hooks cliente

```ts
// Envuelven los fetch con estado; exponen loading + source para depurar el fallback.
export function useGames(): {
  games: Game[];
  loading: boolean;
  source: "db" | "fallback";
};
export function useScores(
  gameId: string,
  limit?: number,
): { scores: ScoreRow[]; loading: boolean; source: "db" | "fallback" };
```

**Convenciones:**

- Las filas de la BD se **mapean** a los tipos de UI existentes (`Game`, `ScoreRow`) para no tocar los componentes de presentación (`GameCard`, `Leaderboard`). El `rank` de `ScoreRow` se calcula en cliente tras ordenar por `score desc`.
- `play_href` (snake_case en BD) se mapea a `playHref` (camelCase en `Game`).
- El fallback de `fetchScores` reusa la misma semilla que hoy usa cada página (p. ej. `seededScores(id.length * 17 + 3, limit)`), para que el fallback sea visualmente idéntico al mock actual.
- `insertScore` no bloquea la UI en caso de error de BD: devuelve `{ ok: false }` y el modal muestra el estado guardado igualmente (ver Riesgos).

---

## Implementation plan

1. **Migración `games` + seed.** Crear la tabla `games` (con `check` en `cat`/`color`), habilitar RLS, política `select` pública, y sembrar los 9 juegos actuales con sus valores exactos y `sort_order` según el orden de `GAMES`. _Test:_ `list_tables` muestra `games`; un `select ... order by sort_order` devuelve 9 filas en el orden actual; `get_advisors` (security) no marca RLS deshabilitado.

2. **Migración `scores` + seed.** Crear la tabla `scores` (FK a `games`, `checks`, índice `(game_id, score desc)`), habilitar RLS, políticas `select` pública e `insert` pública con guardas, y sembrar ~12 filas por juego con la lógica de `seededScores`. _Test:_ `select count(*)` ≈ 108; un `insert` anónimo válido pasa y uno inválido (`score < 0` o `player_name` de 11 chars) es rechazado por RLS.

3. **Tipos TypeScript del esquema.** Generar los tipos desde Supabase (`generate_typescript_types`) a un archivo del repo (p. ej. `utils/supabase/database.types.ts`). _Test:_ el archivo existe; `npm run lint` y el build no rompen.

4. **Módulo de acceso `app/data/catalog.ts`.** Implementar `fetchGames()`, `fetchScores(gameId, limit)` e `insertScore(...)` con el browser client, el mapeo BD→(`Game`/`ScoreRow`) (incluido `play_href`→`playHref` y cálculo de `rank`), y el fallback a `GAMES`/`seededScores` con `source`. _Test:_ `npm run lint` pasa; probado puntualmente desde un componente que loguea `source` (se retira antes de cerrar).

5. **Hooks `useGames()` y `useScores(gameId, limit)`.** Envolver los `fetch*` con `useState`/`useEffect`, estado `loading` y `source`. _Test:_ `npm run lint` pasa; no rompen render en servidor (se instancian sólo en cliente).

6. **Cablear `/biblioteca`.** Reemplazar el import directo de `GAMES` por `useGames()`; mantener búsqueda y filtro por categoría (las `CATS` siguen del array constante). _Test manual:_ `/biblioteca` muestra las 9 cards desde la BD; con la BD caída, muestra el fallback; filtro y búsqueda funcionan.

7. **Cablear `/salon`.** Pestañas por juego desde `useGames()`; podio y tabla desde `useScores(gameId, 12)` en lugar de `seededScores`. Preservar el bloque "TU MEJOR MARCA" con `user` (sigue mock, es out of scope). _Test manual:_ cambiar de pestaña carga las puntuaciones reales de cada juego; con la BD caída, cae al mock idéntico al actual.

8. **Convertir `/juego/[id]` a cliente.** Pasar el detalle a `"use client"` (leer `id` con `use(params)`), obtener el juego con `useGames()` y el leaderboard lateral con `useScores(id, 10)`; `notFound()`/estado vacío si el `id` no existe. _Test manual:_ `/juego/asteroids` renderiza detalle + leaderboard real; `/juego/inexistente` da 404; el botón "JUGAR AHORA" sigue respetando `playHref`.

9. **Inserción real al game over.** En el modal de `app/jugar/[id]/page.tsx` y en `app/juego/asteroids/jugar/page.tsx`, sustituir `saveScore({...})` por `insertScore({ gameId, playerName: name, score })`. Mostrar "PUNTUACIÓN GUARDADA" al `ok`, y un aviso discreto si `ok:false` (sin bloquear). _Test manual:_ perder una partida e insertar; la fila aparece en `/salon` de ese juego tras recargar; con la BD caída, el modal no se rompe.

10. **Limpiar el store de puntuaciones en `localStorage`.** Quitar de `ArcadeProvider` el estado y la escritura de `scores`/`av_scores` (ya no se usan); conservar `user`/`login`/`signOut`. Ajustar cualquier import de `saveScore`. _Test manual:_ no quedan referencias a `av_scores`; `npm run lint` pasa; `user`/sesión siguen funcionando.

11. **Verificación y cierre.** `npm run build` y `npm run lint` sin errores; `get_advisors` (security) sin hallazgos nuevos de RLS; capturas reales con Playwright (→ `.playwright-screenshots`) de `/biblioteca`, `/salon` (pestaña con datos reales), `/juego/[id]` con leaderboard, y el modal de fin tras insertar. Retirar cualquier log de depuración de `source`. _Test manual:_ build/lint limpios; capturas muestran datos de BD; el fallback se probó desactivando la red.

---

## Acceptance criteria

- [ ] `npm run build` y `npm run lint` terminan sin errores.
- [ ] No hay errores en la consola del navegador al cargar `/biblioteca`, `/salon` ni `/juego/[id]`.
- [ ] Existe la tabla `public.games` con RLS habilitada, política `select` pública y 9 filas sembradas que replican los valores actuales de `GAMES`, ordenables por `sort_order` en el orden actual.
- [ ] Existe la tabla `public.scores` con RLS habilitada, `game_id` con FK a `games`, `user_id` nullable, y ~12 filas sembradas por juego (≈108 en total).
- [ ] Un `insert` anónimo válido en `scores` es aceptado; uno con `score < 0`, `player_name` vacío o de más de 10 chars, o `game_id` inexistente, es rechazado por RLS.
- [ ] `get_advisors` (security) no reporta tablas sin RLS.
- [ ] `/biblioteca` muestra las 9 cards leídas desde la BD (`source: "db"`); el filtro por categoría y la búsqueda siguen funcionando.
- [ ] `/salon` muestra el podio y la tabla con puntuaciones **reales** de la BD para el juego seleccionado; cambiar de pestaña recarga las de ese juego.
- [ ] `/juego/[id]` es un componente cliente que muestra el detalle y un leaderboard lateral con puntuaciones reales de ese juego; `/juego/inexistente` devuelve 404.
- [ ] "JUGAR AHORA" en el detalle sigue navegando a `playHref` cuando existe (asteroids) y a `/jugar/${id}` en el resto.
- [ ] Al terminar una partida (placeholder o Asteroids real) e insertar la puntuación, la fila aparece en `/salon` de ese juego tras recargar, con el `player_name` introducido y `user_id` nulo.
- [ ] Con la BD inaccesible, `/biblioteca`, `/salon` y `/juego/[id]` muestran el fallback hardcodeado (`GAMES`/`seededScores`) sin romperse; el modal de fin no se bloquea si la inserción falla.
- [ ] No queda en el repo escritura de puntuaciones a `localStorage` (`av_scores`); `user`/sesión (`av_user`) siguen funcionando.
- [ ] No queda código de depuración temporal (logs de `source`, componentes de prueba).

---

## Decisions

- **Sí:** Un **único spec** para catálogo + leaderboard, a petición del usuario. **No:** dividir en SPEC 06 (games) + SPEC 07 (scores), que era la recomendación inicial por ser dos dominios de datos con migración y RLS propios. Se acepta el mayor tamaño a cambio de una sola pasada.
- **Sí:** `games.id` de tipo **`text`** (el slug actual). Mantiene las URLs `/juego/[id]` y `game_id` sin cambios. **No:** uuid como PK; obligaría a un mapeo slug↔id y a tocar rutas.
- **Sí:** `scores.id` **uuid** con `gen_random_uuid()`. Simple y sin colisiones. **No:** `bigint identity`; innecesario para este volumen.
- **Sí:** `best` y `plays` como **columnas estáticas** sembradas. **No:** calcular `best` en vivo desde `scores` ahora; acopla las tablas y se difiere a otro spec.
- **Sí:** **Lectura en cliente** con el browser client y **fallback en runtime** a `GAMES`/`seededScores`. Encaja con las páginas ya cliente y da tolerancia a fallos de BD. **No:** lectura en servidor con props; perdería el fallback en runtime y obligaría a un modelo mixto.
- **Sí:** Convertir `/juego/[id]` a **componente cliente** (opción a), con hooks `useGames()`/`useScores()` comunes a las tres páginas. **No:** dejarlo Server Component con un hijo cliente para el leaderboard; daría lectura mixta del catálogo.
- **Sí:** **Sólo inserción en la BD** al game over (`insertScore`). **No:** mantener la escritura a `localStorage` (`av_scores`) ni una cola offline; se elimina ese camino.
- **Sí:** Conservar `app/data/games.ts` y `app/data/scores.ts` como **única fuente de fallback**. **No:** borrarlos al mover los datos a la BD; son la red de seguridad.
- **Sí:** RLS con **inserción pública anónima** en `scores` (sin auth todavía), guardada por `check` de `score`/`player_name`/`game_id`. **No:** exigir sesión para insertar; la auth es un spec futuro y hoy no hay usuario real.
- **Sí:** `user_id` **nullable** desde ya, para enlazar con auth sin migrar el esquema después. **No:** omitir la columna y añadirla luego.
- **Sí:** `cat`/`color` con **`check`** de valores permitidos. **No:** texto libre; la BD debe rechazar valores inválidos del catálogo.
- **Sí:** **Sembrar** el leaderboard (~12/juego) y usar la **misma semilla** en el fallback. Evita leaderboards vacíos y hace el fallback visualmente idéntico al mock actual. **No:** arrancar con tablas vacías.
- **Sí:** Generar los **tipos TypeScript** del esquema (ahora que existen tablas). **No:** seguir sin tipos; SPEC 04 sólo los difirió por no haber tablas.

---

## Risks

| Riesgo                                                                                                              | Mitigación                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Inserción anónima abierta** en `scores`: cualquiera puede insertar puntuaciones falsas o basura.                  | Guardas por `check` de RLS (`score >= 0`, `player_name` 1–10 chars, `game_id` existente). Rate-limit/moderación quedan explícitamente fuera de este spec. |
| El **fallback** no se dispara (la app se rompe en vez de degradar) si la BD falla en medio de una lectura.          | `fetch*` capturan el error y devuelven `source: "fallback"`; hay criterio de aceptación que exige probarlo con la red desactivada.                        |
| **Hydration mismatch** al leer datos de cliente en el primer render de páginas ahora client-only.                   | Los hooks se instancian tras montar (`useEffect`); estado inicial determinista (`loading`, fallback) y `useSyncExternalStore` ya usado para `user`.       |
| El **catálogo sembrado se desincroniza** del `GAMES` de fallback (valores distintos en BD y hardcode).              | La migración se siembra copiando los valores exactos de `GAMES`; el paso 1 verifica que las 9 filas replican el array.                                    |
| `insertScore` **falla y bloquea** el modal de fin de partida.                                                       | `insertScore` devuelve `{ ok: false }` sin lanzar; el modal muestra guardado igualmente y un aviso discreto. Criterio de aceptación específico.           |
| **RLS mal aplicada** deja `scores`/`games` sin protección o bloquea la lectura pública.                             | `get_advisors` (security) en los pasos 1, 2 y 11; criterio de aceptación de que no reporta tablas sin RLS.                                                |
| Contenido de páginas convertidas a cliente **oculto tras `av-bg`/`av-noise`** por `z-index` (bug de specs previos). | El paso 11 verifica con capturas reales que biblioteca, salón, detalle y modal quedan visibles sobre el fondo.                                            |

---

## What is **not** in this spec

- Autenticación (registro, login, OAuth, modo invitado, enlazar `user_id` a usuarios reales).
- `best` derivado en vivo desde `scores`; sigue como columna estática.
- `plays` como contador real de partidas.
- Escritura de puntuaciones a `localStorage` (`av_scores`) o cola offline; sólo inserción en BD.
- Panel de administración o edición del catálogo desde la app.
- Moderación / anti-abuso (rate-limit, captcha) más allá de las guardas de RLS.
- Paginación / scroll infinito del leaderboard.

Cada uno de esos, si se aborda, va en su propio spec.
