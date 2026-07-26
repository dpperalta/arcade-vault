// ===== engine.ts — Frogger andamiado en TypeScript (client-only) =====
// Andamiado desde cero, reusando el patrón headless de Snake/Asteroids:
//   - Motor sin dependencias de React; todo el acceso a DOM ocurre dentro de
//     createFrogger() (SSR-safe: no toca document/window en el import).
//   - Contrato: createFrogger(canvas, { onState, onGameOver }) → FroggerHandle.
//   - GameState { score, lives, level, phase } alimenta el HUD React; los
//     callbacks del spec (onScoreChange/onLivesChange/onLevelChange) se
//     consolidan en onState, que es lo que consume la play-page del repo.
//
// Mundo lógico: cuadrícula de 16 columnas × 14 filas de 40 px (canvas 640×560),
// escalada con CSS al contenedor. Zonas verticales fijas (0 = arriba):
//   fila 0        → bocas destino (5 nenúfares de 2 columnas)
//   filas 1–6     → río (6 carriles de troncos y tortugas)
//   fila 7        → zona segura intermedia
//   filas 8–12    → carretera (5 carriles de tráfico)
//   fila 13       → base de inicio (zona segura inferior)

// ── Contrato público ──────────────────────────────────────────────────────────
// Fases: "playing" activo, "paused" congelado, "gameover" fin.
export type GamePhase = "playing" | "paused" | "gameover";

export interface GameState {
  score: number; // puntuación acumulada
  lives: number; // vidas restantes (arranca en 3); ocupa el hueco de "Vidas"
  level: number; // ronda/nivel actual; escala velocidad y acorta el tiempo
  phase: GamePhase;
}

export interface FroggerHandle {
  pause(): void;
  resume(): void;
  restart(): void;
  forceGameOver(): void; // botón FIN
  resize(): void; // re-mide el contenedor y recalcula el tamaño de celda
  input(code: string, down: boolean): void; // inyecta input (mando táctil)
  destroy(): void; // cancela el rAF y quita listeners de teclado
}

export interface FroggerOptions {
  onState: (s: GameState) => void; // alimenta el HUD React
  onGameOver: (finalScore: number) => void; // abre el modal
}

// ── Constantes de la cuadrícula y zonas ────────────────────────────────────────
const COLS = 16;
const ROWS = 14;
const CELL = 40; // px lógicos por celda
const CANVAS_W = COLS * CELL; // 640 — se escala con CSS al contenedor
const CANVAS_H = ROWS * CELL; // 560

// Zonas (índice de fila, 0 = arriba)
const ROW_GOALS = 0;
const ROW_RIVER_TOP = 1;
const ROW_RIVER_BOT = 6;
const ROW_SAFE_MID = 7;
const ROW_ROAD_TOP = 8;
const ROW_ROAD_BOT = 12;
const ROW_START = 13;

// Reglas de juego
const START_LIVES = 3;
const HOP_MS = 120; // duración de la animación de salto (ms)
const BASE_TIME = 15; // segundos de temporizador de ronda en nivel 1
const MIN_TIME = 8; // cota inferior del temporizador en niveles altos
const TIME_STEP = 1; // s que se restan al temporizador por nivel
const SPEED_SCALE = 0.15; // +15 % de velocidad por nivel
const GOAL_COUNT = 5; // bocas destino a rellenar por ronda

// Puntuación
const PTS_ADVANCE = 10; // por celda avanzada hacia arriba (primera vez en la ronda)
const PTS_GOAL = 50; // al ocupar una boca destino
const PTS_ROUND = 200; // al completar una ronda
const PTS_TIME_MULT = 10; // bonus de tiempo = tiempo_restante × 10

// ── Tipos locales (no exportados) ──────────────────────────────────────────────
type Direction = "up" | "down" | "left" | "right";

interface Entity {
  col: number; // posición horizontal en celdas (fraccionaria)
  width: number; // ancho en celdas
  type: "car" | "truck" | "log" | "turtle";
  submerged?: boolean; // solo tortugas: true mientras están bajo el agua
  diveT?: number; // solo tortugas: acumulador del ciclo de inmersión (s)
}

interface Lane {
  row: number;
  speed: number; // px/frame base (escalada por nivel)
  dir: 1 | -1; // sentido del desplazamiento horizontal
  entities: Entity[];
}

interface Frog {
  col: number;
  row: number;
  animating: boolean;
  animT: number; // ms transcurridos de la animación de salto en curso
  fromCol: number; // celda de origen del salto (para interpolar el dibujo)
  fromRow: number;
  targetCol: number;
  targetRow: number;
  facing: Direction; // hacia dónde mira la rana
}

// ── Mundo compartido ──────────────────────────────────────────────────────────
interface World {
  W: number; // ancho CSS del canvas (px)
  H: number; // alto CSS del canvas (px)
  cell: number; // lado de cada celda (px)
  offX: number; // offset horizontal para centrar el tablero (px)
  offY: number; // offset vertical para centrar el tablero (px)
  ctx: CanvasRenderingContext2D;
}

// ── Fábrica ───────────────────────────────────────────────────────────────────
export function createFrogger(
  canvas: HTMLCanvasElement,
  opts: FroggerOptions,
): FroggerHandle {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("createFrogger: canvas 2d context no disponible");

  const world: World = {
    W: 1,
    H: 1,
    cell: 1,
    offX: 0,
    offY: 0,
    ctx,
  };

  // Teclas del juego: preventDefault en las flechas para no scrollear.
  const GAME_KEYS = new Set([
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
  ]);

  // ── Estado del juego (closures, SSR-safe) ────────────────────────────────────
  let lanes: Lane[] = [];
  let goals: boolean[] = new Array(GOAL_COUNT).fill(false); // bocas ocupadas
  let frog: Frog = newFrog();
  let score = 0;
  let lives = START_LIVES;
  let level = 1;
  let roundTime = BASE_TIME; // tiempo restante de la ronda (s)
  let pendingDir: Direction | null = null;
  let maxRowReached = ROW_START; // fila más alta alcanzada en la ronda (para PTS_ADVANCE)

  let state: "playing" | "gameover" = "playing";
  let paused = false;
  let gameOverFired = false;
  let raf = 0;
  let lastTime: number | null = null;
  let lastEmitted = "";

  function newFrog(): Frog {
    const startCol = Math.floor(COLS / 2);
    return {
      col: startCol,
      row: ROW_START,
      animating: false,
      animT: 0,
      fromCol: startCol,
      fromRow: ROW_START,
      targetCol: startCol,
      targetRow: ROW_START,
      facing: "up",
    };
  }

  // ── Emisión de estado a React ────────────────────────────────────────────────
  function phase(): GamePhase {
    if (state === "gameover") return "gameover";
    if (paused) return "paused";
    return "playing";
  }

  function emitState(force = false) {
    const snap: GameState = { score, lives, level, phase: phase() };
    const key = `${snap.score}|${snap.lives}|${snap.level}|${snap.phase}`;
    if (!force && key === lastEmitted) return;
    lastEmitted = key;
    opts.onState(snap);
  }

  // ── Setup ────────────────────────────────────────────────────────────────────
  function initGame() {
    score = 0;
    lives = START_LIVES;
    level = 1;
    goals = new Array(GOAL_COUNT).fill(false);
    lanes = buildLanes(level);
    roundTime = roundTimeForLevel(level);
    maxRowReached = ROW_START;
    frog = newFrog();
    pendingDir = null;
    state = "playing";
    gameOverFired = false;
  }

  function roundTimeForLevel(lvl: number): number {
    return Math.max(BASE_TIME - (lvl - 1) * TIME_STEP, MIN_TIME);
  }

  // buildLanes se implementa en el Paso 3.
  function buildLanes(_level: number): Lane[] {
    return [];
  }

  function enterGameOver() {
    state = "gameover";
    if (!gameOverFired) {
      gameOverFired = true;
      opts.onGameOver(score);
    }
  }

  // ── Update / Draw (se implementan en pasos 4–7) ──────────────────────────────
  function update(_dt: number) {
    // Lógica de entidades, salto de la rana, soporte, colisiones y temporizador.
  }

  function draw() {
    // Placeholder: fondo. El dibujo por zonas y entidades llega en el Paso 4.
    const c = world.ctx;
    c.fillStyle = "#05070f";
    c.fillRect(0, 0, world.W, world.H);
  }

  // ── Loop ─────────────────────────────────────────────────────────────────────
  function loop(ts: number) {
    raf = requestAnimationFrame(loop);
    const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;
    if (!paused) update(dt);
    draw();
    emitState();
  }

  // ── Resize / mundo responsive ────────────────────────────────────────────────
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    world.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    world.W = cssW;
    world.H = cssH;

    // Celdas cuadradas: el lado lo fija la dimensión más ajustada; el tablero
    // (16×14) se centra en el canvas.
    world.cell = Math.min(cssW / COLS, cssH / ROWS);
    world.offX = (cssW - COLS * world.cell) / 2;
    world.offY = (cssH - ROWS * world.cell) / 2;
  }

  // ── Input ────────────────────────────────────────────────────────────────────
  function applyKey(code: string, down: boolean) {
    if (!down) return;
    switch (code) {
      case "ArrowLeft":
      case "KeyA":
        pendingDir = "left";
        break;
      case "ArrowRight":
      case "KeyD":
        pendingDir = "right";
        break;
      case "ArrowUp":
      case "KeyW":
        pendingDir = "up";
        break;
      case "ArrowDown":
      case "KeyS":
        pendingDir = "down";
        break;
    }
  }
  function onKeyDown(e: KeyboardEvent) {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    applyKey(e.code, true);
  }

  window.addEventListener("keydown", onKeyDown);

  // ── Arranque ─────────────────────────────────────────────────────────────────
  resize();
  initGame();
  emitState(true);
  raf = requestAnimationFrame(loop);

  // Referencias reservadas para pasos posteriores (evita warnings de no-usado).
  void CANVAS_W;
  void CANVAS_H;
  void ROW_GOALS;
  void ROW_RIVER_TOP;
  void ROW_RIVER_BOT;
  void ROW_SAFE_MID;
  void ROW_ROAD_TOP;
  void ROW_ROAD_BOT;
  void HOP_MS;
  void SPEED_SCALE;
  void PTS_ADVANCE;
  void PTS_GOAL;
  void PTS_ROUND;
  void PTS_TIME_MULT;

  // ── Handle público ───────────────────────────────────────────────────────────
  return {
    pause() {
      if (paused || state === "gameover") return;
      paused = true;
      emitState(true);
    },
    resume() {
      if (!paused) return;
      paused = false;
      lastTime = null;
      emitState(true);
    },
    restart() {
      paused = false;
      lastTime = null;
      initGame();
      emitState(true);
    },
    forceGameOver() {
      if (state === "gameover") return;
      paused = false;
      enterGameOver();
      emitState(true);
    },
    resize() {
      resize();
    },
    input(code: string, down: boolean) {
      applyKey(code, down);
    },
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
    },
  };
}
