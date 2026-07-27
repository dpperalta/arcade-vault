"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useArcade } from "../components/ArcadeProvider";

type Msg = { kind: "bad" | "ok"; tag: string; text: string } | null;

export default function Auth() {
  const router = useRouter();
  const { continueAsGuest, signUp, signInWithPassword } = useArcade();

  const [tab, setTab] = useState<"in" | "up">("in");
  const [playerName, setPlayerName] = useState("");
  const [pass, setPass] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [sending, setSending] = useState(false);

  const switchTab = (next: "in" | "up") => {
    setTab(next);
    setMsg(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setMsg(null);
    setSending(true);

    const res =
      tab === "in"
        ? await signInWithPassword(email, pass)
        : await signUp(email, pass, playerName);

    setSending(false);

    if (!res.ok) {
      setMsg({
        kind: "bad",
        // Press Start 2P no trae glifos decorativos; ">" sí, y suena a terminal.
        tag: tab === "in" ? "> ACCESO DENEGADO" : "> REGISTRO RECHAZADO",
        text: res.error,
      });
      return;
    }

    if (tab === "in") {
      router.push("/biblioteca");
      return;
    }

    // El paso 7 del SPEC 13 sustituye esto por la pantalla "revisa tu correo".
    setMsg({
      kind: "ok",
      tag: "> CUENTA CREADA",
      text: `Te hemos enviado un correo a ${email}. Abre el enlace para activar la cuenta y entrar.`,
    });
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
            ACCESO AL SISTEMA · v2.6
          </div>
        </div>

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

        {msg && (
          <div className={`auth-msg ${msg.kind} slide-in`} role="alert">
            <span className="tag">{msg.tag}</span>
            <p>{msg.text}</p>
          </div>
        )}

        <form onSubmit={submit}>
          {tab === "up" && (
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

          <div className="field">
            <label>Contraseña</label>
            <input
              type="password"
              required
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="••••••••"
              autoComplete={tab === "in" ? "current-password" : "new-password"}
            />
          </div>

          <button
            className="btn lg"
            type="submit"
            disabled={sending}
            style={{ width: "100%", marginTop: 8 }}
          >
            {sending
              ? "CONECTANDO…"
              : tab === "in"
                ? "ENTRAR AL VAULT"
                : "CREAR Y JUGAR"}
          </button>
        </form>

        <button
          className="btn ghost"
          style={{ width: "100%", marginTop: 10 }}
          onClick={() => {
            continueAsGuest();
            router.push("/biblioteca");
          }}
        >
          JUGAR COMO INVITADO
        </button>

        <div className="auth-divider">O CONTINÚA CON</div>
        <div className="social">
          <button className="btn ghost" type="button">
            ◆ GOOGLE
          </button>
          <button className="btn ghost" type="button">
            ▣ GITHUB
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
      </div>
    </div>
  );
}
