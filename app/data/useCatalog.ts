"use client";

// ===== useCatalog.ts — hooks cliente sobre catalog.ts =====
// Envuelven fetchGames/fetchScores con estado de carga + source.
// Se instancian sólo tras montar (useEffect) para evitar hydration mismatch.

import { useEffect, useState } from "react";
import { fetchGames, fetchScores } from "./catalog";
import { GAMES, type Game } from "./games";
import { seededScores, type ScoreRow } from "./scores";

export function useGames(): {
  games: Game[];
  loading: boolean;
  source: "db" | "fallback";
} {
  const [games, setGames] = useState<Game[]>(GAMES);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<"db" | "fallback">("fallback");

  useEffect(() => {
    let active = true;
    fetchGames().then((res) => {
      if (!active) return;
      setGames(res.rows);
      setSource(res.source);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return { games, loading, source };
}

export function useScores(
  gameId: string,
  limit = 12,
): { scores: ScoreRow[]; loading: boolean; source: "db" | "fallback" } {
  const [scores, setScores] = useState<ScoreRow[]>(() =>
    seededScores(gameId.length * 17 + 3, limit),
  );
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<"db" | "fallback">("fallback");

  useEffect(() => {
    let active = true;
    fetchScores(gameId, limit).then((res) => {
      if (!active) return;
      setScores(res.rows);
      setSource(res.source);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [gameId, limit]);

  return { scores, loading, source };
}
