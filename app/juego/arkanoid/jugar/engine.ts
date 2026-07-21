// ===== engine.ts — Arkanoid portado a TypeScript (client-only) =====
// Portado de references/started-games/04-arkanoid/game.js + levels.js.
// Cambios respecto al original:
//   - Mundo lógico fijo 800×600; resize() sólo re-mide el backing store y
//     escala logical→físico con setTransform (la física queda 1:1). El marco
//     CRT es 4/3, así que no hay deformación.
//   - Render con primitivas neón (rects + glow), sin spritesheet PNG.
//   - Rotura de bloque con partículas/flash en vez de la explosión por frames.
//   - Sin drawHUD (score/nivel/vidas) ni overlays "GAME OVER"/"¡Completaste!"
//     ni pausa con salto de nivel: los pinta React.
//   - Sin audio, sin pausa por P/Escape, sin reinicio interno.
//   - Victoria (limpiar nivel 5) = fin de partida → onGameOver(score).
//   - API createArkanoid(canvas, { onState, onGameOver }) con
//     pause/resume/restart/forceGameOver/resize/destroy.
//
// IMPORTANTE: este módulo es client-only. No accede a document/window en el
// import; todo el acceso al DOM ocurre dentro de createArkanoid().

// ── Contrato público ──────────────────────────────────────────────────────────
// Fases: "playing" activo, "paused" congelado, "gameover" fin.
// No hay fase "dead": al perder pelota se re-sirve directo (lives--) sin pausa.
export type GamePhase = "playing" | "paused" | "gameover";

export interface GameState {
  score: number;
  lives: number; // inicia en 3
  level: number; // 1..5
  phase: GamePhase;
}

export interface ArkanoidHandle {
  pause(): void;
  resume(): void;
  restart(): void;
  forceGameOver(): void; // botón FIN
  resize(): void; // re-mide el contenedor y reescala el mundo
  destroy(): void; // cancela el rAF y quita listeners (teclado + ratón)
}

export interface ArkanoidOptions {
  onState: (s: GameState) => void; // alimenta el HUD React
  onGameOver: (finalScore: number) => void; // abre el modal (game over Y victoria)
}

// ── Mundo compartido ──────────────────────────────────────────────────────────
interface World {
  W: number;
  H: number;
  ctx: CanvasRenderingContext2D;
  keys: Record<string, boolean>;
}

// ── Constantes portadas 1:1 de game.js ─────────────────────────────────────────
const LOGICAL_W = 800;
const LOGICAL_H = 600;
const PADDLE_SPEED = 400; // px/s (teclado)
const BLOCK_COLS = 10;
const BLOCK_W = 64;
const BLOCK_H = 24;
const BLOCKS_ORIGIN_X = (LOGICAL_W - BLOCK_COLS * BLOCK_W) / 2; // 80
const BLOCKS_ORIGIN_Y = 80;
const BASE_BALL_VX = 200;
const BASE_BALL_VY = -300;
const PADDLE_W = 81;
const PADDLE_H = 14;
const PADDLE_Y = 560;
const BALL_SIZE = 16;

// ── Niveles portados 1:1 de levels.js ──────────────────────────────────────────
type LogicColor =
  "red" | "yellow" | "cyan" | "magenta" | "hotpink" | "green" | "gray";

interface LevelBlock {
  col: number;
  row: number;
  color: LogicColor;
}
interface Level {
  speed: number;
  blocks: LevelBlock[];
}

const LEVELS: Level[] = (() => {
  const rowColors1: LogicColor[] = [
    "red",
    "yellow",
    "cyan",
    "magenta",
    "hotpink",
    "green",
  ];
  const rowColors2: LogicColor[] = [
    "gray",
    "cyan",
    "hotpink",
    "yellow",
    "magenta",
    "green",
  ];
  const rowColors4: LogicColor[] = [
    "cyan",
    "magenta",
    "green",
    "yellow",
    "hotpink",
    "red",
  ];

  const l1: LevelBlock[] = [];
  for (let row = 0; row < 6; row++)
    for (let col = 0; col < 10; col++)
      l1.push({ col, row, color: rowColors1[row] });

  const l2: LevelBlock[] = [];
  const pyStart = [4, 3, 2, 1, 0, 0];
  const pyEnd = [5, 6, 7, 8, 9, 9];
  for (let row = 0; row < 6; row++)
    for (let col = pyStart[row]; col <= pyEnd[row]; col++)
      l2.push({ col, row, color: rowColors2[row] });

  const l3: LevelBlock[] = [];
  for (let row = 0; row < 6; row++)
    for (let col = 0; col < 10; col++)
      if ((col + row) % 2 === 0)
        l3.push({ col, row, color: row < 3 ? "yellow" : "magenta" });

  const gaps4 = [
    [2, 5, 8],
    [0, 4, 7, 9],
    [1, 3, 6],
    [2, 5, 8, 9],
    [0, 4, 7],
    [1, 3, 6, 9],
  ];
  const l4: LevelBlock[] = [];
  for (let row = 0; row < 6; row++)
    for (let col = 0; col < 10; col++)
      if (!gaps4[row].includes(col))
        l4.push({ col, row, color: rowColors4[row] });

  const l5: LevelBlock[] = [];
  for (let row = 0; row < 6; row++)
    for (let col = 0; col < 10; col++) {
      const isFrame = col === 0 || col === 9 || row === 0 || row === 5;
      const isCross = col === 4 || row === 2;
      if (isFrame || isCross)
        l5.push({ col, row, color: isCross && !isFrame ? "hotpink" : "cyan" });
    }

  return [
    { speed: 1.0, blocks: l1 },
    { speed: 1.1, blocks: l2 },
    { speed: 1.21, blocks: l3 },
    { speed: 1.33, blocks: l4 },
    { speed: 1.46, blocks: l5 },
  ];
})();

// Mapa de colores lógicos → paleta neón CRT (app/globals.css).
const NEON: Record<LogicColor, string> = {
  red: "#ff2d55",
  yellow: "#f5ff00",
  cyan: "#00f5ff",
  magenta: "#ff006e",
  hotpink: "#ff5cc8",
  green: "#00ff88",
  gray: "#9aa0c4",
};

// ── Utils ─────────────────────────────────────────────────────────────────────
const rand = (min: number, max: number) => min + Math.random() * (max - min);

// ── Entidades ───────────────────────────────────────────────────────────────
interface Paddle {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Ball {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
}
interface Block {
  x: number;
  y: number;
  w: number;
  h: number;
  color: LogicColor;
  alive: boolean;
}

// Partícula/flash de rotura de bloque (reemplaza la explosión por spritesheet).
class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  ttl: number;
  color: string;
  dead = false;

  constructor(x: number, y: number, color: string) {
    this.x = x;
    this.y = y;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(60, 220);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = rand(0.18, 0.32);
    this.ttl = this.life;
    this.color = color;
  }

  update(dt: number) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const alpha = Math.max(0, this.ttl / this.life);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 8;
    ctx.fillRect(this.x - 2, this.y - 2, 4, 4);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
}

// ── Fábrica ───────────────────────────────────────────────────────────────────
export function createArkanoid(
  canvas: HTMLCanvasElement,
  opts: ArkanoidOptions,
): ArkanoidHandle {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("createArkanoid: canvas 2d context no disponible");

  // Mundo lógico fijo 800×600 (la física es 1:1 con el original).
  const world: World = { W: LOGICAL_W, H: LOGICAL_H, ctx, keys: {} };

  // Teclas del juego: preventDefault para no scrollear la página.
  const GAME_KEYS = new Set(["ArrowLeft", "ArrowRight"]);

  // Estado del juego (en closures, nada a nivel de módulo → SSR-safe).
  const paddle: Paddle = { x: 0, y: PADDLE_Y, w: PADDLE_W, h: PADDLE_H };
  const ball: Ball = {
    x: 0,
    y: 0,
    w: BALL_SIZE,
    h: BALL_SIZE,
    vx: BASE_BALL_VX,
    vy: BASE_BALL_VY,
  };
  let blocks: Block[] = [];
  let particles: Particle[] = [];
  let lives = 3;
  let score = 0;
  let currentLevel = 1;
  let state: "playing" | "gameover" = "playing";

  let paused = false;
  let gameOverFired = false;
  let raf = 0;
  let lastTime: number | null = null;
  let lastEmitted = "";

  // ── Emisión de estado a React ────────────────────────────────────────────────
  function phase(): GamePhase {
    if (paused) return "paused";
    return state;
  }

  function emitState(force = false) {
    const snap: GameState = {
      score,
      lives,
      level: currentLevel,
      phase: phase(),
    };
    const key = `${snap.score}|${snap.lives}|${snap.level}|${snap.phase}`;
    if (!force && key === lastEmitted) return;
    lastEmitted = key;
    opts.onState(snap);
  }

  // ── Setup / niveles ──────────────────────────────────────────────────────────
  function initPaddle() {
    paddle.x = (world.W - paddle.w) / 2;
  }

  function initBall() {
    const speed = LEVELS[currentLevel - 1].speed;
    ball.x = paddle.x + (paddle.w - ball.w) / 2;
    ball.y = paddle.y - ball.h;
    ball.vx = BASE_BALL_VX * speed;
    ball.vy = BASE_BALL_VY * speed;
  }

  function loadLevel(n: number) {
    currentLevel = n;
    const level = LEVELS[n - 1];
    blocks = level.blocks.map((b) => ({
      x: BLOCKS_ORIGIN_X + b.col * BLOCK_W,
      y: BLOCKS_ORIGIN_Y + b.row * BLOCK_H,
      w: BLOCK_W,
      h: BLOCK_H,
      color: b.color,
      alive: true,
    }));
    particles = [];
    initBall();
  }

  function initGame() {
    lives = 3;
    score = 0;
    state = "playing";
    gameOverFired = false;
    initPaddle();
    loadLevel(1);
  }

  function collideAABB(block: Block) {
    return (
      ball.x < block.x + block.w &&
      ball.x + ball.w > block.x &&
      ball.y < block.y + block.h &&
      ball.y + ball.h > block.y
    );
  }

  function spawnParticles(block: Block) {
    const cx = block.x + block.w / 2;
    const cy = block.y + block.h / 2;
    const color = NEON[block.color];
    for (let i = 0; i < 12; i++) particles.push(new Particle(cx, cy, color));
  }

  function enterGameOver() {
    state = "gameover";
    if (!gameOverFired) {
      gameOverFired = true;
      opts.onGameOver(score);
    }
  }

  // ── Update (física 1:1 con game.js) ────────────────────────────────────────
  function update(dt: number) {
    if (state !== "playing") {
      particles.forEach((p) => p.update(dt));
      particles = particles.filter((p) => !p.dead);
      return;
    }

    // Paleta (teclado)
    if (world.keys["ArrowLeft"])
      paddle.x = Math.max(0, paddle.x - PADDLE_SPEED * dt);
    if (world.keys["ArrowRight"])
      paddle.x = Math.min(world.W - paddle.w, paddle.x + PADDLE_SPEED * dt);

    // Movimiento de la pelota
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    // Rebotes de pared (izq/der/arriba)
    if (ball.x <= 0) {
      ball.x = 0;
      ball.vx = Math.abs(ball.vx);
    }
    if (ball.x + ball.w >= world.W) {
      ball.x = world.W - ball.w;
      ball.vx = -Math.abs(ball.vx);
    }
    if (ball.y <= 0) {
      ball.y = 0;
      ball.vy = Math.abs(ball.vy);
    }

    // Rebote de paleta (plano 1:1: invierte vy, conserva vx)
    if (
      ball.vy > 0 &&
      ball.x + ball.w > paddle.x &&
      ball.x < paddle.x + paddle.w &&
      ball.y + ball.h >= paddle.y &&
      ball.y + ball.h <= paddle.y + paddle.h + 8
    ) {
      ball.y = paddle.y - ball.h;
      ball.vy = -Math.abs(ball.vy);
    }

    // Colisiones con bloques (un bloque por frame)
    for (const block of blocks) {
      if (!block.alive) continue;
      if (collideAABB(block)) {
        block.alive = false;
        spawnParticles(block);
        score += 10;
        ball.vy = -ball.vy;
        if (blocks.every((b) => !b.alive)) {
          if (currentLevel < 5) loadLevel(currentLevel + 1);
          else enterGameOver(); // victoria = fin de partida
        }
        break;
      }
    }

    // Partículas
    particles.forEach((p) => p.update(dt));
    particles = particles.filter((p) => !p.dead);

    // Pelota perdida → re-servir directo (sin fase dead)
    if (ball.y > world.H) {
      lives--;
      if (lives <= 0) {
        lives = 0;
        enterGameOver();
      } else {
        initBall();
      }
    }
  }

  // ── Draw (primitivas neón + glow) ─────────────────────────────────────────
  function draw() {
    const c = world.ctx;
    c.fillStyle = "#05050a";
    c.fillRect(0, 0, world.W, world.H);

    // Bloques
    for (const block of blocks) {
      if (!block.alive) continue;
      const col = NEON[block.color];
      c.shadowColor = col;
      c.shadowBlur = 12;
      c.fillStyle = col;
      c.fillRect(block.x + 1, block.y + 1, block.w - 2, block.h - 2);
      c.shadowBlur = 0;
      // Reborde interior para el look CRT
      c.strokeStyle = "rgba(255,255,255,0.25)";
      c.lineWidth = 1;
      c.strokeRect(block.x + 1.5, block.y + 1.5, block.w - 3, block.h - 3);
    }

    // Partículas / flash
    particles.forEach((p) => p.draw(c));

    // Paleta
    c.shadowColor = "#00f5ff";
    c.shadowBlur = 16;
    c.fillStyle = "#00f5ff";
    c.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);
    c.shadowBlur = 0;

    // Pelota
    c.shadowColor = "#ffffff";
    c.shadowBlur = 14;
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.arc(ball.x + ball.w / 2, ball.y + ball.h / 2, ball.w / 2, 0, Math.PI * 2);
    c.fill();
    c.shadowBlur = 0;
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
  // El mundo lógico es fijo (800×600); sólo re-medimos el backing store y
  // escalamos logical→físico. El marco CRT es 4/3, así que no hay deformación.
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    // 800×600 lógico → backing store físico completo.
    const sx = (cssW * dpr) / LOGICAL_W;
    const sy = (cssH * dpr) / LOGICAL_H;
    world.ctx.setTransform(sx, 0, 0, sy, 0, 0);
  }

  // ── Input ────────────────────────────────────────────────────────────────────
  function onKeyDown(e: KeyboardEvent) {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    world.keys[e.code] = true;
  }
  function onKeyUp(e: KeyboardEvent) {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    world.keys[e.code] = false;
  }
  // Ratón: mueve la paleta mapeando clientX → coordenada lógica (0..800).
  function onMouseMove(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    const mx = ((e.clientX - rect.left) / rect.width) * world.W;
    paddle.x = Math.max(0, Math.min(world.W - paddle.w, mx - paddle.w / 2));
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  canvas.addEventListener("mousemove", onMouseMove);

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
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("mousemove", onMouseMove);
    },
  };
}
