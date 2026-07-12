// ===== engine.ts — Tetris portado a TypeScript (client-only) =====
// Portado de references/started-games/03-tetris/game.js.
// Cambios respecto al original:
//   - Rejilla dibujada con dimensiones dinámicas: el tablero 10×20 (portrait) se
//     centra dentro del canvas con letterboxing; celda (cell) calculada en resize().
//   - Sin HUD DOM (#score/#lines/#level) ni overlay internos (los pinta React).
//   - Sin reinicio interno ni pausa por tecla P (los maneja la plataforma).
//   - API createTetris(canvas, { onState, onGameOver }) con
//     pause/resume/restart/forceGameOver/resize/destroy.
//
// IMPORTANTE: este módulo es client-only. No accede a document/window en el
// import; todo el acceso al DOM ocurre dentro de createTetris().

// ── Contrato público ──────────────────────────────────────────────────────────
export type GamePhase = "playing" | "paused" | "gameover";

export interface GameState {
  score: number;
  lines: number; // líneas totales limpiadas
  level: number;
  phase: GamePhase;
}

export interface TetrisHandle {
  pause(): void;
  resume(): void;
  restart(): void;
  forceGameOver(): void; // botón FIN
  resize(): void; // re-mide el contenedor y recoloca el tablero
  destroy(): void; // cancela el rAF y quita listeners
}

export interface TetrisOptions {
  onState: (s: GameState) => void; // HUD React
  onGameOver: (finalScore: number) => void; // abre el modal
}

// ── Constantes del juego (idénticas al original) ───────────────────────────────
const COLS = 10;
const ROWS = 20;

const COLORS: (string | null)[] = [
  null,
  "#4dd0e1", // I - cyan
  "#ffd54f", // O - yellow
  "#ba68c8", // T - purple
  "#81c784", // S - green
  "#e57373", // Z - red
  "#90caf9", // J - pale blue
  "#ffb74d", // L - orange
  "#9e9e9e", // N - tuerca (gris metálico)
];

const PIECES: (number[][] | null)[] = [
  null,
  [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ], // I
  [
    [2, 2],
    [2, 2],
  ], // O
  [
    [0, 3, 0],
    [3, 3, 3],
    [0, 0, 0],
  ], // T
  [
    [0, 4, 4],
    [4, 4, 0],
    [0, 0, 0],
  ], // S
  [
    [5, 5, 0],
    [0, 5, 5],
    [0, 0, 0],
  ], // Z
  [
    [6, 0, 0],
    [6, 6, 6],
    [0, 0, 0],
  ], // J
  [
    [0, 0, 7],
    [7, 7, 7],
    [0, 0, 0],
  ], // L
  [
    [8, 8, 8],
    [8, 0, 8],
    [8, 8, 8],
  ], // N (tuerca)
];

const LINE_SCORES = [0, 100, 300, 500, 800];
const PANEL_COLS = 5; // gutter a la derecha para "SIGUIENTE"

interface Piece {
  type: number;
  shape: number[][];
  x: number;
  y: number;
}

// ── Fábrica ───────────────────────────────────────────────────────────────────
export function createTetris(
  canvas: HTMLCanvasElement,
  opts: TetrisOptions,
): TetrisHandle {
  const maybeCtx = canvas.getContext("2d");
  if (!maybeCtx)
    throw new Error("createTetris: canvas 2d context no disponible");
  const ctx: CanvasRenderingContext2D = maybeCtx;

  // Teclas del juego: preventDefault para no scrollear la página.
  const GAME_KEYS = new Set([
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "KeyX",
    "Space",
  ]);

  // Estado del juego
  let board: number[][] = [];
  let current: Piece;
  let next: Piece;
  let score = 0;
  let lines = 0;
  let level = 1;
  let dropInterval = 1000; // ms
  let dropAccum = 0;
  let state: "playing" | "gameover" = "playing";

  let paused = false;
  let gameOverFired = false;
  let raf = 0;
  let lastTime: number | null = null;
  let lastEmitted = "";

  // Render (px CSS): dimensiones y layout del tablero, recalculados en resize().
  let W = 1;
  let H = 1;
  let cell = 10;
  let originX = 0;
  let originY = 0;
  let panelX = 0;

  // ── Emisión de estado a React ────────────────────────────────────────────────
  function phase(): GamePhase {
    if (paused) return "paused";
    return state;
  }

  function emitState(force = false) {
    const snap: GameState = { score, lines, level, phase: phase() };
    const key = `${snap.score}|${snap.lines}|${snap.level}|${snap.phase}`;
    if (!force && key === lastEmitted) return;
    lastEmitted = key;
    opts.onState(snap);
  }

  // ── Lógica (portada 1:1 del original) ────────────────────────────────────────
  function createBoard(): number[][] {
    return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  }

  function randomPiece(): Piece {
    const type = Math.floor(Math.random() * 8) + 1;
    const shape = PIECES[type]!.map((row) => [...row]);
    return {
      type,
      shape,
      x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2),
      y: 0,
    };
  }

  function collide(shape: number[][], ox: number, oy: number): boolean {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const nx = ox + c;
        const ny = oy + r;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && board[ny][nx]) return true;
      }
    }
    return false;
  }

  function rotateCW(shape: number[][]): number[][] {
    const rows = shape.length;
    const cols = shape[0].length;
    const result: number[][] = Array.from({ length: cols }, () =>
      new Array(rows).fill(0),
    );
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) result[c][rows - 1 - r] = shape[r][c];
    return result;
  }

  function tryRotate() {
    const rotated = rotateCW(current.shape);
    const kicks = [0, -1, 1, -2, 2];
    for (const kick of kicks) {
      if (!collide(rotated, current.x + kick, current.y)) {
        current.shape = rotated;
        current.x += kick;
        return;
      }
    }
  }

  function merge() {
    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[r].length; c++)
        if (current.shape[r][c])
          board[current.y + r][current.x + c] = current.shape[r][c];
  }

  function clearLines() {
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r].every((v) => v !== 0)) {
        board.splice(r, 1);
        board.unshift(new Array(COLS).fill(0));
        cleared++;
        r++;
      }
    }
    if (cleared) {
      lines += cleared;
      score += (LINE_SCORES[cleared] || 0) * level;
      level = Math.floor(lines / 10) + 1;
      dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    }
  }

  function ghostY(): number {
    let gy = current.y;
    while (!collide(current.shape, current.x, gy + 1)) gy++;
    return gy;
  }

  function hardDrop() {
    const gy = ghostY();
    score += (gy - current.y) * 2;
    current.y = gy;
    lockPiece();
  }

  function softDrop() {
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
      score += 1;
    } else {
      lockPiece();
    }
  }

  function lockPiece() {
    merge();
    clearLines();
    spawn();
  }

  function spawn() {
    current = next;
    next = randomPiece();
    if (collide(current.shape, current.x, current.y)) enterGameOver();
  }

  function enterGameOver() {
    state = "gameover";
    if (!gameOverFired) {
      gameOverFired = true;
      opts.onGameOver(score);
    }
  }

  function gravity() {
    if (!collide(current.shape, current.x, current.y + 1)) current.y++;
    else lockPiece();
  }

  // ── Setup ────────────────────────────────────────────────────────────────────
  function initGame() {
    board = createBoard();
    score = 0;
    lines = 0;
    level = 1;
    dropInterval = 1000;
    dropAccum = 0;
    state = "playing";
    gameOverFired = false;
    next = randomPiece();
    spawn();
  }

  // ── Draw ─────────────────────────────────────────────────────────────────────
  function drawCell(
    gx: number,
    gy: number,
    colorIndex: number,
    size: number,
    ox: number,
    oy: number,
    alpha = 1,
  ) {
    const color = COLORS[colorIndex];
    if (!color) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(ox + gx * size + 1, oy + gy * size + 1, size - 2, size - 2);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(ox + gx * size + 1, oy + gy * size + 1, size - 2, 4);
    ctx.globalAlpha = 1;
  }

  function drawBoardGrid() {
    ctx.strokeStyle = "rgba(0,245,255,0.08)";
    ctx.lineWidth = 1;
    for (let c = 1; c < COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(originX + c * cell, originY);
      ctx.lineTo(originX + c * cell, originY + ROWS * cell);
      ctx.stroke();
    }
    for (let r = 1; r < ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(originX, originY + r * cell);
      ctx.lineTo(originX + COLS * cell, originY + r * cell);
      ctx.stroke();
    }
  }

  function drawNextPanel() {
    const boxCells = 4;
    const label = "SIGUIENTE";
    ctx.fillStyle = "rgba(0,245,255,0.7)";
    ctx.font = `${Math.max(9, Math.floor(cell * 0.42))}px monospace`;
    ctx.textBaseline = "top";
    ctx.fillText(label, panelX, originY);

    const boxY = originY + Math.floor(cell * 1.1);
    const shape = next.shape;
    const offX = Math.floor((boxCells - shape[0].length) / 2);
    const offY = Math.floor((boxCells - shape.length) / 2);
    for (let r = 0; r < shape.length; r++)
      for (let c = 0; c < shape[r].length; c++)
        if (shape[r][c])
          drawCell(offX + c, offY + r, shape[r][c], cell, panelX, boxY);
  }

  function draw() {
    // Fondo del canvas (letterbox).
    ctx.fillStyle = "#05010a";
    ctx.fillRect(0, 0, W, H);

    // Fondo del tablero.
    ctx.fillStyle = "#0a0a18";
    ctx.fillRect(originX, originY, COLS * cell, ROWS * cell);
    drawBoardGrid();

    // Piezas fijadas.
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        drawCell(c, r, board[r][c], cell, originX, originY);

    if (current) {
      // Pieza fantasma.
      const gy = ghostY();
      for (let r = 0; r < current.shape.length; r++)
        for (let c = 0; c < current.shape[r].length; c++)
          if (current.shape[r][c])
            drawCell(
              current.x + c,
              gy + r,
              current.shape[r][c],
              cell,
              originX,
              originY,
              0.2,
            );

      // Pieza actual.
      for (let r = 0; r < current.shape.length; r++)
        for (let c = 0; c < current.shape[r].length; c++)
          if (current.shape[r][c])
            drawCell(
              current.x + c,
              current.y + r,
              current.shape[r][c],
              cell,
              originX,
              originY,
            );
    }

    // Borde neón del tablero.
    ctx.strokeStyle = "rgba(0,245,255,0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(originX, originY, COLS * cell, ROWS * cell);

    if (next) drawNextPanel();
  }

  // ── Loop ─────────────────────────────────────────────────────────────────────
  function loop(ts: number) {
    raf = requestAnimationFrame(loop);
    const dt = lastTime === null ? 0 : Math.min(ts - lastTime, 100);
    lastTime = ts;
    if (!paused && state === "playing") {
      dropAccum += dt;
      if (dropAccum >= dropInterval) {
        dropAccum = 0;
        gravity();
      }
    }
    draw();
    emitState();
  }

  // ── Resize / letterboxing ────────────────────────────────────────────────────
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    // Backing store en px físicos; dibujamos en px CSS.
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    W = cssW;
    H = cssH;

    // Celda entera que hace caber tablero (COLS) + panel (PANEL_COLS) en ancho y ROWS en alto.
    const layoutCols = COLS + PANEL_COLS;
    cell = Math.max(4, Math.floor(Math.min(cssW / layoutCols, cssH / ROWS)));

    const totalW = layoutCols * cell;
    const totalH = ROWS * cell;
    originX = Math.floor((cssW - totalW) / 2);
    originY = Math.floor((cssH - totalH) / 2);
    panelX = originX + COLS * cell + Math.floor(cell * 0.5);
  }

  // ── Input ────────────────────────────────────────────────────────────────────
  function onKeyDown(e: KeyboardEvent) {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (paused || state !== "playing") return;
    switch (e.code) {
      case "ArrowLeft":
        if (!collide(current.shape, current.x - 1, current.y)) current.x--;
        break;
      case "ArrowRight":
        if (!collide(current.shape, current.x + 1, current.y)) current.x++;
        break;
      case "ArrowDown":
        softDrop();
        break;
      case "ArrowUp":
      case "KeyX":
        tryRotate();
        break;
      case "Space":
        hardDrop();
        break;
    }
    emitState();
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
      lastTime = null; // evita un salto de dt al reanudar
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
