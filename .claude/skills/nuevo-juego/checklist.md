# checklist.md — apoyo técnico de `/nuevo-juego`

Referencia técnica que consulta el `SKILL.md` al **redactar el spec** (Data model + Implementation
plan de la Fase 3): este detalle debe verterse en el spec para que la implementación posterior
(manual o vía `/spec-impl`) no tenga que consultar esta skill. No es texto para copiar literal: es la
forma que hay que respetar. La plantilla viva de código sigue siendo
`app/juego/asteroids/jugar/engine.ts` y `app/juego/asteroids/jugar/page.tsx`.

---

## A. Checklist de porteo del motor (`game.js` → `engine.ts`)

Al portar un `game.js` vanilla, aplica **estas 10 transformaciones**. Al andamiar desde cero,
implementa las mismas piezas respetando el contrato.

1. **Contrato público arriba del archivo.** `GamePhase`, `GameState`, `<X>Handle`, `<X>Options`,
   `createX(canvas, opts)` (ver sección B).
2. **`World` en vez de globales.** Sustituye `const W = 800; const H = 600;` y el `ctx` global por
   `interface World { W; H; ctx; keys }`. Pásalo a cada `update(dt, w)` / `draw(w)`. Las entidades
   dejan de leer globales.
3. **Estado en closures.** Lo que en `game.js` eran `let` globales (`ship`, `bullets`, `score`, …)
   se declara **dentro** de `createX(canvas, opts)`. Nada de estado a nivel de módulo (client-only
   seguro para SSR de Next).
4. **`resize()` con devicePixelRatio.** Mide `getBoundingClientRect()`; `canvas.width = cssW * dpr`,
   `canvas.height = cssH * dpr`; `ctx.setTransform(dpr,0,0,dpr,0,0)` (dibujas en px CSS, backing store
   en px físicos); **reescala posiciones proporcionalmente** (`sx = cssW/oldW`, `sy = cssH/oldH`).
   Las velocidades quedan en **px/s absolutos** (no se escalan).
5. **`emitState()` con dedupe por clave.** Construye un snapshot `GameState` y una clave string
   (`"score|lives|level|…|phase"`); solo llama `opts.onState(snap)` si la clave cambió respecto a la
   última emitida. `force=true` en transiciones. Se llama cada frame en el loop, dispara solo en cambios.
6. **Loop con pausa.** `loop(ts)` agenda siempre el siguiente `requestAnimationFrame`, **dibuja
   siempre**, y hace `update(dt)` **solo si `!paused`**. `dt = Math.min((ts-last)/1000, 0.05)` (cap
   anti-spiral al volver de una pestaña en segundo plano).
7. **Handle completo.** `pause()`/`resume()` togglean el flag + `emitState(true)`; `restart()` resetea
   `lastTime=null` e `initGame()`; `forceGameOver()` fuerza el fin y dispara `onGameOver(score)` una
   sola vez (guard `gameOverFired`); `resize()` (punto 4); `destroy()` (punto 8).
8. **`destroy()` limpio.** `cancelAnimationFrame(raf)` + quitar los listeners de teclado. Se llama en
   el cleanup del `useEffect` de la página.
9. **`GAME_KEYS` + `preventDefault`.** Un `Set` con las teclas del juego; en keydown/keyup haz
   `e.preventDefault()` para no scrollear la página. Listeners en `window`, removidos en `destroy()`.
10. **Borrar del original.** `drawHUD()`, iconos de vida, overlay interno "GAME OVER" y el reinicio por
    tecla. Todo eso lo pinta/gestiona React ahora. La **física y las clases se copian 1:1**.

---

## B. Plantilla del contrato (ajusta los campos de `GameState` al juego)

```ts
// Fases: "playing" activo, "dead" respawn breve, "paused" congelado, "gameover" fin.
export type GamePhase = "playing" | "dead" | "paused" | "gameover";

// Vocabulario que cruza la frontera motor→React. VARÍA por juego:
//   asteroids → { score, lives, level, tripleShot, phase }
//   tetris    → { score, lines, level, phase }
//   arkanoid  → { score, lives, level, phase }
export interface GameState {
  score: number;
  // ...campos propios del juego...
  phase: GamePhase;
}

export interface XHandle {
  pause(): void;
  resume(): void;
  restart(): void;
  forceGameOver(): void; // botón FIN
  resize(): void; // re-mide el contenedor y reescala el mundo
  destroy(): void; // cancela el rAF y quita listeners
}

export interface XOptions {
  onState: (s: GameState) => void; // alimenta el HUD React
  onGameOver: (finalScore: number) => void; // abre el modal
}

export function createX(canvas: HTMLCanvasElement, opts: XOptions): XHandle;
```

En la página (`page.tsx`), el HUD lee de `GameState`; si el juego no tiene "vidas" (p. ej. tetris),
sustituye ese `.hud-stat` por el campo real (`Líneas`) — **para, propón opciones y confirma** antes
de inventar un campo.

---

## C. Supabase: catálogo + leaderboard sembrado

### C.1 — Fila del catálogo (respeta los `check`)

`cat ∈ {ARCADE, PUZZLE, SHOOTER, VERSUS}`, `color ∈ {cyan, magenta, yellow, green}`. `sort_order`
= máximo actual + 1. Los valores deben ser **idénticos** a la ficha añadida en `app/data/games.ts`.

```sql
insert into public.games
  (id, title, short, long, cat, cover, color, best, plays, play_href, sort_order)
values
  ('<slug>', '<TITLE>', '<short>', '<long>', '<CAT>', 'cover-<slug>',
   '<color>', <best>, '<plays>', '/juego/<slug>/jugar',
   (select coalesce(max(sort_order), 0) + 1 from public.games));
```

### C.2 — Leaderboard sembrado con paridad BD↔fallback

El fallback en runtime usa `seededScores(slug.length * 17 + 3, 12)` (ver `app/data/scores.ts`). Para
que la tabla y el fallback muestren **exactamente** las mismas filas, genera el `INSERT` desde esa
misma lógica. Corre este script Node (replica `seededScores` y construye `created_at` UTC a partir del
`date` para que la fecha mostrada coincida):

```js
// node scripts/seed-scores.mjs <slug>   → imprime el INSERT por stdout
const slug = process.argv[2];
const PLAYERS = [
  "PX_KAI",
  "NEONFOX",
  "Z3R0COOL",
  "M00NRYU",
  "VAULT_07",
  "GLITCHA",
  "ATARI_KID",
  "CYBER_LU",
  "MAGENTA88",
  "SCANLINE",
  "BIT_LORD",
  "ARKADYA",
  "DROID_X",
  "RGB_QUEEN",
  "PIXEL_DAD",
  "RETROVIRA",
  "VECTORX",
  "JOY_STK",
];
function seededScores(seed, count = 12) {
  let s = seed;
  const rand = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const used = new Set();
  const rows = [];
  for (let i = 0; i < count; i++) {
    let name;
    do {
      name = PLAYERS[Math.floor(rand() * PLAYERS.length)];
    } while (used.has(name) && used.size < PLAYERS.length);
    used.add(name);
    const base = Math.floor(50000 + rand() * 250000);
    const score = base - i * Math.floor(2000 + rand() * 4000);
    const day = String(1 + Math.floor(rand() * 28)).padStart(2, "0");
    const mon = String(1 + Math.floor(rand() * 12)).padStart(2, "0");
    rows.push({ name, score: Math.max(score, 1000), day, mon });
  }
  return rows.sort((a, b) => b.score - a.score);
}
const rows = seededScores(slug.length * 17 + 3, 12);
const values = rows
  .map(
    (r) =>
      `('${slug}', '${r.name}', ${r.score}, null, '2026-${r.mon}-${r.day}T00:00:00Z')`,
  )
  .join(",\n  ");
console.log(
  `insert into public.scores (game_id, player_name, score, user_id, created_at) values\n  ${values};`,
);
```

Notas:

- `created_at` se fija a medianoche UTC del `DD/MM/2026` que produce la semilla, porque
  `mapScores`/`formatDate` en `app/data/catalog.ts` formatea con partes **UTC** → así la fecha visible
  en `/salon` coincide entre BD y fallback.
- Todos los `player_name` de `PLAYERS` tienen ≤ 10 chars y los `score` son ≥ 1000, así que pasan los
  `check` de RLS de `scores`.
- Ejecuta el `INSERT` resultante dentro de la misma migración `apply_migration` que la fila del
  catálogo (o en una segunda migración `seed_scores_<slug>`).

### C.3 — Verificación

- `get_advisors` categoría `security` → sin tablas sin RLS ni hallazgos nuevos.
- `select count(*) from public.scores where game_id = '<slug>'` → 12.
- `select * from public.games where id = '<slug>'` → 1 fila con `sort_order` correcto.
