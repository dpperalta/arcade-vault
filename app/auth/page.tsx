"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useArcade } from "../components/ArcadeProvider";

type Msg = { kind: "bad" | "ok"; tag: string; text: string } | null;

/** Avisos que llegan por query param desde las rutas de vuelta. */
const RETURN_MSG: Record<string, NonNullable<Msg>> = {
  confirmacion: {
    kind: "bad",
    tag: "> ENLACE NO VÁLIDO",
    text: "Ese enlace ha caducado o ya se había usado. Vuelve a registrarte o inicia sesión.",
  },
  cancelado: {
    kind: "ok",
    tag: "> ACCESO CANCELADO",
    text: "Has cancelado el acceso. Puedes probar otra vez o entrar con tu correo.",
  },
  oauth: {
    kind: "bad",
    tag: "> ACCESO DENEGADO",
    text: "No hemos podido completar el acceso con ese proveedor. Inténtalo de nuevo.",
  },
};

/**
 * `useSearchParams()` obliga a un límite de Suspense: sin él, `next build`
 * falla al prerenderizar esta ruta. Con el wrapper, /auth sigue siendo estática.
 */
export default function Auth() {
  return (
    <Suspense fallback={<div className="av-auth-wrap" />}>
      <AuthCard />
    </Suspense>
  );
}

function AuthCard() {
  const router = useRouter();
  const params = useSearchParams();
  const {
    user,
    email: cuentaEmail,
    userId,
    loading,
    continueAsGuest,
    signUp,
    signInWithPassword,
    signInWithOAuth,
    requestPasswordReset,
    updatePlayerName,
  } = useArcade();

  const [tab, setTab] = useState<"in" | "up">("in");
  // Vista de "he olvidado la contraseña": solo pide el correo.
  const [recovering, setRecovering] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [pass, setPass] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<Msg>(
    RETURN_MSG[params.get("error") ?? ""] ?? null,
  );
  const [sending, setSending] = useState(false);
  // Proveedor cuyo redirect está en marcha, para deshabilitar solo ese botón.
  const [oauthBusy, setOauthBusy] = useState<"google" | "github" | null>(null);
  // Correo al que se envió el enlace, y para qué. Mientras tenga valor se
  // muestra la pantalla de aviso en lugar del formulario.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sentKind, setSentKind] = useState<"alta" | "reset">("alta");
  // Nombre en edición. `null` = aún no se ha tocado, así que se muestra el
  // actual. Derivarlo evita sincronizarlo con un efecto cuando llega el perfil.
  const [nameDraft, setNameDraft] = useState<string | null>(null);

  const guardarNombre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setMsg(null);
    setSending(true);
    const res = await updatePlayerName(nameDraft ?? user?.name ?? "");
    setSending(false);
    setMsg(
      res.ok
        ? {
            kind: "ok",
            tag: "> NOMBRE ACTUALIZADO",
            text: "Así te verá el salón de la fama.",
          }
        : { kind: "bad", tag: "> NO SE PUDO CAMBIAR", text: res.error },
    );
  };

  const switchTab = (next: "in" | "up") => {
    setTab(next);
    setMsg(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setMsg(null);
    setSending(true);

    const res = recovering
      ? await requestPasswordReset(email)
      : tab === "in"
        ? await signInWithPassword(email, pass)
        : await signUp(email, pass, playerName);

    setSending(false);

    if (!res.ok) {
      setMsg({
        kind: "bad",
        // Press Start 2P no trae glifos decorativos; ">" sí, y suena a terminal.
        tag: recovering
          ? "> NO SE PUDO ENVIAR"
          : tab === "in"
            ? "> ACCESO DENEGADO"
            : "> REGISTRO RECHAZADO",
        text: res.error,
      });
      return;
    }

    if (!recovering && tab === "in") {
      router.push("/biblioteca");
      return;
    }

    setSentKind(recovering ? "reset" : "alta");
    setSentTo(email);
  };

  const entrarCon = async (provider: "google" | "github") => {
    if (oauthBusy) return;
    setMsg(null);
    setOauthBusy(provider);
    const res = await signInWithOAuth(provider);
    // Si sale bien, el navegador ya está saliendo hacia el proveedor y no hay
    // nada que pintar. Solo se recupera el botón cuando falla.
    if (!res.ok) {
      setOauthBusy(null);
      setMsg({ kind: "bad", tag: "> ACCESO DENEGADO", text: res.error });
    }
  };

  const volverAlAcceso = () => {
    setSentTo(null);
    setMsg(null);
    setRecovering(false);
    setTab("in");
    setPass("");
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
            {userId ? "TU CUENTA" : "ACCESO AL SISTEMA · v2.6"}
          </div>
        </div>

        {userId ? (
          <div className="auth-account slide-in">
            <div className="who">{cuentaEmail ?? "Sesión iniciada"}</div>

            {msg && (
              <div className={`auth-msg ${msg.kind} slide-in`} role="alert">
                <span className="tag">{msg.tag}</span>
                <p>{msg.text}</p>
              </div>
            )}

            <form onSubmit={guardarNombre}>
              <div className="field">
                <label>Nombre de jugador</label>
                <input
                  value={nameDraft ?? user?.name ?? ""}
                  onChange={(e) => setNameDraft(e.target.value)}
                  maxLength={10}
                  required
                  style={{ textTransform: "uppercase" }}
                  autoComplete="nickname"
                />
              </div>
              <p className="hint">
                Hasta 10 caracteres. Es el nombre con el que apareces en el
                salón de la fama, y no puede repetirse.
              </p>
              <button
                className="btn lg"
                type="submit"
                disabled={sending}
                style={{ width: "100%", marginTop: 8 }}
              >
                {sending ? "GUARDANDO…" : "GUARDAR NOMBRE"}
              </button>
            </form>

            <button
              className="btn ghost"
              style={{ width: "100%", marginTop: 10 }}
              onClick={() => router.push("/biblioteca")}
            >
              IR A LA BIBLIOTECA
            </button>
          </div>
        ) : loading ? (
          // Sin esto, quien ya tiene sesión ve un instante el formulario de
          // login antes de que se resuelva `getUser()`.
          <div className="auth-account" style={{ minHeight: 220 }} />
        ) : sentTo ? (
          <div className="auth-sent slide-in">
            <h3>REVISA TU CORREO</h3>
            <p>
              Hemos enviado un enlace a <strong>{sentTo}</strong>.{" "}
              {sentKind === "alta"
                ? "Ábrelo para activar la cuenta y entrar."
                : "Ábrelo para elegir una contraseña nueva."}
            </p>
            <p className="hint">
              ¿No aparece? Mira en spam o en correo no deseado.
            </p>
            <button
              className="btn ghost"
              style={{ width: "100%", marginTop: 16 }}
              onClick={volverAlAcceso}
            >
              VOLVER AL ACCESO
            </button>
          </div>
        ) : (
          <>
            {recovering ? (
              <div className="auth-recover-head">
                <h3>RECUPERAR ACCESO</h3>
                <p>
                  Escribe tu correo y te enviamos un enlace para elegir una
                  contraseña nueva.
                </p>
              </div>
            ) : (
              <div className="auth-tabs">
                <button
                  className={tab === "in" ? "on" : ""}
                  onClick={() => switchTab("in")}
                >
                  INICIAR SESIÓN
                </button>
                <button
                  className={tab === "up" ? "on" : ""}
                  onClick={() => switchTab("up")}
                >
                  CREAR CUENTA
                </button>
              </div>
            )}

            {msg && (
              <div className={`auth-msg ${msg.kind} slide-in`} role="alert">
                <span className="tag">{msg.tag}</span>
                <p>{msg.text}</p>
              </div>
            )}

            <form onSubmit={submit}>
              {tab === "up" && !recovering && (
                <div className="field slide-in">
                  <label>Nombre de jugador</label>
                  <input
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="PX_KAI"
                    maxLength={10}
                    style={{ textTransform: "uppercase" }}
                    autoComplete="nickname"
                  />
                </div>
              )}

              <div className="field">
                <label>Correo electrónico</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jugador@vault.gg"
                  autoComplete="email"
                />
              </div>

              {!recovering && (
                <div className="field">
                  <label>Contraseña</label>
                  <input
                    type="password"
                    required
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={
                      tab === "in" ? "current-password" : "new-password"
                    }
                  />
                </div>
              )}

              {tab === "in" && !recovering && (
                <button
                  type="button"
                  className="auth-link"
                  onClick={() => {
                    setRecovering(true);
                    setMsg(null);
                    setPass("");
                  }}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              )}

              <button
                className="btn lg"
                type="submit"
                disabled={sending}
                style={{ width: "100%", marginTop: 8 }}
              >
                {sending
                  ? recovering
                    ? "ENVIANDO…"
                    : "CONECTANDO…"
                  : recovering
                    ? "ENVIAR ENLACE"
                    : tab === "in"
                      ? "ENTRAR AL VAULT"
                      : "CREAR Y JUGAR"}
              </button>
            </form>

            <button
              className="btn ghost"
              style={{ width: "100%", marginTop: 10 }}
              onClick={
                recovering
                  ? volverAlAcceso
                  : () => {
                      continueAsGuest();
                      router.push("/biblioteca");
                    }
              }
            >
              {recovering ? "VOLVER AL ACCESO" : "JUGAR COMO INVITADO"}
            </button>

            {!recovering && (
              <>
                <div className="auth-divider">O CONTINÚA CON</div>
                <div className="social">
                  <button
                    className="btn ghost"
                    type="button"
                    disabled={oauthBusy !== null}
                    onClick={() => entrarCon("google")}
                  >
                    {oauthBusy === "google" ? "ABRIENDO…" : "◆ GOOGLE"}
                  </button>
                  <button
                    className="btn ghost"
                    type="button"
                    disabled={oauthBusy !== null}
                    onClick={() => entrarCon("github")}
                  >
                    {oauthBusy === "github" ? "ABRIENDO…" : "▣ GITHUB"}
                  </button>
                </div>

                <div
                  style={{
                    marginTop: 18,
                    textAlign: "center",
                    fontSize: 11,
                    color: "var(--ink-faint)",
                    letterSpacing: "0.1em",
                  }}
                >
                  AL ENTRAR ACEPTAS LOS TÉRMINOS DEL SALÓN ARCADE
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
