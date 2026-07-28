"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useArcade } from "../../components/ArcadeProvider";

/**
 * Destino del enlace de recuperación. Se llega aquí con la sesión ya abierta
 * por /auth/callback, así que `updateUser` puede fijar la contraseña nueva.
 *
 * Si alguien entra sin sesión (enlace caducado o URL escrita a mano), Supabase
 * rechaza el cambio y se muestra el motivo: no se bloquea la ruta.
 */
export default function Recuperar() {
  const router = useRouter();
  const { updatePassword, loading, userId } = useArcade();

  const [pass, setPass] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;

    if (pass !== repeat) {
      setError("Las dos contraseñas no coinciden.");
      return;
    }

    setError(null);
    setSending(true);
    const res = await updatePassword(pass);
    setSending(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone(true);
  };

  return (
    <div className="av-auth-wrap fade-in">
      <div className="auth-card">
        <div className="auth-header">
          <div className="mark" />
          <h2 className="neon-cyan">ARCADE VAULT</h2>
          <div
            className="mono"
            style={{
              fontSize: 11,
              color: "var(--ink-faint)",
              letterSpacing: "0.16em",
              marginTop: 6,
            }}
          >
            CONTRASEÑA NUEVA
          </div>
        </div>

        {done ? (
          <div className="auth-sent slide-in">
            <h3>CONTRASEÑA CAMBIADA</h3>
            <p>Ya puedes usarla para entrar. Tu sesión sigue abierta.</p>
            <button
              className="btn lg"
              style={{ width: "100%", marginTop: 16 }}
              onClick={() => router.push("/biblioteca")}
            >
              IR A LA BIBLIOTECA
            </button>
          </div>
        ) : (
          <>
            {!loading && !userId && (
              <div className="auth-msg bad" role="alert">
                <span className="tag">&gt; ENLACE NO VÁLIDO</span>
                <p>
                  Este enlace ha caducado o ya se usó. Pide uno nuevo desde la
                  pantalla de acceso.
                </p>
              </div>
            )}

            {error && (
              <div className="auth-msg bad slide-in" role="alert">
                <span className="tag">&gt; NO SE PUDO CAMBIAR</span>
                <p>{error}</p>
              </div>
            )}

            <form onSubmit={submit}>
              <div className="field">
                <label>Contraseña nueva</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>
              <div className="field">
                <label>Repite la contraseña</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>

              <button
                className="btn lg"
                type="submit"
                disabled={sending}
                style={{ width: "100%", marginTop: 8 }}
              >
                {sending ? "GUARDANDO…" : "GUARDAR CONTRASEÑA"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
