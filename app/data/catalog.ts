// ===== catalog.ts — acceso a catálogo y puntuaciones en Supabase =====
// Lee en cliente con el browser client y cae a los datos hardcodeados
// (GAMES / seededScores) si la BD no responde.

import { createClient } from "@/utils/supabase/client";
import type { Database } from "@/utils/supabase/database.types";
import { GAMES, type Game, type GameCat, type GameColor } from "./games";
import { seededScores, type ScoreRow } from "./scores";

type GameDbRow = Database["public"]["Tables"]["games"]["Row"];
type ScoreDbRow = Database["public"]["Tables"]["scores"]["Row"];

export interface LoadResult<T> {
  rows: T;
  source: "db" | "fallback";
}

/** Ms tras los que una lectura sin respuesta se considera BD caída → fallback. */
const DB_TIMEOUT_MS = 4000;

/**
 * Resuelve la promesa de una consulta o rechaza al vencer el timeout.
 * Protege contra una BD que ni responde ni falla (petición colgada), para
 * que el fallback se dispare siempre en lugar de dejar la UI congelada.
 */
function withTimeout<T>(query: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(query),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("db-timeout")), ms),
    ),
  ]);
}

/** Semilla usada por el fallback de las puntuaciones (idéntica a la del detalle). */
function scoresSeed(gameId: string): number {
  return gameId.length * 17 + 3;
}

/** Mapea una fila de la BD (snake_case) al tipo de UI `Game` (camelCase). */
function mapGame(row: GameDbRow): Game {
  return {
    id: row.id,
    title: row.title,
    short: row.short,
    long: row.long,
    cat: row.cat as GameCat,
    cover: row.cover,
    color: row.color as GameColor,
    best: row.best,
    plays: row.plays,
    playHref: row.play_href ?? undefined,
  };
}

/** Formatea un timestamp ISO a "DD/MM/YYYY" (partes UTC, deterministas). */
function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const mon = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}/${mon}/${year}`;
}

/** Mapea filas de `scores` (ya ordenadas por score desc) a `ScoreRow` de UI. */
function mapScores(rows: ScoreDbRow[]): ScoreRow[] {
  return rows.map((r, i) => ({
    rank: i + 1,
    name: r.player_name,
    score: r.score,
    date: formatDate(r.created_at),
  }));
}

/**
 * Lee el catálogo ordenado por `sort_order`.
 * Cae a `GAMES` si la BD falla o no devuelve filas.
 */
export async function fetchGames(): Promise<LoadResult<Game[]>> {
  try {
    const supabase = createClient();
    const { data, error } = await withTimeout(
      supabase
        .from("games")
        .select("*")
        .order("sort_order", { ascending: true }),
      DB_TIMEOUT_MS,
    );

    if (error || !data || data.length === 0) {
      return { rows: GAMES, source: "fallback" };
    }
    return { rows: data.map(mapGame), source: "db" };
  } catch {
    return { rows: GAMES, source: "fallback" };
  }
}

/**
 * Lee las mejores puntuaciones de un juego (score desc, `limit`).
 * Cae a `seededScores(...)` con la misma semilla que el mock si la BD falla.
 */
export async function fetchScores(
  gameId: string,
  limit = 12,
): Promise<LoadResult<ScoreRow[]>> {
  try {
    const supabase = createClient();
    const { data, error } = await withTimeout(
      supabase
        .from("scores")
        .select("*")
        .eq("game_id", gameId)
        .order("score", { ascending: false })
        .limit(limit),
      DB_TIMEOUT_MS,
    );

    if (error || !data || data.length === 0) {
      return {
        rows: seededScores(scoresSeed(gameId), limit),
        source: "fallback",
      };
    }
    return { rows: mapScores(data), source: "db" };
  } catch {
    return {
      rows: seededScores(scoresSeed(gameId), limit),
      source: "fallback",
    };
  }
}

/**
 * Inserta una puntuación real. `user_id` siempre `null` por ahora (sin auth).
 * No lanza: devuelve `{ ok: false }` si la BD falla, para no bloquear la UI.
 */
export async function insertScore(entry: {
  gameId: string;
  playerName: string;
  score: number;
}): Promise<{ ok: boolean }> {
  try {
    const supabase = createClient();
    const { error } = await withTimeout(
      supabase.from("scores").insert({
        game_id: entry.gameId,
        player_name: entry.playerName,
        score: entry.score,
        user_id: null,
      }),
      DB_TIMEOUT_MS,
    );
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}
