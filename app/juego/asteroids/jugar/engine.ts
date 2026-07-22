// ===== engine.ts — Asteroids portado a TypeScript (client-only) =====
// Portado de references/started-games/02-asteroids/game.js.
// Cambios respecto al original:
//   - W/H dinámicos leídos del canvas/contenedor (mundo responsive, px/s absolutos).
//   - Sin drawHUD ni overlay "GAME OVER" internos (los pinta React).
//   - Sin reinicio por ESPACIO (lo maneja el modal de la plataforma).
//   - API createAsteroids(canvas, { onState, onGameOver }) con
//     pause/resume/restart/forceGameOver/resize/destroy.
//
// IMPORTANTE: este módulo es client-only. No accede a document/window en el
// import; todo el acceso al DOM ocurre dentro de createAsteroids().

// ── Skins / paletas ───────────────────────────────────────────────────────────
export type SkinName = "clasico" | "neon" | "retro";

export interface Palette {
  bg: string; // fondo del canvas
  ship: string; // trazo de la nave
  thruster: string; // llama del propulsor (incluye su propio alpha)
  bullet: string; // relleno de las balas
  asteroid: string; // trazo de los asteroides
  powerup: string; // trazo + texto del power-up 3x
  particle: string; // componentes "r, g, b" (el alpha se calcula por frame)
  glow: number; // radio de shadowBlur para el efecto brillo (0 = sin brillo)
}

export const SKINS: Record<SkinName, Palette> = {
  // Fiel al look original: extraído tal cual de los literales hardcodeados.
  clasico: {
    bg: "#000",
    ship: "#fff",
    thruster: "rgba(255, 130, 0, 0.85)",
    bullet: "#fff",
    asteroid: "#fff",
    powerup: "#0ff",
    particle: "255, 255, 255",
    glow: 0,
  },
  // Variante brillante, saturada, con glow.
  neon: {
    bg: "#05010f",
    ship: "#00f0ff",
    thruster: "rgba(255, 90, 200, 0.9)",
    bullet: "#fdff5a",
    asteroid: "#ff2fd0",
    powerup: "#7dff3a",
    particle: "255, 120, 255",
    glow: 12,
  },
  // Variante apagada tipo CRT fosforo ámbar/verde, contraste bajo.
  retro: {
    bg: "#0d0a02",
    ship: "#ffb000",
    thruster: "rgba(255, 140, 0, 0.7)",
    bullet: "#ffd24a",
    asteroid: "#8f9f4f",
    powerup: "#c8d24a",
    particle: "210, 170, 70",
    glow: 2,
  },
};

const DEFAULT_SKIN: SkinName = "clasico";

// ── Contrato público ──────────────────────────────────────────────────────────
export type GamePhase = "playing" | "dead" | "paused" | "gameover";

export interface GameState {
  score: number;
  lives: number;
  level: number;
  tripleShot: number; // segundos restantes del power-up 3x (0 = inactivo)
  phase: GamePhase;
}

export interface AsteroidsHandle {
  pause(): void;
  resume(): void;
  restart(): void;
  forceGameOver(): void; // botón FIN
  resize(): void; // re-mide el contenedor y reescala el mundo
  setSkin(name: SkinName): void; // cambia el tema visual en vivo
  destroy(): void; // cancela el rAF y quita listeners
}

export interface AsteroidsOptions {
  onState: (s: GameState) => void; // HUD React
  onGameOver: (finalScore: number) => void; // abre el modal
  skin?: SkinName; // tema visual inicial (default "clasico")
}

// ── Mundo compartido ──────────────────────────────────────────────────────────
interface World {
  W: number;
  H: number;
  ctx: CanvasRenderingContext2D;
  keys: Record<string, boolean>;
  palette: Palette;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
const wrap = (v: number, max: number) => ((v % max) + max) % max;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));

// ── Constants ─────────────────────────────────────────────────────────────────
const POWERUP_DROP_CHANCE = 0.15;
const POWERUP_DURATION = 5;
const POWERUP_TTL = 12;
const TRIPLE_SPREAD = 0.18;

// ── Bullet ────────────────────────────────────────────────────────────────────
class Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttl = 1.1;
  radius = 2;
  dead = false;

  constructor(x: number, y: number, angle: number) {
    this.x = x;
    this.y = y;
    const SPEED = 520;
    this.vx = Math.cos(angle) * SPEED;
    this.vy = Math.sin(angle) * SPEED;
  }

  update(dt: number, w: World) {
    this.x = wrap(this.x + this.vx * dt, w.W);
    this.y = wrap(this.y + this.vy * dt, w.H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw(w: World) {
    const ctx = w.ctx;
    ctx.save();
    ctx.shadowBlur = w.palette.glow;
    ctx.shadowColor = w.palette.bullet;
    ctx.fillStyle = w.palette.bullet;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ── Asteroid ──────────────────────────────────────────────────────────────────
const RADII = [0, 16, 30, 50]; // por tamaño 1, 2, 3
const SPEEDS = [0, 85, 55, 32]; // velocidad base por tamaño
const POINTS = [0, 100, 50, 20]; // puntos por tamaño

class Asteroid {
  x: number;
  y: number;
  size: number;
  radius: number;
  dead = false;
  vx: number;
  vy: number;
  rotSpeed: number;
  rot: number;
  verts: [number, number][] = [];

  constructor(x: number, y: number, size = 3) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.radius = RADII[size];

    const angle = rand(0, Math.PI * 2);
    const speed = SPEEDS[size] + rand(-15, 15);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.rotSpeed = rand(-1.2, 1.2);
    this.rot = rand(0, Math.PI * 2);

    // Polígono irregular
    const n = randInt(8, 13);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = this.radius * rand(0.6, 1.0);
      this.verts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }

  update(dt: number, w: World) {
    this.x = wrap(this.x + this.vx * dt, w.W);
    this.y = wrap(this.y + this.vy * dt, w.H);
    this.rot += this.rotSpeed * dt;
  }

  split(): Asteroid[] {
    if (this.size <= 1) return [];
    return [
      new Asteroid(this.x, this.y, this.size - 1),
      new Asteroid(this.x, this.y, this.size - 1),
    ];
  }

  draw(w: World) {
    const ctx = w.ctx;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.shadowBlur = w.palette.glow;
    ctx.shadowColor = w.palette.asteroid;
    ctx.strokeStyle = w.palette.asteroid;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(this.verts[0][0], this.verts[0][1]);
    for (let i = 1; i < this.verts.length; i++)
      ctx.lineTo(this.verts[i][0], this.verts[i][1]);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

// ── PowerUp ───────────────────────────────────────────────────────────────────
class PowerUp {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius = 12;
  ttl = POWERUP_TTL;
  dead = false;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(20, 40);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
  }

  update(dt: number, w: World) {
    this.x = wrap(this.x + this.vx * dt, w.W);
    this.y = wrap(this.y + this.vy * dt, w.H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw(w: World) {
    if (this.ttl < 2 && Math.floor(this.ttl * 8) % 2 === 0) return;
    const ctx = w.ctx;
    const pulse = 0.85 + Math.sin(performance.now() / 150) * 0.15;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(Math.PI / 4);
    ctx.shadowBlur = w.palette.glow;
    ctx.shadowColor = w.palette.powerup;
    ctx.strokeStyle = w.palette.powerup;
    ctx.lineWidth = 2;
    const r = this.radius * pulse;
    ctx.strokeRect(-r, -r, r * 2, r * 2);
    ctx.restore();
    ctx.fillStyle = w.palette.powerup;
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("3x", this.x, this.y);
  }
}

// ── Ship ──────────────────────────────────────────────────────────────────────
class Ship {
  x = 0;
  y = 0;
  angle = -Math.PI / 2;
  vx = 0;
  vy = 0;
  radius = 12;
  thrusting = false;
  invincible = 3;
  shootCooldown = 0;
  dead = false;
  tripleShot = 0;

  constructor(w: World) {
    this.reset(w);
  }

  reset(w: World) {
    this.x = w.W / 2;
    this.y = w.H / 2;
    this.angle = -Math.PI / 2;
    this.vx = 0;
    this.vy = 0;
    this.radius = 12;
    this.thrusting = false;
    this.invincible = 3;
    this.shootCooldown = 0;
    this.dead = false;
  }

  update(dt: number, w: World) {
    if (this.dead) return;
    if (this.invincible > 0) this.invincible -= dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;
    if (this.tripleShot > 0) this.tripleShot -= dt;

    const ROT = 3.5; // rad/s
    const THRUST = 260; // px/s²
    const DRAG = 0.987;

    if (w.keys["ArrowLeft"]) this.angle -= ROT * dt;
    if (w.keys["ArrowRight"]) this.angle += ROT * dt;

    this.thrusting = !!w.keys["ArrowUp"];
    if (this.thrusting) {
      this.vx += Math.cos(this.angle) * THRUST * dt;
      this.vy += Math.sin(this.angle) * THRUST * dt;
    }

    this.vx *= DRAG;
    this.vy *= DRAG;
    this.x = wrap(this.x + this.vx * dt, w.W);
    this.y = wrap(this.y + this.vy * dt, w.H);
  }

  tryShoot(): Bullet[] {
    if (this.shootCooldown > 0 || this.dead) return [];
    this.shootCooldown = 0.2;
    const NOSE = 21;
    const ox = this.x + Math.cos(this.angle) * NOSE;
    const oy = this.y + Math.sin(this.angle) * NOSE;
    if (this.tripleShot > 0) {
      return [
        new Bullet(ox, oy, this.angle - TRIPLE_SPREAD),
        new Bullet(ox, oy, this.angle),
        new Bullet(ox, oy, this.angle + TRIPLE_SPREAD),
      ];
    }
    return [new Bullet(ox, oy, this.angle)];
  }

  draw(w: World) {
    if (this.dead) return;
    // Parpadeo durante invencibilidad de reaparición
    if (this.invincible > 0 && Math.floor(this.invincible * 8) % 2 === 0)
      return;

    const ctx = w.ctx;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.shadowBlur = w.palette.glow;
    ctx.shadowColor = w.palette.ship;
    ctx.strokeStyle = w.palette.ship;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";

    // Silueta clásica: triángulo con muesca trasera
    ctx.beginPath();
    ctx.moveTo(20, 0); // nariz
    ctx.lineTo(-12, -9); // ala izquierda
    ctx.lineTo(-7, 0); // muesca trasera
    ctx.lineTo(-12, 9); // ala derecha
    ctx.closePath();
    ctx.stroke();

    // Llama del propulsor
    if (this.thrusting && Math.random() > 0.35) {
      ctx.beginPath();
      ctx.moveTo(-8, -4);
      ctx.lineTo(-8 - rand(6, 14), 0);
      ctx.lineTo(-8, 4);
      ctx.strokeStyle = w.palette.thruster;
      ctx.stroke();
    }

    ctx.restore();
  }
}

// ── Partículas (explosión) ────────────────────────────────────────────────────
class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  ttl: number;
  dead = false;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(30, 130);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = rand(0.4, 1.1);
    this.ttl = this.life;
  }

  update(dt: number) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw(w: World) {
    const ctx = w.ctx;
    const alpha = this.ttl / this.life;
    ctx.strokeStyle = `rgba(${w.palette.particle},${alpha.toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 0.05, this.y - this.vy * 0.05);
    ctx.stroke();
  }
}

// ── Fábrica ───────────────────────────────────────────────────────────────────
export function createAsteroids(
  canvas: HTMLCanvasElement,
  opts: AsteroidsOptions,
): AsteroidsHandle {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("createAsteroids: canvas 2d context no disponible");

  const world: World = {
    W: 1,
    H: 1,
    ctx,
    keys: {},
    palette: SKINS[opts.skin ?? DEFAULT_SKIN],
  };
  const justPressed: Record<string, boolean> = {};

  // Teclas del juego: capturamos preventDefault para no scrollear la página.
  const GAME_KEYS = new Set([
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "Space",
  ]);

  // Estado del juego
  let ship: Ship;
  let bullets: Bullet[] = [];
  let asteroids: Asteroid[] = [];
  let particles: Particle[] = [];
  let powerUps: PowerUp[] = [];
  let score = 0;
  let lives = 3;
  let level = 1;
  let state: "playing" | "dead" | "gameover" = "playing";
  let deadTimer = 0;
  let powerUpSpawned = false;
  let killsSinceSpawn = 0;

  let paused = false;
  let gameOverFired = false;
  let raf = 0;
  let lastTime: number | null = null;
  let lastEmitted = "";

  function pressed(code: string): boolean {
    const val = justPressed[code];
    justPressed[code] = false;
    return !!val;
  }

  // ── Emisión de estado a React ────────────────────────────────────────────────
  function phase(): GamePhase {
    if (paused) return "paused";
    return state;
  }

  function emitState(force = false) {
    const tri = ship ? Math.max(0, ship.tripleShot) : 0;
    const snap: GameState = {
      score,
      lives,
      level,
      tripleShot: tri,
      phase: phase(),
    };
    // La clave redondea tripleShot a 0.1s para no emitir en cada frame.
    const key = `${snap.score}|${snap.lives}|${snap.level}|${tri.toFixed(1)}|${snap.phase}`;
    if (!force && key === lastEmitted) return;
    lastEmitted = key;
    opts.onState(snap);
  }

  // ── Setup / niveles ──────────────────────────────────────────────────────────
  function spawnAsteroids(count: number) {
    const SAFE_DIST = 130;
    for (let i = 0; i < count; i++) {
      let x: number, y: number;
      do {
        x = rand(0, world.W);
        y = rand(0, world.H);
      } while (Math.hypot(x - world.W / 2, y - world.H / 2) < SAFE_DIST);
      asteroids.push(new Asteroid(x, y, 3));
    }
  }

  function initGame() {
    ship = new Ship(world);
    bullets = [];
    asteroids = [];
    particles = [];
    powerUps = [];
    powerUpSpawned = false;
    killsSinceSpawn = 0;
    score = 0;
    lives = 3;
    level = 1;
    state = "playing";
    gameOverFired = false;
    spawnAsteroids(4);
  }

  function nextLevel() {
    level++;
    bullets = [];
    particles = [];
    powerUps = [];
    powerUpSpawned = false;
    killsSinceSpawn = 0;
    ship.reset(world);
    spawnAsteroids(3 + level);
  }

  function explode(x: number, y: number, count = 8) {
    for (let i = 0; i < count; i++) particles.push(new Particle(x, y));
  }

  function enterGameOver() {
    state = "gameover";
    if (!gameOverFired) {
      gameOverFired = true;
      opts.onGameOver(score);
    }
  }

  function killShip() {
    explode(ship.x, ship.y, 14);
    ship.dead = true;
    lives--;
    if (lives <= 0) {
      enterGameOver();
    } else {
      state = "dead";
      deadTimer = 2;
    }
  }

  // ── Update ───────────────────────────────────────────────────────────────────
  function update(dt: number) {
    if (state === "gameover") {
      particles.forEach((p) => p.update(dt));
      particles = particles.filter((p) => !p.dead);
      return;
    }

    if (state === "dead") {
      deadTimer -= dt;
      particles.forEach((p) => p.update(dt));
      particles = particles.filter((p) => !p.dead);
      asteroids.forEach((a) => a.update(dt, world));
      if (deadTimer <= 0) {
        state = "playing";
        ship.reset(world);
      }
      return;
    }

    // Disparar
    if (pressed("Space")) {
      bullets.push(...ship.tryShoot());
    }

    ship.update(dt, world);
    bullets.forEach((b) => b.update(dt, world));
    asteroids.forEach((a) => a.update(dt, world));
    particles.forEach((p) => p.update(dt));
    powerUps.forEach((p) => p.update(dt, world));

    bullets = bullets.filter((b) => !b.dead);
    particles = particles.filter((p) => !p.dead);
    powerUps = powerUps.filter((p) => !p.dead);

    for (const p of powerUps) {
      if (!p.dead && dist(ship, p) < ship.radius + p.radius) {
        p.dead = true;
        ship.tripleShot = POWERUP_DURATION;
      }
    }

    // Bala vs asteroide
    const newAsteroids: Asteroid[] = [];
    for (const b of bullets) {
      for (const a of asteroids) {
        if (!a.dead && !b.dead && dist(b, a) < a.radius) {
          b.dead = true;
          a.dead = true;
          score += POINTS[a.size];
          explode(a.x, a.y, a.size * 5);
          newAsteroids.push(...a.split());
          if (!powerUpSpawned) {
            killsSinceSpawn++;
            const guaranteed = killsSinceSpawn >= 5;
            if (guaranteed || Math.random() < POWERUP_DROP_CHANCE) {
              powerUps.push(new PowerUp(a.x, a.y));
              powerUpSpawned = true;
            }
          }
        }
      }
    }
    asteroids = asteroids.filter((a) => !a.dead).concat(newAsteroids);
    bullets = bullets.filter((b) => !b.dead);

    // Nave vs asteroide
    if (ship.invincible <= 0) {
      for (const a of asteroids) {
        if (dist(ship, a) < ship.radius + a.radius * 0.82) {
          killShip();
          break;
        }
      }
    }

    // Nivel completado
    if (asteroids.length === 0) nextLevel();
  }

  // ── Draw ─────────────────────────────────────────────────────────────────────
  function draw() {
    const c = world.ctx;
    c.fillStyle = world.palette.bg;
    c.fillRect(0, 0, world.W, world.H);

    particles.forEach((p) => p.draw(world));
    asteroids.forEach((a) => a.draw(world));
    powerUps.forEach((p) => p.draw(world));
    bullets.forEach((b) => b.draw(world));
    ship.draw(world);
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

    const oldW = world.W;
    const oldH = world.H;

    // Backing store en px físicos; dibujamos en px CSS.
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    world.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    world.W = cssW;
    world.H = cssH;

    // Reescala posiciones proporcionalmente; velocidades quedan en px/s absolutos.
    if (oldW > 1 && oldH > 1) {
      const sx = cssW / oldW;
      const sy = cssH / oldH;
      const rescale = (o: { x: number; y: number }) => {
        o.x *= sx;
        o.y *= sy;
      };
      if (ship) rescale(ship);
      bullets.forEach(rescale);
      asteroids.forEach(rescale);
      particles.forEach(rescale);
      powerUps.forEach(rescale);
    }
  }

  // ── Input ────────────────────────────────────────────────────────────────────
  function onKeyDown(e: KeyboardEvent) {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (!world.keys[e.code]) justPressed[e.code] = true;
    world.keys[e.code] = true;
  }
  function onKeyUp(e: KeyboardEvent) {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    world.keys[e.code] = false;
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

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
      explode(ship.x, ship.y, 14);
      ship.dead = true;
      lives = 0;
      enterGameOver();
      emitState(true);
    },
    resize() {
      resize();
    },
    setSkin(name: SkinName) {
      world.palette = SKINS[name] ?? SKINS[DEFAULT_SKIN];
      // Redibuja inmediatamente para que el cambio se vea aunque esté en pausa.
      draw();
    },
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    },
  };
}
