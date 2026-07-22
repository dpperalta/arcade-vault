# Sugerencias de próximos juegos (TODO)

Este archivo lo mantiene el agente `game-planer`. Contiene las recomendaciones vigentes de
qué juego construir después, para que el usuario decida y dispare `/nuevo-juego` manualmente
si acepta alguna. Historial completo en `.claude/agents/game-planer/memoria.md`.

_Última actualización: 2026-07-21 — lote de 20 candidatos (5 por categoría)._

**Contexto de esfuerzo:** `references/started-games/` solo tiene fuente de `asteroids`,
`tetris` y `arkanoid` (los tres ya implementados), así que **todos los candidatos son
esfuerzo alto (desde cero)**. Cobertura actual: ARCADE×2, PUZZLE×1, SHOOTER×1, VERSUS×0.

## Top 3 global sugerido

- [ ] **`invasores`** (SHOOTER) — mock ya en catálogo, input mínimo, el más barato de construir.
- [ ] **`2048`** (PUZZLE) — máxima variedad con mínimo riesgo de implementación.
- [ ] **`ranaria`** o **`estelas`** — mejores relaciones aporte/coste en ARCADE y VERSUS.

---

## ARCADE (5)

- [ ] **`ranaria`** — RANARIA (Frogger), `green`. Cruce de carriles temporizado, tipo snake. Complejidad baja. _Mock del catálogo._
- [ ] **`gloton`** — GLOTÓN (Pac-Man), `yellow`. Laberinto + 4 fantasmas con pathfinding. El más caro. _Mock del catálogo._
- [ ] **`alunizaje`** — ALUNIZAJE (Lunar Lander), `cyan`. Física inercial que reutiliza la base de asteroids.
- [ ] **`excavador`** — EXCAVADOR (Dig Dug), `magenta`. Cavar túneles + IA simple de enemigos.
- [ ] **`bombardero`** — BOMBARDERO (Bomberman 1P), `cyan`. Grilla + bombas en cruz vs CPU (solo modo 1P para encajar).

## PUZZLE (5)

- [ ] **`2048`** — 2048, `yellow`. Fusión por deslizamiento en rejilla 4×4. Menor riesgo, alta variedad.
- [ ] **`sokoban`** — SOKOBAN, `green`. Empujar cajas a objetivos. Motor simple; coste en diseño de niveles.
- [ ] **`buscaminas`** — BUSCAMINAS (Minesweeper), `magenta`. Grilla + flood-fill, input de ratón.
- [ ] **`apagon`** — APAGÓN (Lights Out), `cyan`. Toggle de vecindad 5×5. Mínima superficie de código.
- [ ] **`columnas`** — COLUMNAS (Columns), `green`. Match-3 con caída. _Cercano a tetris; solo como variante distinta._

## SHOOTER (5)

- [ ] **`invasores`** — INVASORES (Space Invaders), `green`. Cañón horizontal + oleadas en formación. El más simple. _Mock del catálogo._
- [ ] **`cienpies`** — CIENPIÉS (Centipede), `cyan`. Ciempiés que se segmenta al dispararle. Mecánica muy distinta.
- [ ] **`defensa-misil`** — DEFENSA MISIL (Missile Command), `yellow`. Apuntado con retículo, disparo posicional.
- [ ] **`enjambre`** — ENJAMBRE (Galaga), `magenta`. Oleadas que rompen formación en picado. _Parcial con invasores: elegir uno._
- [ ] **`escuadron`** — ESCUADRÓN (shmup vertical tipo 1942), `green`. Scroll vertical + oleadas. El más caro del grupo.

## VERSUS (5)

> Rompe el patrón de un jugador por definición: requiere input 2P local o IA de CPU en modo 1P.
> El patrón técnico (motor canvas headless + una pantalla) sí se mantiene.

- [ ] **`duelo-pixel`** — DUELO PIXEL (Pong), `cyan`. Reutiliza el rebote de arkanoid; IA trivial. Mejor entrada a la categoría. _Mock del catálogo._
- [ ] **`estelas`** — ESTELAS (Tron light-cycles), `green`. Grid tipo snake; IA reactiva media.
- [ ] **`disco-hockey`** — DISCO HOCKEY (air hockey), `magenta`. Rebote 2D con mazos; IA media.
- [ ] **`tanques`** — TANQUES (Combat), `yellow`. Rotar/disparar tipo asteroids; el más exigente en teclado e IA.
- [ ] **`rebote-slime`** — REBOTE (slime volleyball), `green`. Gravedad + salto; la física más nueva respecto a lo existente.

---

## Descartados (redundancia con juegos ya reales)

- `bloque-buster` (ARCADE) ≈ `arkanoid` · `serpentina` (ARCADE) ≈ `snake`
- `rocas` (SHOOTER) ≈ `asteroids` · `caida` (PUZZLE) ≈ `tetris`

**Siguiente paso si se aprueba alguno:** `/nuevo-juego` para escribir el spec y luego `/spec-impl`.
