"use client";

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export interface User {
  name: string; // mayúsculas, máx 10 chars
}

export interface SavedScore {
  game: string; // Game["id"]
  score: number;
  name: string;
  at: number; // Date.now()
}

interface ArcadeContextValue {
  user: User | null;
  scores: SavedScore[];
  login: (u: User | null) => void; // null = invitado
  signOut: () => void;
  saveScore: (entry: Omit<SavedScore, "at">) => void;
}

const ArcadeContext = createContext<ArcadeContextValue | null>(null);

const USER_KEY = "av_user";
const SCORES_KEY = "av_scores";

/**
 * Pequeño store externo respaldado por localStorage. Se lee mediante
 * useSyncExternalStore para que el render del servidor (y la hidratación
 * inicial) asuma "sin sesión" y el cliente se actualice tras montar, sin
 * hydration mismatch.
 */
const EMPTY_SCORES: SavedScore[] = [];
const listeners = new Set<() => void>();

// Caché para que getSnapshot devuelva referencias estables.
let userCache: User | null | undefined;
let scoresCache: SavedScore[] | undefined;

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === USER_KEY) userCache = undefined;
    if (e.key === SCORES_KEY) scoresCache = undefined;
    if (e.key === USER_KEY || e.key === SCORES_KEY) emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getUserSnapshot(): User | null {
  if (userCache === undefined) {
    try {
      const raw = localStorage.getItem(USER_KEY);
      userCache = raw ? (JSON.parse(raw) as User | null) : null;
    } catch {
      userCache = null;
    }
  }
  return userCache;
}

function getScoresSnapshot(): SavedScore[] {
  if (scoresCache === undefined) {
    try {
      const raw = localStorage.getItem(SCORES_KEY);
      scoresCache = raw ? (JSON.parse(raw) as SavedScore[]) : EMPTY_SCORES;
    } catch {
      scoresCache = EMPTY_SCORES;
    }
  }
  return scoresCache;
}

const getUserServerSnapshot = (): User | null => null;
const getScoresServerSnapshot = (): SavedScore[] => EMPTY_SCORES;

export function ArcadeProvider({ children }: { children: ReactNode }) {
  const user = useSyncExternalStore(
    subscribe,
    getUserSnapshot,
    getUserServerSnapshot,
  );
  const scores = useSyncExternalStore(
    subscribe,
    getScoresSnapshot,
    getScoresServerSnapshot,
  );

  const login = useCallback((u: User | null) => {
    userCache = u;
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(u));
    } catch {
      /* ignore */
    }
    emit();
  }, []);

  const signOut = useCallback(() => {
    userCache = null;
    try {
      localStorage.removeItem(USER_KEY);
    } catch {
      /* ignore */
    }
    emit();
  }, []);

  const saveScore = useCallback((entry: Omit<SavedScore, "at">) => {
    const next = [...getScoresSnapshot(), { ...entry, at: Date.now() }];
    scoresCache = next;
    try {
      localStorage.setItem(SCORES_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    emit();
  }, []);

  return (
    <ArcadeContext.Provider value={{ user, scores, login, signOut, saveScore }}>
      {children}
    </ArcadeContext.Provider>
  );
}

export function useArcade(): ArcadeContextValue {
  const ctx = useContext(ArcadeContext);
  if (!ctx) {
    throw new Error("useArcade must be used within an ArcadeProvider");
  }
  return ctx;
}
