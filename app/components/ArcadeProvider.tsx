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

interface ArcadeContextValue {
  user: User | null;
  login: (u: User | null) => void; // null = invitado
  signOut: () => void;
}

const ArcadeContext = createContext<ArcadeContextValue | null>(null);

const USER_KEY = "av_user";

/**
 * Pequeño store externo respaldado por localStorage. Se lee mediante
 * useSyncExternalStore para que el render del servidor (y la hidratación
 * inicial) asuma "sin sesión" y el cliente se actualice tras montar, sin
 * hydration mismatch.
 */
const listeners = new Set<() => void>();

// Caché para que getSnapshot devuelva referencias estables.
let userCache: User | null | undefined;

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === USER_KEY) {
      userCache = undefined;
      emit();
    }
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

const getUserServerSnapshot = (): User | null => null;

export function ArcadeProvider({ children }: { children: ReactNode }) {
  const user = useSyncExternalStore(
    subscribe,
    getUserSnapshot,
    getUserServerSnapshot,
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

  return (
    <ArcadeContext.Provider value={{ user, login, signOut }}>
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
