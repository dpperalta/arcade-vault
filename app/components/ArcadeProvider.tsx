"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { createClient } from "@/utils/supabase/client";

export interface User {
  name: string; // mayúsculas, máx 10 chars
}

export type AuthResult = { ok: true } | { ok: false; error: string };

type OAuthProvider = "google" | "github";

interface ArcadeContextValue {
  /** Sesión real. `null` también para el invitado: jugar sin cuenta no es sesión. */
  user: User | null;
  /** Correo de la cuenta. Solo lo consume Nav. */
  email: string | null;
  /** Id de la cuenta. Solo lo consume `insertScore`. */
  userId: string | null;
  /** `true` hasta que se resuelve la sesión inicial. Evita el parpadeo en Nav. */
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    playerName: string,
  ) => Promise<AuthResult>;
  signInWithPassword: (email: string, password: string) => Promise<AuthResult>;
  signInWithOAuth: (provider: OAuthProvider) => Promise<AuthResult>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  updatePlayerName: (name: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  continueAsGuest: () => void;
}

const ArcadeContext = createContext<ArcadeContextValue | null>(null);

/** Clave del invitado. Sustituye a `av_user`, cuyo contenido significaba otra cosa. */
const GUEST_KEY = "av_guest";
const LEGACY_USER_KEY = "av_user";

/** Normaliza cualquier nombre al formato del salón: mayúsculas, máx 10. */
export function normalizePlayerName(raw: string): string {
  return raw.trim().toUpperCase().slice(0, 10);
}

/** Nombre de respaldo cuando la cuenta aún no tiene fila en `profiles`. */
function nameFromEmail(email: string | null): string {
  const local = email?.split("@")[0] ?? "";
  const clean = local.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return clean.slice(0, 10) || "PLAYER";
}

/**
 * Códigos de error de Supabase Auth traducidos. Se traduce por `code` y no por
 * el texto en inglés: el mensaje cambia de redacción entre versiones (p. ej.
 * `email_address_invalid` llega como `Email address "x" is invalid`), mientras
 * que el código es estable.
 */
const AUTH_ERRORS: Record<string, string> = {
  invalid_credentials: "Correo o contraseña incorrectos.",
  email_not_confirmed:
    "Todavía no has confirmado tu correo. Revisa tu bandeja de entrada.",
  user_already_exists: "Ese correo ya tiene una cuenta. Inicia sesión.",
  email_exists: "Ese correo ya tiene una cuenta. Inicia sesión.",
  weak_password: "La contraseña debe tener al menos 6 caracteres.",
  email_address_invalid: "Ese correo no parece válido.",
  validation_failed:
    "Revisa los datos: falta algo o no tiene el formato correcto.",
  over_email_send_rate_limit:
    "Demasiados intentos. Espera un minuto y vuelve a probar.",
  over_request_rate_limit:
    "Demasiados intentos. Espera un minuto y vuelve a probar.",
  same_password: "La contraseña nueva debe ser distinta de la anterior.",
  otp_expired: "Ese enlace ha caducado. Pide uno nuevo.",
  session_expired: "Tu sesión ha caducado. Vuelve a entrar.",
};

/**
 * Traduce al español los errores de Supabase, que llegan en inglés. Prioriza el
 * código; si no lo conoce, cae en un texto genérico, preferible a enseñar una
 * cadena en inglés a medio camino.
 */
function translateAuthError(error: { code?: string; message: string }): string {
  if (error.code && AUTH_ERRORS[error.code]) return AUTH_ERRORS[error.code];
  const m = error.message.toLowerCase();
  if (m.includes("failed to fetch") || m.includes("network"))
    return "No hay conexión con el servidor. Inténtalo de nuevo.";
  return "No se ha podido completar la operación. Inténtalo de nuevo.";
}

export function ArcadeProvider({ children }: { children: ReactNode }) {
  // Un único cliente por montaje del provider.
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  // Se guarda junto al id dueño del perfil: así, al cambiar de cuenta, nunca se
  // pinta el nombre de la anterior mientras llega el nuevo.
  const [profile, setProfile] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  // El estado inicial (sin sesión, cargando) es idéntico en servidor y cliente,
  // así que la hidratación no puede desajustarse.
  useEffect(() => {
    let active = true;

    // La clave antigua guardaba un usuario falso. Se limpia una sola vez.
    try {
      localStorage.removeItem(LEGACY_USER_KEY);
    } catch {
      /* localStorage puede estar deshabilitado */
    }

    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!active) return;
        setUserId(data.user?.id ?? null);
        setEmail(data.user?.email ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    // Ojo: nada de `await` a Supabase dentro de este callback — puede bloquear
    // el cliente. Solo se guarda el estado; el perfil se pide en otro efecto.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUserId(session?.user?.id ?? null);
      setEmail(session?.user?.email ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  // El nombre de jugador vive en `profiles`, no en la sesión.
  useEffect(() => {
    if (!userId) return;
    let active = true;
    supabase
      .from("profiles")
      .select("player_name")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (active && data) setProfile({ id: userId, name: data.player_name });
      });
    return () => {
      active = false;
    };
  }, [supabase, userId]);

  const user = useMemo<User | null>(() => {
    if (!userId) return null;
    // Mientras no haya llegado el perfil de ESTA cuenta, se muestra un nombre
    // derivado del correo en lugar de dejar el HUD vacío.
    const name = profile?.id === userId ? profile.name : nameFromEmail(email);
    return { name };
  }, [userId, profile, email]);

  const signUp = useCallback(
    async (
      emailArg: string,
      password: string,
      name: string,
    ): Promise<AuthResult> => {
      const { error } = await supabase.auth.signUp({
        email: emailArg,
        password,
        options: {
          data: { player_name: normalizePlayerName(name) },
          emailRedirectTo: `${window.location.origin}/auth/confirmar`,
        },
      });
      return error
        ? { ok: false, error: translateAuthError(error) }
        : { ok: true };
    },
    [supabase],
  );

  const signInWithPassword = useCallback(
    async (emailArg: string, password: string): Promise<AuthResult> => {
      const { error } = await supabase.auth.signInWithPassword({
        email: emailArg,
        password,
      });
      return error
        ? { ok: false, error: translateAuthError(error) }
        : { ok: true };
    },
    [supabase],
  );

  const signInWithOAuth = useCallback(
    async (provider: OAuthProvider): Promise<AuthResult> => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      return error
        ? { ok: false, error: translateAuthError(error) }
        : { ok: true };
    },
    [supabase],
  );

  const requestPasswordReset = useCallback(
    async (emailArg: string): Promise<AuthResult> => {
      const { error } = await supabase.auth.resetPasswordForEmail(emailArg, {
        redirectTo: `${window.location.origin}/auth/recuperar`,
      });
      return error
        ? { ok: false, error: translateAuthError(error) }
        : { ok: true };
    },
    [supabase],
  );

  const updatePlayerName = useCallback(
    async (name: string): Promise<AuthResult> => {
      if (!userId) return { ok: false, error: "No hay sesión iniciada." };
      const next = normalizePlayerName(name);
      if (next.length < 1)
        return { ok: false, error: "El nombre no puede estar vacío." };

      const { error } = await supabase
        .from("profiles")
        .update({ player_name: next })
        .eq("id", userId);

      if (error) {
        // 23505 = violación de unicidad en Postgres.
        if (error.code === "23505")
          return { ok: false, error: "Ese nombre ya está en uso." };
        return { ok: false, error: translateAuthError(error) };
      }
      setProfile({ id: userId, name: next });
      return { ok: true };
    },
    [supabase, userId],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUserId(null);
    setEmail(null);
    setProfile(null);
  }, [supabase]);

  const continueAsGuest = useCallback(() => {
    try {
      localStorage.setItem(GUEST_KEY, "1");
    } catch {
      /* localStorage puede estar deshabilitado */
    }
  }, []);

  const value = useMemo<ArcadeContextValue>(
    () => ({
      user,
      email,
      userId,
      loading,
      signUp,
      signInWithPassword,
      signInWithOAuth,
      requestPasswordReset,
      updatePlayerName,
      signOut,
      continueAsGuest,
    }),
    [
      user,
      email,
      userId,
      loading,
      signUp,
      signInWithPassword,
      signInWithOAuth,
      requestPasswordReset,
      updatePlayerName,
      signOut,
      continueAsGuest,
    ],
  );

  return (
    <ArcadeContext.Provider value={value}>{children}</ArcadeContext.Provider>
  );
}

export function useArcade(): ArcadeContextValue {
  const ctx = useContext(ArcadeContext);
  if (!ctx) {
    throw new Error("useArcade must be used within an ArcadeProvider");
  }
  return ctx;
}
