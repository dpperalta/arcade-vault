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

// ── Skins / paletas ───────────────────────────────────────────────────────────
export type SkinName = "clasico" | "neon" | "retro";

// Todos los slots de color que el juego dibuja. Ninguna función de dibujo usa
// literales sueltos: todo color visible sale de la paleta activa.
export interface Palette {
  // Fondos por zona.
  bg: string; // fondo del canvas (bandas fuera del tablero)
  goalBand: string; // banda de metas (fila 0)
  river: string; // río
  safe: string; // zonas seguras (media + base de inicio)
  road: string; // carretera
  // Metas / nenúfares.
  goalFill: string; // relleno de la boca destino
  goalBorder: string; // borde de la boca
  goalFrog: string; // silueta de rana en boca ocupada
  // Vehículos.
  carBodies: Record<string, string>; // carrocería de coche por fila (8–12)
  carDefault: string; // fallback de carrocería de coche
  truckBody: string; // carrocería de camión
  truckCab: string; // cabina de camión
  wheel: string; // ruedas
  // Río.
  log: string; // tronco
  logGrain: string; // vetas de la madera (stroke)
  turtle: string; // caparazón de tortuga a flote
  turtleScale: string; // patrón de escamas (stroke)
  turtleSubmerged: string; // contorno de tortuga sumergida (stroke)
  // Rana.
  frog: string; // cuerpo de la rana
  frogLeg: string; // patas durante el salto
  frogGlow: string; // color del shadow (glow)
  frogGlowBlur: number; // radio del shadowBlur (0 = sin glow)
  eye: string; // esclerótica del ojo
  pupil: string; // pupila del ojo
  // HUD.
  timeBarBg: string; // fondo de la barra de tiempo
  timeHigh: string; // barra > 50 %
  timeMid: string; // barra 25–50 %
  timeLow: string; // barra < 25 %
  score: string; // texto de puntuación
  levelText: string; // texto de nivel
  livesIcon: string; // iconos de vida
}

export const SKINS: Record<SkinName, Palette> = {
  // Fiel al look original: extraído tal cual de los literales hardcodeados.
  clasico: {
    bg: "#05070f",
    goalBand: "#06210f",
    river: "#0b2545",
    safe: "#123a1f",
    road: "#131319",
    goalFill: "#0a3d1f",
    goalBorder: "#d4af37",
    goalFrog: "#4ade80",
    carBodies: {
      "8": "#f59e0b",
      "9": "#38bdf8",
      "10": "#ef4444",
      "11": "#a3a3a3",
      "12": "#ec4899",
    },
    carDefault: "#ef4444",
    truckBody: "#8b8b93",
    truckCab: "#5b5b63",
    wheel: "#0a0a0f",
    log: "#7c4a21",
    logGrain: "rgba(60,30,10,0.55)",
    turtle: "#0e9f6e",
    turtleScale: "rgba(6,60,40,0.6)",
    turtleSubmerged: "rgba(52,211,153,0.4)",
    frog: "#4ade80",
    frogLeg: "#16a34a",
    frogGlow: "#4ade80",
    frogGlowBlur: 8,
    eye: "#fff",
    pupil: "#0a0a0f",
    timeBarBg: "rgba(0,0,0,0.5)",
    timeHigh: "#4ade80",
    timeMid: "#facc15",
    timeLow: "#ef4444",
    score: "#fff",
    levelText: "#facc15",
    livesIcon: "#4ade80",
  },
  // Variante brillante, saturada, con glow alto.
  neon: {
    bg: "#05010f",
    goalBand: "#1b0140",
    river: "#101a7a",
    safe: "#083a44",
    road: "#150a2e",
    goalFill: "#0d0630",
    goalBorder: "#ffd60a",
    goalFrog: "#39ff14",
    carBodies: {
      "8": "#ffb300",
      "9": "#00f0ff",
      "10": "#ff2fd0",
      "11": "#c8b6ff",
      "12": "#ff1e8a",
    },
    carDefault: "#ff2fd0",
    truckBody: "#b06bff",
    truckCab: "#7a2fff",
    wheel: "#12002a",
    log: "#ff7a1a",
    logGrain: "rgba(255,180,80,0.5)",
    turtle: "#00ffa3",
    turtleScale: "rgba(0,80,60,0.7)",
    turtleSubmerged: "rgba(0,255,180,0.5)",
    frog: "#39ff14",
    frogLeg: "#00c853",
    frogGlow: "#39ff14",
    frogGlowBlur: 16,
    eye: "#faff00",
    pupil: "#12002a",
    timeBarBg: "rgba(0,0,0,0.5)",
    timeHigh: "#39ff14",
    timeMid: "#fdff5a",
    timeLow: "#ff2fd0",
    score: "#00f0ff",
    levelText: "#faff00",
    livesIcon: "#39ff14",
  },
  // Variante apagada tipo CRT fósforo ámbar/verde, contraste bajo.
  retro: {
    bg: "#0d0a02",
    goalBand: "#12180a",
    river: "#152112",
    safe: "#1e2a12",
    road: "#14140c",
    goalFill: "#12200e",
    goalBorder: "#b8860b",
    goalFrog: "#8f9f4f",
    carBodies: {
      "8": "#b58a3c",
      "9": "#7f9a52",
      "10": "#a86a3c",
      "11": "#8a8a5a",
      "12": "#9a7a4a",
    },
    carDefault: "#a86a3c",
    truckBody: "#6b6b4a",
    truckCab: "#4a4a30",
    wheel: "#0a0a04",
    log: "#5c4326",
    logGrain: "rgba(40,28,10,0.55)",
    turtle: "#6f8f4f",
    turtleScale: "rgba(30,40,20,0.6)",
    turtleSubmerged: "rgba(120,150,90,0.4)",
    frog: "#8f9f4f",
    frogLeg: "#5f6f2f",
    frogGlow: "#8f9f4f",
    frogGlowBlur: 3,
    eye: "#d2c078",
    pupil: "#0a0a04",
    timeBarBg: "rgba(0,0,0,0.5)",
    timeHigh: "#8f9f4f",
    timeMid: "#c8a24a",
    timeLow: "#a8542f",
    score: "#d2c078",
    levelText: "#c8a24a",
    livesIcon: "#8f9f4f",
  },
};

const DEFAULT_SKIN: SkinName = "clasico";

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
  setSkin(name: SkinName): void; // cambia el tema visual en vivo
  input(code: string, down: boolean): void; // inyecta input (mando táctil)
  destroy(): void; // cancela el rAF y quita listeners de teclado
}

export interface FroggerOptions {
  onState: (s: GameState) => void; // alimenta el HUD React
  onGameOver: (finalScore: number) => void; // abre el modal
  skin?: SkinName; // tema visual inicial (default "clasico")
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
const TURTLE_VISIBLE = 3; // s que un grupo de tortugas permanece a flote (soporte)
const TURTLE_SUBMERGED = 1.5; // s que permanece bajo el agua (sin soporte)

// Puntuación
const PTS_ADVANCE = 10; // por celda avanzada hacia arriba (primera vez en la ronda)
const PTS_GOAL = 50; // al ocupar una boca destino
const PTS_ROUND = 200; // al completar una ronda
const PTS_TIME_MULT = 10; // bonus de tiempo = tiempo_restante × 10

// ── Tipos locales (no exportados) ──────────────────────────────────────────────
type Direction = "up" | "down" | "left" | "right";

// SPEC 12 — Constantes de dibujo promovidas a nivel de módulo. Antes nacían
// dentro de drawFrog(), es decir 60 veces por segundo.
const FWD: Record<Direction, readonly [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};
const SIGNS = [-1, 1] as const; // patas y ojos: par simétrico

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
  // SPEC 12 — `String(row)` precalculado en makeLane(). Se cachea la CLAVE y no
  // el color ya resuelto: setSkin() reasigna world.palette en vivo, así que el
  // color debe seguir leyéndose de la paleta activa en cada frame.
  carBodyKey: string;
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
  palette: Palette; // paleta activa (skin)
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
    palette: SKINS[opts.skin ?? DEFAULT_SKIN] ?? SKINS[DEFAULT_SKIN],
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
  // SPEC 12 — Último estado emitido, desglosado en escalares. Antes era una
  // clave `${score}|${lives}|...`, un string nuevo por frame aunque se
  // descartara al instante.
  let lastScore = -1;
  let lastLives = -1;
  let lastLevel = -1;
  let lastPhase: GamePhase | null = null;

  // SPEC 12 — Caché de la fuente del HUD. La cadena solo depende de world.cell,
  // que únicamente cambia en resize(); antes se recomponía en cada frame.
  let hudFontCell = -1;
  let hudFontStr = "";

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

  // Se llama una vez por frame desde draw(): compara escalares y solo construye
  // el objeto GameState cuando algo cambió de verdad (SPEC 12).
  function emitState(force = false) {
    const ph = phase();
    if (
      !force &&
      score === lastScore &&
      lives === lastLives &&
      level === lastLevel &&
      ph === lastPhase
    ) {
      return;
    }
    lastScore = score;
    lastLives = lives;
    lastLevel = level;
    lastPhase = ph;
    opts.onState({ score, lives, level, phase: ph });
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

  // Construye los carriles de carretera (filas 8–12) y río (filas 1–6) para un
  // nivel dado. Cada nivel multiplica todas las velocidades por (1+15%)^(nivel-1).
  // Las tortugas se modelan como una entidad `turtle` de ancho = tamaño del grupo
  // (2–3), de modo que soporte, colisión e inmersión operan sobre el grupo entero.
  function buildLanes(lvl: number): Lane[] {
    const factor = Math.pow(1 + SPEED_SCALE, lvl - 1);

    // Config por carril: sentido, velocidad base (celdas/s), y layout de entidades.
    interface LaneCfg {
      row: number;
      dir: 1 | -1;
      speed: number; // celdas/segundo (nivel 1)
      type: Entity["type"];
      width: number; // ancho de cada entidad (celdas); en tortugas = tamaño de grupo
      count: number; // nº de entidades en el carril
      gap: number; // hueco entre entidades (celdas, ≥1 para ser atravesable)
    }

    // Carretera (fila 12 = la más cercana al inicio, arriba hacia peligro creciente).
    const roadCfgs: LaneCfg[] = [
      { row: 12, dir: -1, speed: 1.6, type: "car", width: 1, count: 4, gap: 3 },
      {
        row: 11,
        dir: 1,
        speed: 1.1,
        type: "truck",
        width: 3,
        count: 3,
        gap: 4,
      },
      { row: 10, dir: -1, speed: 2.4, type: "car", width: 1, count: 4, gap: 3 },
      { row: 9, dir: 1, speed: 1.9, type: "car", width: 2, count: 3, gap: 4 },
      {
        row: 8,
        dir: -1,
        speed: 3.0,
        type: "truck",
        width: 2,
        count: 3,
        gap: 4,
      },
    ];

    // Río (fila 6 = la más cercana a la zona segura). Troncos y grupos de tortugas.
    const riverCfgs: LaneCfg[] = [
      { row: 6, dir: 1, speed: 1.4, type: "log", width: 3, count: 3, gap: 3 },
      {
        row: 5,
        dir: -1,
        speed: 1.9,
        type: "turtle",
        width: 3,
        count: 3,
        gap: 3,
      },
      { row: 4, dir: 1, speed: 2.2, type: "log", width: 2, count: 4, gap: 2 },
      {
        row: 3,
        dir: -1,
        speed: 1.6,
        type: "turtle",
        width: 2,
        count: 3,
        gap: 3,
      },
      { row: 2, dir: 1, speed: 1.2, type: "log", width: 4, count: 3, gap: 3 },
      { row: 1, dir: -1, speed: 2.6, type: "log", width: 3, count: 3, gap: 3 },
    ];

    const makeLane = (cfg: LaneCfg): Lane => {
      const entities: Entity[] = [];
      const period = cfg.width + cfg.gap;
      for (let i = 0; i < cfg.count; i++) {
        const e: Entity = {
          col: i * period,
          width: cfg.width,
          type: cfg.type,
        };
        if (cfg.type === "turtle") {
          e.submerged = false;
          // Fase inicial escalonada del ciclo de inmersión, para que no se
          // sumerjan todos los grupos a la vez.
          e.diveT = Math.random() * (TURTLE_VISIBLE + TURTLE_SUBMERGED);
        }
        entities.push(e);
      }
      return {
        row: cfg.row,
        dir: cfg.dir,
        speed: cfg.speed * factor,
        entities,
        carBodyKey: String(cfg.row),
      };
    };

    return [...roadCfgs, ...riverCfgs].map(makeLane);
  }

  function enterGameOver() {
    state = "gameover";
    if (!gameOverFired) {
      gameOverFired = true;
      opts.onGameOver(score);
    }
  }

  // ── Helpers de geometría y zonas ─────────────────────────────────────────────
  const clamp = (v: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, v));

  const isRiverRow = (row: number) =>
    row >= ROW_RIVER_TOP && row <= ROW_RIVER_BOT;

  function laneAt(row: number): Lane | null {
    return lanes.find((l) => l.row === row) ?? null;
  }

  // Layout de las 5 bocas: boca i ocupa las columnas {1+3i, 2+3i}; las columnas
  // 0,3,6,9,12,15 son muro/hueco. Devuelve el índice de boca o -1 si no hay boca.
  function goalIndexForCol(col: number): number {
    for (let i = 0; i < GOAL_COUNT; i++) {
      if (col === 1 + 3 * i || col === 2 + 3 * i) return i;
    }
    return -1;
  }

  // ── Colisiones, soporte y meta ───────────────────────────────────────────────
  // Punto de prueba: centro de la celda que ocupa la rana.
  const frogCenter = () => frog.col + 0.5;

  const covers = (e: Entity, x: number) => x >= e.col && x < e.col + e.width;

  // Colisión con un vehículo: la rana está en un carril de carretera y su centro
  // cae dentro del rango de alguna entidad de ese carril.
  function checkRoadCollision(): boolean {
    const lane = laneAt(frog.row);
    if (!lane) return false;
    if (frog.row < ROW_ROAD_TOP || frog.row > ROW_ROAD_BOT) return false;
    const x = frogCenter();
    return lane.entities.some((e) => covers(e, x));
  }

  // Entidad de río que soporta a la rana, o null si está sobre el agua. Una
  // tortuga sumergida no da soporte.
  function getSupport(): Entity | null {
    const lane = laneAt(frog.row);
    if (!lane) return null;
    const x = frogCenter();
    for (const e of lane.entities) {
      if (!covers(e, x)) continue;
      if (e.type === "turtle" && e.submerged) return null;
      return e;
    }
    return null;
  }

  // Meta: la rana llegó a la fila superior. Si cae en una boca libre, la ocupa y
  // puntúa; si no hay boca o ya está ocupada, muere.
  function checkGoal() {
    const gi = goalIndexForCol(Math.round(frog.col));
    if (gi === -1 || goals[gi]) {
      killFrog();
      return;
    }
    goals[gi] = true;
    // Puntúa el avance hasta la fila de metas, la boca y el bonus de tiempo.
    if (ROW_GOALS < maxRowReached) {
      score += (maxRowReached - ROW_GOALS) * PTS_ADVANCE;
    }
    score += PTS_GOAL;
    score += Math.max(0, Math.ceil(roundTime)) * PTS_TIME_MULT;

    // ¿Todas las bocas llenas? → ronda completada. Si no, nueva rana desde la base.
    if (goals.every(Boolean)) {
      score += PTS_ROUND;
      completeRound();
    } else {
      frog = newFrog();
      maxRowReached = ROW_START;
      roundTime = roundTimeForLevel(level);
    }
  }

  // Resuelve la celda de aterrizaje tras completar un salto: muerte / meta /
  // puntuación por avance.
  function resolveCell() {
    if (frog.row === ROW_GOALS) {
      checkGoal();
      return;
    }
    if (isRiverRow(frog.row)) {
      if (!getSupport()) {
        killFrog(); // cae al agua
        return;
      }
    } else if (checkRoadCollision()) {
      killFrog(); // atropellada
      return;
    }
    // Sobrevive: puntúa cada celda nueva avanzada hacia arriba.
    if (frog.row < maxRowReached) {
      score += (maxRowReached - frog.row) * PTS_ADVANCE;
      maxRowReached = frog.row;
    }
  }

  // Ronda completada: reinicia la rana en la base, vacía las bocas, sube de nivel,
  // reconstruye los carriles (más rápidos) y resetea el temporizador.
  function completeRound() {
    level += 1;
    goals = new Array(GOAL_COUNT).fill(false);
    lanes = buildLanes(level);
    roundTime = roundTimeForLevel(level);
    maxRowReached = ROW_START;
    frog = newFrog();
    pendingDir = null;
    // El HUD React refleja el nuevo nivel en el próximo emitState() del loop.
  }
  // Muerte de la rana: resta una vida. Con 0 vidas → game over; si quedan vidas,
  // la rana vuelve a la base y el temporizador se reinicia. Las bocas ya
  // ocupadas se conservan durante la ronda.
  function killFrog() {
    if (state !== "playing") return;
    lives -= 1;
    if (lives <= 0) {
      lives = 0;
      emitState(true); // notifica onLivesChange(0) antes del game over
      enterGameOver();
      return;
    }
    frog = newFrog();
    pendingDir = null;
    maxRowReached = ROW_START;
    roundTime = roundTimeForLevel(level);
  }

  // ── Salto de la rana ─────────────────────────────────────────────────────────
  function startHop(dir: Direction) {
    // Base entera: en el río la rana viaja con col fraccionaria sobre el tronco.
    const baseCol = Math.round(frog.col);
    let tc = baseCol;
    let tr = frog.row;
    if (dir === "up") tr--;
    else if (dir === "down") tr++;
    else if (dir === "left") tc--;
    else tc++;

    // No puede salir por los bordes laterales ni por arriba/abajo del tablero.
    tc = clamp(tc, 0, COLS - 1);
    tr = clamp(tr, ROW_GOALS, ROW_START);

    frog.facing = dir;
    // Si el destino coincide con el origen (choca con un borde), solo reorienta.
    if (tc === baseCol && tr === frog.row) {
      frog.col = baseCol;
      return;
    }

    frog.animating = true;
    frog.animT = 0;
    frog.fromCol = frog.col;
    frog.fromRow = frog.row;
    frog.targetCol = tc;
    frog.targetRow = tr;
  }

  // ── Update ───────────────────────────────────────────────────────────────────
  function update(dt: number) {
    if (state !== "playing") return;

    // 1) Avanzar entidades de cada carril y reintroducirlas por el lado opuesto.
    for (const lane of lanes) {
      for (const e of lane.entities) {
        e.col += lane.speed * lane.dir * dt;
        if (lane.dir === 1 && e.col > COLS) e.col = -e.width;
        else if (lane.dir === -1 && e.col + e.width < 0) e.col = COLS;

        // Ciclo de inmersión de las tortugas (visible → sumergida → visible).
        if (e.type === "turtle") {
          e.diveT = (e.diveT ?? 0) + dt;
          const period = TURTLE_VISIBLE + TURTLE_SUBMERGED;
          if (e.diveT >= period) e.diveT -= period;
          e.submerged = e.diveT >= TURTLE_VISIBLE;
        }
      }
    }

    // 2) Salto de la rana.
    if (frog.animating) {
      frog.animT += dt * 1000; // dt está en segundos; animT en ms
      if (frog.animT >= HOP_MS) {
        frog.col = frog.targetCol;
        frog.row = frog.targetRow;
        frog.animating = false;
        frog.animT = 0;
        resolveCell(); // muerte / meta / puntuación (Paso 5)
      }
    } else if (pendingDir) {
      startHop(pendingDir);
      pendingDir = null;
    } else if (isRiverRow(frog.row)) {
      // En el río y en reposo: si hay soporte, la rana viaja con la entidad;
      // si no, o si el arrastre la saca del tablero, muere.
      const sup = getSupport();
      if (sup) {
        const lane = laneAt(frog.row);
        if (lane) frog.col += lane.speed * lane.dir * dt;
        if (frog.col < 0 || frog.col > COLS - 1) killFrog();
      } else {
        killFrog(); // cae al agua
      }
    }

    // 3) Colisión con vehículos (en reposo dentro de la carretera).
    if (!frog.animating && checkRoadCollision()) killFrog();

    // 4) Temporizador de ronda.
    roundTime -= dt;
    if (roundTime <= 0) killFrog();
  }

  // ── Draw ─────────────────────────────────────────────────────────────────────
  function px(col: number): number {
    return world.offX + col * world.cell;
  }
  function py(row: number): number {
    return world.offY + row * world.cell;
  }

  function fillRows(rowA: number, rowB: number, color: string) {
    const c = world.ctx;
    c.fillStyle = color;
    c.fillRect(
      world.offX,
      py(rowA),
      COLS * world.cell,
      (rowB - rowA + 1) * world.cell,
    );
  }

  function drawEntity(lane: Lane, e: Entity) {
    const c = world.ctx;
    const cell = world.cell;
    const p = world.palette;
    const x = px(e.col);
    const y = py(lane.row);
    const w = e.width * cell;
    const pad = cell * 0.12;

    if (e.type === "car" || e.type === "truck") {
      const isTruck = e.type === "truck";
      c.fillStyle = isTruck
        ? p.truckBody
        : (p.carBodies[lane.carBodyKey] ?? p.carDefault);
      c.fillRect(x + pad, y + pad, w - pad * 2, cell - pad * 2);
      // Cabina diferenciada del camión.
      if (isTruck) {
        c.fillStyle = p.truckCab;
        const cabW = cell * 0.6;
        const cabX = lane.dir === 1 ? x + w - pad - cabW : x + pad;
        c.fillRect(cabX, y + pad, cabW, cell - pad * 2);
      }
      // Ruedas.
      c.fillStyle = p.wheel;
      const wr = cell * 0.08;
      const wy1 = y + cell - pad - wr;
      c.beginPath();
      c.arc(x + pad + wr * 2, wy1, wr, 0, Math.PI * 2);
      c.arc(x + w - pad - wr * 2, wy1, wr, 0, Math.PI * 2);
      c.fill();
    } else if (e.type === "log") {
      c.fillStyle = p.log;
      c.fillRect(x, y + pad, w, cell - pad * 2);
      // Textura de líneas de la madera.
      c.strokeStyle = p.logGrain;
      c.lineWidth = 1;
      c.beginPath();
      for (let lx = x + cell * 0.3; lx < x + w; lx += cell * 0.5) {
        c.moveTo(lx, y + pad);
        c.lineTo(lx, y + cell - pad);
      }
      c.stroke();
    } else if (e.type === "turtle") {
      // Cada celda del grupo es una tortuga.
      for (let i = 0; i < e.width; i++) {
        const cx = px(e.col + i) + cell / 2;
        const cy = y + cell / 2;
        const r = cell * 0.36;
        if (e.submerged) {
          c.strokeStyle = p.turtleSubmerged;
          c.lineWidth = 1.5;
          c.beginPath();
          c.arc(cx, cy, r, 0, Math.PI * 2);
          c.stroke();
        } else {
          c.fillStyle = p.turtle;
          c.beginPath();
          c.arc(cx, cy, r, 0, Math.PI * 2);
          c.fill();
          // Patrón de escamas.
          c.strokeStyle = p.turtleScale;
          c.lineWidth = 1;
          c.beginPath();
          c.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
          c.stroke();
        }
      }
    }
  }

  function drawGoals() {
    const c = world.ctx;
    const cell = world.cell;
    const p = world.palette;
    for (let i = 0; i < GOAL_COUNT; i++) {
      const startCol = 1 + 3 * i;
      const x = px(startCol);
      const y = py(ROW_GOALS);
      const w = 2 * cell;
      // Nenúfar/boca: rectángulo verde oscuro con borde dorado.
      c.fillStyle = p.goalFill;
      c.fillRect(x, y, w, cell);
      c.strokeStyle = p.goalBorder;
      c.lineWidth = 2;
      c.strokeRect(x + 1, y + 1, w - 2, cell - 2);
      // Si está ocupada, dibujar silueta de rana dentro.
      if (goals[i]) {
        c.fillStyle = p.goalFrog;
        c.beginPath();
        c.ellipse(
          x + w / 2,
          y + cell / 2,
          cell * 0.28,
          cell * 0.24,
          0,
          0,
          Math.PI * 2,
        );
        c.fill();
      }
    }
  }

  function drawFrog() {
    const c = world.ctx;
    const cell = world.cell;
    const p = world.palette;
    // Posición interpolada durante el salto.
    let fc = frog.col;
    let fr = frog.row;
    if (frog.animating) {
      const t = Math.min(frog.animT / HOP_MS, 1);
      fc = frog.fromCol + (frog.targetCol - frog.fromCol) * t;
      fr = frog.fromRow + (frog.targetRow - frog.fromRow) * t;
    }
    const cx = px(fc) + cell / 2;
    const cy = py(fr) + cell / 2;

    c.save();
    c.shadowColor = p.frogGlow;
    c.shadowBlur = p.frogGlowBlur;
    // Patas extendidas durante el salto.
    if (frog.animating) {
      c.fillStyle = p.frogLeg;
      const legR = cell * 0.1;
      for (const sx of SIGNS) {
        c.beginPath();
        c.arc(cx + sx * cell * 0.32, cy + cell * 0.22, legR, 0, Math.PI * 2);
        c.fill();
      }
    }
    // Cuerpo.
    c.fillStyle = p.frog;
    c.beginPath();
    c.ellipse(cx, cy, cell * 0.35, cell * 0.3, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();

    // Ojos (dos círculos blancos con pupila), desplazados según orientación.
    const [dx, dy] = FWD[frog.facing];
    const perpX = dy;
    const perpY = dx;
    const eyeOff = cell * 0.16;
    const eyeFwd = cell * 0.14;
    for (const sgn of SIGNS) {
      const ex = cx + dx * eyeFwd + perpX * eyeOff * sgn;
      const ey = cy + dy * eyeFwd + perpY * eyeOff * sgn;
      c.fillStyle = p.eye;
      c.beginPath();
      c.arc(ex, ey, cell * 0.08, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = p.pupil;
      c.beginPath();
      c.arc(ex, ey, cell * 0.04, 0, Math.PI * 2);
      c.fill();
    }
  }

  function drawHud() {
    const c = world.ctx;
    const cell = world.cell;
    const p = world.palette;
    const boardW = COLS * cell;
    // La cadena de c.font solo cambia cuando cambia el tamaño de celda.
    if (cell !== hudFontCell) {
      hudFontCell = cell;
      hudFontStr = `${Math.max(11, cell * 0.34)}px "Geist Mono", monospace`;
    }

    // Barra de tiempo: franja fina en el borde superior del tablero (fila 0).
    const tRatio = clamp(roundTime / roundTimeForLevel(level), 0, 1);
    const barH = Math.max(4, cell * 0.14);
    c.fillStyle = p.timeBarBg;
    c.fillRect(world.offX, world.offY, boardW, barH);
    const barColor =
      tRatio > 0.5 ? p.timeHigh : tRatio > 0.25 ? p.timeMid : p.timeLow;
    c.fillStyle = barColor;
    c.fillRect(world.offX, world.offY, boardW * tRatio, barH);

    c.save();
    c.font = hudFontStr;
    c.textBaseline = "top";
    const ty = world.offY + barH + cell * 0.08;
    // Score arriba-izquierda.
    c.fillStyle = p.score;
    c.textAlign = "left";
    c.fillText(String(score), world.offX + cell * 0.15, ty);
    // Nivel arriba-centro.
    c.textAlign = "center";
    c.fillStyle = p.levelText;
    c.fillText(`NIVEL ${level}`, world.offX + boardW / 2, ty);
    c.restore();

    // Vidas como iconos de rana arriba-derecha.
    const r = cell * 0.12;
    for (let i = 0; i < lives; i++) {
      const lx = world.offX + boardW - cell * 0.25 - i * (r * 2.6) - r;
      const ly = world.offY + barH + cell * 0.22;
      c.fillStyle = p.livesIcon;
      c.beginPath();
      c.arc(lx, ly, r, 0, Math.PI * 2);
      c.fill();
    }
  }

  function draw() {
    const c = world.ctx;
    const p = world.palette;
    // Fondo del canvas (bandas fuera del tablero).
    c.fillStyle = p.bg;
    c.fillRect(0, 0, world.W, world.H);

    // Fondos por zona.
    fillRows(ROW_GOALS, ROW_GOALS, p.goalBand); // banda de metas
    fillRows(ROW_RIVER_TOP, ROW_RIVER_BOT, p.river); // río
    fillRows(ROW_SAFE_MID, ROW_SAFE_MID, p.safe); // zona segura media
    fillRows(ROW_ROAD_TOP, ROW_ROAD_BOT, p.road); // carretera
    fillRows(ROW_START, ROW_START, p.safe); // base de inicio

    // Entidades por carril.
    for (const lane of lanes) {
      for (const e of lane.entities) drawEntity(lane, e);
    }

    drawGoals();
    drawFrog();
    drawHud();
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
  // CANVAS_W/CANVAS_H documentan el tamaño lógico (640×560); el mundo se escala
  // por celda en resize(), así que no se referencian directamente.
  void CANVAS_W;
  void CANVAS_H;

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
    setSkin(name: SkinName) {
      world.palette = SKINS[name] ?? SKINS[DEFAULT_SKIN];
      draw(); // redibuja de inmediato con la nueva paleta (cambio en vivo)
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
