// ===== games.ts — shared mock catalog (ported from data.jsx) =====

export type GameColor = "cyan" | "magenta" | "yellow" | "green";
export type GameCat = "ARCADE" | "PUZZLE" | "SHOOTER" | "VERSUS";

export interface Game {
  id: string; // slug, p.ej. "bloque-buster"
  title: string;
  short: string; // descripción corta (card)
  long: string; // descripción larga (detalle)
  cat: GameCat;
  cover: string; // clase CSS de portada, p.ej. "cover-bricks"
  color: GameColor; // color del botón JUGAR
  best: number; // mejor puntuación global
  plays: string; // partidas, formateado ("12.4K")
  playHref?: string; // destino de "JUGAR AHORA". Default: `/jugar/${id}`. Para asteroids: "/juego/asteroids/jugar"
}

export const GAMES: Game[] = [
  {
    id: "bloque-buster",
    title: "BLOQUE BUSTER",
    short: "Rebota la pelota y destruye muros de neón.",
    long: "Pilota una nave-paleta y rebota un núcleo de plasma para pulverizar muros de bloques cromáticos. Cada nivel reorganiza la grilla en patrones imposibles. ¿Hasta dónde llegará tu racha?",
    cat: "ARCADE",
    cover: "cover-bricks",
    color: "cyan",
    best: 28450,
    plays: "12.4K",
  },
  {
    id: "caida",
    title: "CAÍDA",
    short: "Encaja las piezas antes de que el techo te aplaste.",
    long: "Piezas geométricas descienden desde la oscuridad. Rótalas, encástralas y limpia líneas para sobrevivir. La velocidad aumenta sin piedad cada 10 líneas.",
    cat: "PUZZLE",
    cover: "cover-tetro",
    color: "magenta",
    best: 184220,
    plays: "31.8K",
  },
  {
    id: "tetris",
    title: "TETRIS",
    short: "Encaja las piezas y limpia líneas antes de que el muro te sepulte.",
    long: "El clásico de encaje, real y jugable: rota y deja caer tetrominós —más una pieza tuerca especial— sobre una rejilla de 10×20. Usa la pieza fantasma para afinar, el hard-drop para rematar y limpia líneas mientras la velocidad sube cada 10 líneas.",
    cat: "PUZZLE",
    cover: "cover-tetris",
    color: "cyan",
    best: 184220,
    plays: "0",
    playHref: "/juego/tetris/jugar",
  },
  {
    id: "serpentina",
    title: "SERPENTINA",
    short: "Crece sin morder tu propia cola.",
    long: "Una serpiente de luz recorre la grilla buscando núcleos magenta. Cada bocado la alarga y la hace más veloz. Un movimiento en falso y se devora a sí misma.",
    cat: "ARCADE",
    cover: "cover-snake",
    color: "green",
    best: 7820,
    plays: "9.1K",
  },
  {
    id: "gloton",
    title: "GLOTÓN",
    short: "Devora puntos y escapa de los fantasmas.",
    long: "Un círculo glotón patrulla un laberinto coleccionando puntos luminosos. Cuatro espectros lo persiguen, pero cada cierto tiempo aparece una píldora que invierte los papeles.",
    cat: "ARCADE",
    cover: "cover-glot",
    color: "yellow",
    best: 96400,
    plays: "27.2K",
  },
  {
    id: "invasores",
    title: "INVASORES",
    short: "Defiende el planeta de filas alienígenas.",
    long: "Olas de pixeles hostiles descienden formación tras formación. Mueve tu cañón en horizontal y abre fuego con precisión, antes de que toquen la superficie.",
    cat: "SHOOTER",
    cover: "cover-invaders",
    color: "green",
    best: 54190,
    plays: "18.0K",
  },
  {
    id: "rocas",
    title: "ROCAS",
    short: "Pulveriza asteroides en gravedad cero.",
    long: "Tu nave triangular flota en vacío absoluto. Dispara y rota para dividir rocas en fragmentos cada vez más pequeños. Cuidado con los OVNIs en el horizonte.",
    cat: "SHOOTER",
    cover: "cover-rocas",
    color: "yellow",
    best: 41200,
    plays: "15.6K",
  },
  {
    id: "asteroids",
    title: "ASTEROIDS",
    short: "Rota, propúlsate y pulveriza rocas en gravedad cero.",
    long: "El clásico de culto, real y jugable: pilota una nave triangular por un campo de asteroides toroidal, divídelos en fragmentos cada vez menores y sobrevive con 3 vidas. Recoge el power-up 3x para disparo triple.",
    cat: "SHOOTER",
    cover: "cover-asteroids",
    color: "yellow",
    best: 41200,
    plays: "0",
    playHref: "/juego/asteroids/jugar",
  },
  {
    id: "ranaria",
    title: "RANARIA",
    short: "Cruza la autopista de pixeles.",
    long: "Salta entre carriles de coches a toda velocidad y troncos a la deriva en el río. Llega a los nenúfares antes de que se acabe el tiempo.",
    cat: "ARCADE",
    cover: "cover-rana",
    color: "green",
    best: 18900,
    plays: "6.4K",
  },
  {
    id: "duelo-pixel",
    title: "DUELO PIXEL",
    short: "Dos paletas. Una pelota. Reflejos máximos.",
    long: "El duelo más puro: dos paletas verticales se enfrentan por rebotar una pelota luminosa. Modo solitario contra la CPU o partida local a dos jugadores.",
    cat: "VERSUS",
    cover: "cover-duelo",
    color: "cyan",
    best: 24,
    plays: "4.2K",
  },
  {
    id: "arkanoid",
    title: "ARKANOID",
    short: "Rompe el muro de bloques rebotando la pelota con tu paleta.",
    long: "El clásico rompe-muros, real y jugable: mueve la paleta con las flechas o el ratón, rebota la pelota y pulveriza la rejilla de bloques a lo largo de 5 niveles cada vez más rápidos. Tienes 3 vidas; limpia el último muro para completar el juego.",
    cat: "ARCADE",
    cover: "cover-arkanoid",
    color: "magenta",
    best: 28450,
    plays: "0",
    playHref: "/juego/arkanoid/jugar",
  },
];

export const CATS = ["TODOS", "ARCADE", "PUZZLE", "SHOOTER", "VERSUS"] as const;
