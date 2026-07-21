/**
 * FRUIT_ATLAS — coordenadas de recorte del spritesheet de frutas de Snake.
 *
 * Portado de `references/source-assets/sprites.js` (SPRITE_ATLAS.fruits).
 * Imagen fuente: `public/snake-assets/fruits.png` (3790×442, fondo transparente).
 * Fila usada: y=136 (160px de alto). Son 22 frutas, con anchos distintos (110–170px).
 *
 * Uso en el motor:
 *   ctx.drawImage(img, s.x, s.y, s.w, s.h, dx, dy, dw, dh);
 */

export interface FruitSprite {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FRUIT_ATLAS_SRC = "/snake-assets/fruits.png";

export const FRUIT_ATLAS: readonly FruitSprite[] = [
  { x: 34, y: 136, w: 110, h: 160 }, // banana
  { x: 186, y: 136, w: 150, h: 160 }, // orange
  { x: 378, y: 136, w: 110, h: 160 }, // grape
  { x: 540, y: 136, w: 130, h: 160 }, // garlic
  { x: 712, y: 136, w: 130, h: 160 }, // eggplant
  { x: 894, y: 136, w: 110, h: 160 }, // strawberry
  { x: 1066, y: 136, w: 110, h: 160 }, // cherry
  { x: 1228, y: 136, w: 130, h: 160 }, // carrot
  { x: 1400, y: 136, w: 130, h: 160 }, // mushroom
  { x: 1582, y: 136, w: 110, h: 160 }, // broccoli
  { x: 1734, y: 136, w: 150, h: 160 }, // watermelon
  { x: 1906, y: 136, w: 150, h: 160 }, // pepper
  { x: 2068, y: 136, w: 170, h: 160 }, // kiwi
  { x: 2250, y: 136, w: 140, h: 160 }, // lemon
  { x: 2432, y: 136, w: 130, h: 160 }, // peach
  { x: 2604, y: 136, w: 130, h: 160 }, // peanut
  { x: 2786, y: 136, w: 110, h: 160 }, // apple
  { x: 2948, y: 136, w: 130, h: 160 }, // tomato
  { x: 3110, y: 136, w: 150, h: 160 }, // berries
  { x: 3302, y: 136, w: 110, h: 160 }, // grapes2
  { x: 3454, y: 136, w: 150, h: 160 }, // pineapple
  { x: 3637, y: 136, w: 130, h: 160 }, // melon
];
