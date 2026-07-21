# Juegos implementados — Arcade Vault

Juegos **jugables de verdad** en canvas, cada uno con su motor headless (`engine.ts`) y su
página cliente (`page.tsx`). No se incluyen las fichas del catálogo que son solo mocks visuales.

| Juego     | Slug        | Categoría | Ruta jugable             | Spec                                 |
| --------- | ----------- | --------- | ------------------------ | ------------------------------------ |
| ASTEROIDS | `asteroids` | SHOOTER   | `/juego/asteroids/jugar` | `specs/05-juego-asteroids-canvas.md` |
| TETRIS    | `tetris`    | PUZZLE    | `/juego/tetris/jugar`    | `specs/07-juego-tetris-canvas.md`    |
| ARKANOID  | `arkanoid`  | ARCADE    | `/juego/arkanoid/jugar`  | `specs/08-arkanoid.md`               |
| SNAKE     | `snake`     | ARCADE    | `/juego/snake/jugar`     | `specs/09-snake.md`                  |

## Detalle

### ASTEROIDS

- **Slug:** `asteroids`
- **Categoría:** SHOOTER
- **Descripción:** El clásico de culto, real y jugable: pilota una nave triangular por un campo de asteroides toroidal, divídelos en fragmentos cada vez menores y sobrevive con 3 vidas. Recoge el power-up 3x para disparo triple.
- **Código:** `app/juego/asteroids/jugar/engine.ts` + `page.tsx`

### TETRIS

- **Slug:** `tetris`
- **Categoría:** PUZZLE
- **Descripción:** El clásico de encaje, real y jugable: rota y deja caer tetrominós —más una pieza tuerca especial— sobre una rejilla de 10×20. Usa la pieza fantasma para afinar, el hard-drop para rematar y limpia líneas mientras la velocidad sube cada 10 líneas.
- **Código:** `app/juego/tetris/jugar/engine.ts` + `page.tsx`

### ARKANOID

- **Slug:** `arkanoid`
- **Categoría:** ARCADE
- **Descripción:** El clásico rompe-muros, real y jugable: mueve la paleta con las flechas o el ratón, rebota la pelota y pulveriza la rejilla de bloques a lo largo de 5 niveles cada vez más rápidos. Tienes 3 vidas; limpia el último muro para completar el juego.
- **Código:** `app/juego/arkanoid/jugar/engine.ts` + `page.tsx`

### SNAKE

- **Slug:** `snake`
- **Categoría:** ARCADE
- **Descripción:** El clásico de la serpiente, real y jugable: guía una serpiente de neón por una rejilla de 24×18, devora fruta para crecer y sube de nivel cada 5 piezas mientras el ritmo se acelera sin piedad. Un choque con el muro o con tu propia cola y se acabó.
- **Código:** `app/juego/snake/jugar/engine.ts` + `page.tsx` (+ `atlas.ts`)
