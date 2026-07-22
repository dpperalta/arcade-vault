# Memoria de game-planer

Historial de juegos sugeridos por `game-planer` y su resultado (aceptado / descartado / pendiente). Cada ejecución del agente agrega una entrada nueva al final sin borrar las anteriores.

<!--
Formato de entrada, ej.:

## 2026-07-21
- Sugerido: `invasores` (SHOOTER, sin started-game fuente, esfuerzo alto)
- Motivo: encaja con el patrón (arcade de una pantalla, un jugador); categoría SHOOTER ya cubierta por asteroids pero con mecánica distinta (oleadas fijas vs. físico-inercial).
- Descartados: `duelo-pixel` (VERSUS, requiere input de 2 jugadores simultáneo — no encaja con el patrón de un jugador de los juegos actuales).
- Estado: pendiente de decisión del usuario.
-->

## 2026-07-21

- **Sugerido:** `invasores` (SHOOTER, color `green`, sin fuente en `started-games/` → esfuerzo alto, desde cero).
- **Motivo:** encaja de lleno con el patrón (arcade de una sola pantalla, un jugador, motor `engine.ts` headless + `page.tsx`, sin infra nueva más allá de `games`/`scores`). Cubre la categoría SHOOTER pero con mecánica claramente distinta a asteroids (oleadas en formación fija + cañón horizontal vs. físico-inercial toroidal). Input mínimo (mover en horizontal + disparar), muy cercano en complejidad a arkanoid → riesgo bajo de implementación.
- **Alternativas consideradas:**
  - `ranaria` (Frogger, ARCADE, green) — encaja bien (grilla + timing, tipo snake), pero ARCADE ya tiene 2 juegos reales (arkanoid, snake); menos aporte a la variedad.
  - `gloton` (Pac-Man, ARCADE, yellow) — encaja, pero la IA de 4 fantasmas (pathfinding) sube la complejidad por encima de la media de los juegos actuales; segunda opción, no primera.
  - `bloque-buster` (ARCADE) y `rocas` (SHOOTER) — descartados por redundancia: son casi calcos de `arkanoid` y `asteroids` ya implementados.
  - `caida` (PUZZLE) — descartado, duplica a `tetris`.
  - `duelo-pixel` (VERSUS) — categoría aún sin cubrir, pero su gracia es el 2 jugadores local; en modo 1P solo-vs-CPU pierde identidad y exige IA de paleta. No encaja limpio con el patrón de un jugador. Candidato futuro si se quiere abrir la categoría VERSUS explícitamente.
- **Estado:** pendiente de decisión del usuario.

## 2026-07-21 (lote de 20 — ejecución en paralelo por categoría)

Contexto común: `references/started-games/` solo tiene fuente de `asteroids`/`tetris`/`arkanoid` (los tres ya implementados) → **todos los candidatos de abajo son esfuerzo alto (desde cero)**. Cobertura actual de juegos reales: ARCADE×2 (arkanoid, snake), PUZZLE×1 (tetris), SHOOTER×1 (asteroids), VERSUS×0.

**ARCADE (5):**

- `gloton` (Pac-Man, yellow) — laberinto + IA de 4 fantasmas; el más caro por pathfinding. Mock del catálogo.
- `ranaria` (Frogger, green) — cruce de carriles temporizado, tipo snake; complejidad baja, mejor relación aporte/coste. Mock del catálogo.
- `alunizaje` (Lunar Lander, cyan) — física inercial reutilizando base de asteroids.
- `excavador` (Dig Dug, magenta) — cavar túneles + IA simple.
- `bombardero` (Bomberman 1P, cyan) — grilla + bombas en cruz vs CPU (solo modo 1P para encajar).

**PUZZLE (5):**

- `2048` (yellow) — fusión por deslizamiento en rejilla 4×4; máxima variedad, mínimo riesgo. Recomendado #1 de la categoría.
- `sokoban` (green) — empujar cajas a objetivos; motor más simple, coste en diseño de niveles.
- `buscaminas` (Minesweeper, magenta) — grilla + flood-fill, input de ratón como mecánica central.
- `apagon` (Lights Out, cyan) — toggle de vecindad 5×5; menor superficie de código.
- `columnas` (Columns, green) — match-3 con caída; el más cercano a tetris, solo como variante distinta.

**SHOOTER (5):**

- `invasores` (Space Invaders, green) — cañón horizontal + oleadas en formación; mock del catálogo, el más simple. **Sigue siendo la recomendación global #1.**
- `enjambre` (Galaga, magenta) — oleadas que rompen formación en picado; parcial con invasores (elegir uno).
- `cienpies` (Centipede, cyan) — ciempiés que se segmenta al disparar; mecánica muy distinta.
- `defensa-misil` (Missile Command, yellow) — apuntado con retículo, disparo posicional.
- `escuadron` (shmup vertical tipo 1942, green) — scroll vertical de fondo + oleadas; el más caro del grupo.

**VERSUS (5):** (rompe el patrón 1-jugador por definición; se permite 2P local o 1P vs CPU)

- `duelo-pixel` (Pong, cyan) — mock del catálogo; reutiliza rebote de arkanoid, IA trivial. Mejor entrada a la categoría.
- `estelas` (Tron light-cycles, green) — grid tipo snake; IA reactiva media.
- `disco-hockey` (air hockey, magenta) — rebote 2D con mazos; IA media.
- `tanques` (Combat, yellow) — rotar/disparar tipo asteroids; el más exigente en teclado/IA.
- `rebote-slime` (slime volleyball, green) — gravedad + salto, física más nueva respecto a lo existente.

**Descartados (redundancia con juegos ya reales):** `bloque-buster`≈arkanoid, `serpentina`≈snake, `rocas`≈asteroids, `caida`≈tetris.

**Estado:** pendientes de decisión del usuario. Prioridad global sugerida: `invasores` → `2048` → `ranaria`/`estelas`.
