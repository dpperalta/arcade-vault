"use client";

import { useState } from "react";
import { sendContact } from "../acerca/actions";

type Phase = "idle" | "sending" | "sent" | "error";

// Formulario de contacto (portado de about.jsx). El envío real lo hace la
// Server Action sendContact; aquí se gestionan validación de UX y estados.
export default function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", msg: "" });
  const [phase, setPhase] = useState<Phase>("idle");
  const [shake, setShake] = useState(false);
  const [sentName, setSentName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.msg.trim()) {
      setShake(true);
      setTimeout(() => setShake(false), 400);
      return;
    }

    setPhase("sending");
    const res = await sendContact(form);
    if (res.ok) {
      setSentName(form.name.trim());
      setPhase("sent");
    } else {
      setErrorMsg(res.error);
      setPhase("error");
    }
  };

  const reset = () => {
    setForm({ name: "", email: "", msg: "" });
    setPhase("idle");
  };

  const sending = phase === "sending";

  return (
    <form className={"contact-form" + (shake ? " shake" : "")} onSubmit={onSubmit}>
      {phase === "sent" ? (
        <div className="terminal-success">
          <div className="term-bar">
            <span className="dot r"></span>
            <span className="dot y"></span>
            <span className="dot g"></span>
            <span className="term-title">VAULT-OS // TERMINAL</span>
          </div>
          <div className="term-body">
            <div className="line">
              <span className="prompt">vault@arcade:~$</span> ./send_message --to=team
            </div>
            <div className="line dim">[OK] Conectando con servidor…</div>
            <div className="line dim">[OK] Validando contenido…</div>
            <div className="line dim">[OK] Transmitiendo paquete…</div>
            <div className="line success">
              &gt; MENSAJE RECIBIDO. TE RESPONDEREMOS PRONTO. GRACIAS,{" "}
              {sentName.toUpperCase()}.<span className="caret">_</span>
            </div>
            <div style={{ marginTop: 18 }}>
              <button className="btn ghost" type="button" onClick={reset}>
                ENVIAR OTRO MENSAJE
              </button>
            </div>
          </div>
        </div>
      ) : phase === "error" ? (
        <div className="terminal-success is-error">
          <div className="term-bar">
            <span className="dot r"></span>
            <span className="dot y"></span>
            <span className="dot g"></span>
            <span className="term-title">VAULT-OS // TERMINAL</span>
          </div>
          <div className="term-body">
            <div className="line">
              <span className="prompt">vault@arcade:~$</span> ./send_message --to=team
            </div>
            <div className="line dim">[OK] Conectando con servidor…</div>
            <div className="line error">[ERROR] Transmisión interrumpida.</div>
            <div className="line fail">
              &gt; {errorMsg.toUpperCase()}<span className="caret">_</span>
            </div>
            <div style={{ marginTop: 18 }}>
              <button
                className="btn ghost"
                type="button"
                onClick={() => setPhase("idle")}
              >
                REINTENTAR
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="field">
            <label>NOMBRE</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="px_kai"
              disabled={sending}
            />
          </div>
          <div className="field">
            <label>CORREO ELECTRÓNICO</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="jugador@vault.gg"
              disabled={sending}
            />
          </div>
          <div className="field">
            <label>MENSAJE</label>
            <textarea
              rows={5}
              value={form.msg}
              onChange={(e) => setForm({ ...form, msg: e.target.value })}
              placeholder="Cuéntanos qué tienes en mente…"
              disabled={sending}
            ></textarea>
          </div>
          <button
            className="btn xl press"
            type="submit"
            style={{ width: "100%" }}
            disabled={sending}
          >
            {sending ? "TRANSMITIENDO…" : "▶  ENVIAR MENSAJE"}
          </button>
        </>
      )}
    </form>
  );
}
