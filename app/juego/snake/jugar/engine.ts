// ===== engine.ts — Snake andamiado en TypeScript (client-only) =====
// Andamiado desde cero (no hay game.js de referencia), reusando el patrón de
// references-vivo de Asteroids (app/juego/asteroids/jugar/engine.ts) pero con
// MOVIMIENTO POR TICK DE REJILLA en vez de física px/s.
//
// Diferencias clave con Asteroids:
//   - Mundo lógico de celdas (GRID_COLS×GRID_ROWS), no px absolutos.
//   - La serpiente avanza 1 paso cada tickInterval(level) acumulando dt.
//   - Una sola vida: al chocar (borde o cola) → gameover directo (sin fase "dead").
//   - HUD: Puntuación / Longitud / Nivel (Longitud ocupa el hueco de "Vidas").
//   - Comida dibujada con SPRITE del atlas de frutas (fallback: círculo neón).
//
// IMPORTANTE: este módulo es client-only. No accede a document/window en el
// import; todo el acceso al DOM ocurre dentro de createSnake().

import { FRUIT_ATLAS, FRUIT_ATLAS_SRC } from "./atlas";

// ── Contrato público ──────────────────────────────────────────────────────────
// Fases: "playing" activo, "paused" congelado, "gameover" fin.
// No hay fase "dead": Snake tiene una sola vida; al chocar → gameover directo.
export type GamePhase = "playing" | "paused" | "gameover";

export interface GameState {
  score: number; // frutas comidas × 10
  length: number; // longitud actual de la serpiente (celdas). Ocupa el hueco de "Vidas"
  level: number; // ⌊frutas / 5⌋ + 1; controla la velocidad del tick
  phase: GamePhase;
}

export interface SnakeHandle {
  pause(): void;
  resume(): void;
  restart(): void;
  forceGameOver(): void; // botón FIN
  resize(): void; // re-mide el contenedor y recalcula el tamaño de celda
  destroy(): void; // cancela el rAF y quita listeners de teclado
}

export interface SnakeOptions {
  onState: (s: GameState) => void; // alimenta el HUD React
  onGameOver: (finalScore: number) => void; // abre el modal
}

// ── Mundo compartido ──────────────────────────────────────────────────────────
interface World {
  W: number; // ancho CSS del canvas (px)
  H: number; // alto CSS del canvas (px)
  cell: number; // lado de cada celda (px)
  offX: number; // offset horizontal para centrar el tablero (px)
  offY: number; // offset vertical para centrar el tablero (px)
  cols: number;
  rows: number;
  ctx: CanvasRenderingContext2D;
}

interface Cell {
  x: number;
  y: number;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
const randInt = (min: number, max: number) =>
  Math.floor(min + Math.random() * (max - min + 1));

// ── Constantes (mundo lógico 24×18 celdas) ─────────────────────────────────────
const GRID_COLS = 24;
const GRID_ROWS = 18; // rejilla 4:3
const START_LEN = 3; // longitud inicial (centro, avanzando a la derecha)
const POINTS_PER_FRUIT = 10; // score por fruta
const FRUITS_PER_LEVEL = 5; // ⌊frutas/5⌋ + 1 = nivel
const BASE_TICK = 0.14; // s/paso en nivel 1 (~7 pasos/s)
const TICK_STEP = 0.012; // s que se resta por nivel (acelera)
const MIN_TICK = 0.05; // cota inferior del intervalo de tick

const tickInterval = (level: number) =>
  Math.max(BASE_TICK - (level - 1) * TICK_STEP, MIN_TICK);

// ── Fábrica ───────────────────────────────────────────────────────────────────
export function createSnake(
  canvas: HTMLCanvasElement,
  opts: SnakeOptions,
): SnakeHandle {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("createSnake: canvas 2d context no disponible");

  const world: World = {
    W: 1,
    H: 1,
    cell: 1,
    offX: 0,
    offY: 0,
    cols: GRID_COLS,
    rows: GRID_ROWS,
    ctx,
  };

  // Teclas del juego: capturamos preventDefault en las flechas para no scrollear.
  const GAME_KEYS = new Set([
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
  ]);

  // ── Sprite del atlas de frutas (con fallback) ────────────────────────────────
  let imgReady = false;
  const img = new Image();
  img.onload = () => {
    imgReady = true;
  };
  img.src = FRUIT_ATLAS_SRC;

  // ── Estado del juego (closures, SSR-safe) ────────────────────────────────────
  let snake: Cell[] = [];
  let dir: Cell = { x: 1, y: 0 };
  let nextDir: Cell = { x: 1, y: 0 };
  let food: Cell = { x: 0, y: 0 };
  let fruitIndex = 0; // índice en FRUIT_ATLAS de la fruta actual
  let score = 0;
  let fruitsEaten = 0;
  let level = 1;
  let accum = 0; // acumulador de dt para el tick de rejilla

  let state: "playing" | "gameover" = "playing";
  let paused = false;
  let gameOverFired = false;
  let raf = 0;
  let lastTime: number | null = null;
  let lastEmitted = "";

  // ── Emisión de estado a React ────────────────────────────────────────────────
  function phase(): GamePhase {
    if (state === "gameover") return "gameover";
    if (paused) return "paused";
    return "playing";
  }

  function emitState(force = false) {
    const snap: GameState = {
      score,
      length: snake.length,
      level,
      phase: phase(),
    };
    const key = `${snap.score}|${snap.length}|${snap.level}|${snap.phase}`;
    if (!force && key === lastEmitted) return;
    lastEmitted = key;
    opts.onState(snap);
  }

  // ── Setup ────────────────────────────────────────────────────────────────────
  function pickFruitSprite() {
    fruitIndex = randInt(0, FRUIT_ATLAS.length - 1);
  }

  // Coloca la comida en una celda libre aleatoria (todas menos el cuerpo).
  // Devuelve false si no quedan celdas libres (tablero lleno = victoria/fin).
  function placeFood(): boolean {
    const occupied = new Set(snake.map((c) => `${c.x},${c.y}`));
    const free: Cell[] = [];
    for (let y = 0; y < world.rows; y++) {
      for (let x = 0; x < world.cols; x++) {
        if (!occupied.has(`${x},${y}`)) free.push({ x, y });
      }
    }
    if (free.length === 0) return false;
    food = free[randInt(0, free.length - 1)];
    pickFruitSprite();
    return true;
  }

  function initGame() {
    const cx = Math.floor(world.cols / 2);
    const cy = Math.floor(world.rows / 2);
    // Serpiente de START_LEN en el centro, cabeza a la derecha.
    snake = [];
    for (let i = 0; i < START_LEN; i++) {
      snake.push({ x: cx - i, y: cy });
    }
    dir = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    score = 0;
    fruitsEaten = 0;
    level = 1;
    accum = 0;
    state = "playing";
    gameOverFired = false;
    placeFood();
  }

  function enterGameOver() {
    state = "gameover";
    if (!gameOverFired) {
      gameOverFired = true;
      opts.onGameOver(score);
    }
  }

  // ── Un paso de rejilla ───────────────────────────────────────────────────────
  function step() {
    // Aplica la dirección buffereada, ignorando la reversa de 180°.
    if (nextDir.x !== -dir.x || nextDir.y !== -dir.y) {
      dir = nextDir;
    }

    const head = snake[0];
    const nx = head.x + dir.x;
    const ny = head.y + dir.y;

    // Colisión con el borde → muerte (sin paredes envolventes).
    if (nx < 0 || ny < 0 || nx >= world.cols || ny >= world.rows) {
      enterGameOver();
      return;
    }

    const eating = nx === food.x && ny === food.y;

    // Colisión con el cuerpo. Si no come, la cola se libera este paso, así que
    // moverse a la celda que la cola va a dejar es válido.
    const body = eating ? snake : snake.slice(0, snake.length - 1);
    for (const c of body) {
      if (c.x === nx && c.y === ny) {
        enterGameOver();
        return;
      }
    }

    // Avanza: nueva cabeza al frente.
    snake.unshift({ x: nx, y: ny });

    if (eating) {
      score += POINTS_PER_FRUIT;
      fruitsEaten++;
      level = Math.floor(fruitsEaten / FRUITS_PER_LEVEL) + 1;
      // No se quita la cola este paso (crece +1). Recoloca la fruta.
      if (!placeFood()) {
        // Tablero lleno: fin de partida.
        enterGameOver();
      }
    } else {
      // Paso normal: descarta la cola.
      snake.pop();
    }
  }

  // ── Update ───────────────────────────────────────────────────────────────────
  function update(dt: number) {
    if (state === "gameover") return;
    accum += dt;
    const interval = tickInterval(level);
    // Un paso por tick; el cap de dt evita ráfagas de pasos gigantes.
    while (accum >= interval && state === "playing") {
      accum -= interval;
      step();
    }
  }

  // ── Draw ─────────────────────────────────────────────────────────────────────
  function drawFood() {
    const c = world.ctx;
    const cell = world.cell;
    const px = world.offX + food.x * cell;
    const py = world.offY + food.y * cell;

    if (imgReady) {
      const s = FRUIT_ATLAS[fruitIndex];
      // Encaja el sprite en la celda preservando su relación de aspecto.
      const pad = cell * 0.08;
      const maxW = cell - pad * 2;
      const maxH = cell - pad * 2;
      const scale = Math.min(maxW / s.w, maxH / s.h);
      const dw = s.w * scale;
      const dh = s.h * scale;
      const dx = px + (cell - dw) / 2;
      const dy = py + (cell - dh) / 2;
      c.drawImage(img, s.x, s.y, s.w, s.h, dx, dy, dw, dh);
    } else {
      // Fallback: círculo neón centrado en la celda.
      const r = cell * 0.32;
      c.save();
      c.fillStyle = "#ff3b6b";
      c.shadowColor = "#ff3b6b";
      c.shadowBlur = 12;
      c.beginPath();
      c.arc(px + cell / 2, py + cell / 2, r, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
  }

  function roundedCell(cx: number, cy: number, inset: number, radius: number) {
    const c = world.ctx;
    const cell = world.cell;
    const x = world.offX + cx * cell + inset;
    const y = world.offY + cy * cell + inset;
    const size = cell - inset * 2;
    const r = Math.min(radius, size / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + size, y, x + size, y + size, r);
    c.arcTo(x + size, y + size, x, y + size, r);
    c.arcTo(x, y + size, x, y, r);
    c.arcTo(x, y, x + size, y, r);
    c.closePath();
  }

  function drawSnake() {
    const c = world.ctx;
    const cell = world.cell;
    const inset = cell * 0.1;

    c.save();
    c.shadowColor = "#22d3ee";
    c.shadowBlur = 10;

    // Cuerpo (de la cola a la cabeza para que la cabeza quede encima).
    for (let i = snake.length - 1; i >= 0; i--) {
      const seg = snake[i];
      const isHead = i === 0;
      c.fillStyle = isHead ? "#67e8f9" : "#22d3ee";
      roundedCell(seg.x, seg.y, inset, cell * 0.28);
      c.fill();
    }
    c.restore();

    // Ojos en la cabeza según la dirección.
    const head = snake[0];
    const hx = world.offX + head.x * cell;
    const hy = world.offY + head.y * cell;
    const eyeR = cell * 0.09;
    const off = cell * 0.26;
    const mid = cell * 0.5;
    // Perpendicular a la dirección para separar los dos ojos.
    const perpX = dir.y;
    const perpY = dir.x;
    const fwd = cell * 0.14;
    const ex = hx + mid + dir.x * fwd;
    const ey = hy + mid + dir.y * fwd;
    c.fillStyle = "#0b1120";
    for (const sgn of [-1, 1]) {
      c.beginPath();
      c.arc(
        ex + perpX * off * sgn,
        ey + perpY * off * sgn,
        eyeR,
        0,
        Math.PI * 2,
      );
      c.fill();
    }
  }

  function drawBoard() {
    const c = world.ctx;
    const cell = world.cell;
    const boardW = world.cols * cell;
    const boardH = world.rows * cell;

    // Fondo del canvas.
    c.fillStyle = "#05070f";
    c.fillRect(0, 0, world.W, world.H);

    // Tablero.
    c.fillStyle = "#0a0f1e";
    c.fillRect(world.offX, world.offY, boardW, boardH);

    // Rejilla sutil.
    c.strokeStyle = "rgba(34, 211, 238, 0.06)";
    c.lineWidth = 1;
    c.beginPath();
    for (let x = 0; x <= world.cols; x++) {
      const px = world.offX + x * cell;
      c.moveTo(px, world.offY);
      c.lineTo(px, world.offY + boardH);
    }
    for (let y = 0; y <= world.rows; y++) {
      const py = world.offY + y * cell;
      c.moveTo(world.offX, py);
      c.lineTo(world.offX + boardW, py);
    }
    c.stroke();

    // Marco del tablero.
    c.strokeStyle = "rgba(34, 211, 238, 0.35)";
    c.lineWidth = 2;
    c.strokeRect(world.offX, world.offY, boardW, boardH);
  }

  function draw() {
    drawBoard();
    drawFood();
    drawSnake();
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

    // Backing store en px físicos; dibujamos en px CSS.
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    world.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    world.W = cssW;
    world.H = cssH;

    // Celdas cuadradas: el lado lo fija la dimensión más ajustada. El tablero
    // se centra en el canvas (las posiciones son celdas lógicas, no se reescalan).
    world.cell = Math.min(cssW / world.cols, cssH / world.rows);
    world.offX = (cssW - world.cols * world.cell) / 2;
    world.offY = (cssH - world.rows * world.cell) / 2;
  }

  // ── Input ────────────────────────────────────────────────────────────────────
  function setDir(x: number, y: number) {
    nextDir = { x, y };
  }

  function onKeyDown(e: KeyboardEvent) {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    switch (e.code) {
      case "ArrowLeft":
      case "KeyA":
        setDir(-1, 0);
        break;
      case "ArrowRight":
      case "KeyD":
        setDir(1, 0);
        break;
      case "ArrowUp":
      case "KeyW":
        setDir(0, -1);
        break;
      case "ArrowDown":
      case "KeyS":
        setDir(0, 1);
        break;
    }
  }

  window.addEventListener("keydown", onKeyDown);

  // ── Arranque ─────────────────────────────────────────────────────────────────
  resize();
  initGame();
  emitState(true);
  raf = requestAnimationFrame(loop);

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
      lastTime = null; // evita un dt gigante al reanudar
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
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
    },
  };
}
