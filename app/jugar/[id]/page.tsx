"use client";

import { useEffect, useState, use } from "react";
import { notFound, useRouter } from "next/navigation";
import { GAMES } from "../../data/games";
import { insertScore } from "../../data/catalog";
import { useArcade } from "../../components/ArcadeProvider";

export default function GamePlayer({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useArcade();

  const game = GAMES.find((g) => g.id === id);

  const [score, setScore] = useState(0);
  const [lives] = useState(3);
  const [paused, setPaused] = useState(false);
  const [over, setOver] = useState(false);
  // null = no editado: refleja el usuario hidratado (o "INVITADO") hasta que se escriba.
  const [nameEdit, setNameEdit] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveWarn, setSaveWarn] = useState(false);

  // Nivel derivado de la puntuación (sube cada 2500 puntos).
  const level = 1 + Math.floor(score / 2500);
  const name = nameEdit ?? user?.name ?? "INVITADO";

  useEffect(() => {
    if (over || paused) return;
    const t = setInterval(
      () => setScore((s) => s + Math.floor(10 + Math.random() * 90)),
      220,
    );
    return () => clearInterval(t);
  }, [over, paused]);

  if (!game) notFound();

  const endGame = () => setOver(true);
  const restart = () => {
    setScore(0);
    setPaused(false);
    setOver(false);
    setSaved(false);
    setSaveWarn(false);
    setNameEdit(null);
  };

  return (
    <div className="av-player fade-in">
      <div className="player-hud">
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div className="hud-stat">
            <div className="l">Jugador</div>
            <div className="v" style={{ color: "var(--ink)" }}>
              {name}
            </div>
          </div>
          <div className="hud-stat">
            <div className="l">Puntuación</div>
            <div className="v">{score.toLocaleString("es-ES")}</div>
          </div>
          <div className="hud-stat lives">
            <div className="l">Vidas</div>
            <div className="v">{"♥ ".repeat(lives).trim() || "—"}</div>
          </div>
          <div className="hud-stat level">
            <div className="l">Nivel</div>
            <div className="v">{String(level).padStart(2, "0")}</div>
          </div>
        </div>
        <div className="hud-actions">
          <button className="btn yellow" onClick={() => setPaused((p) => !p)}>
            {paused ? "REANUDAR" : "PAUSA"}
          </button>
          <button className="btn magenta" onClick={endGame}>
            FIN
          </button>
          <button
            className="btn ghost"
            onClick={() => router.push(`/juego/${game.id}`)}
          >
            SALIR
          </button>
        </div>
      </div>

      <div className="crt">
        <div className="crt-screen">
          <div className="game-arena">
            <div className="grid-floor" />
            <div className="enemy e1" />
            <div className="enemy e2" />
            <div className="enemy e3" />
            <div className="player-ship" />
          </div>
          {paused && (
            <div
              className="crt-content"
              style={{ background: "rgba(0,0,0,0.6)", zIndex: 5 }}
            >
              <div>
                <div className="pixel neon-yellow" style={{ fontSize: 22 }}>
                  EN PAUSA
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 11,
                    color: "var(--ink-dim)",
                    marginTop: 10,
                    letterSpacing: "0.16em",
                  }}
                >
                  PULSA REANUDAR PARA CONTINUAR
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="crt-bottom">
          <span className="led">SEÑAL OK</span>
          <span>{game.title} · CRT-83 · 60 HZ</span>
          <span>CARGA · 1MB</span>
        </div>
      </div>

      {over && (
        <div className="modal-bd">
          <div className="modal">
            <h2>FIN DEL JUEGO</h2>
            <div className="final-label">PUNTUACIÓN FINAL</div>
            <div className="final">{score.toLocaleString("es-ES")}</div>
            {!saved ? (
              <div className="input-row">
                <input
                  value={name}
                  onChange={(e) =>
                    setNameEdit(e.target.value.toUpperCase().slice(0, 10))
                  }
                  placeholder="TUS INICIALES"
                />
                <button
                  className="btn yellow"
                  onClick={async () => {
                    const { ok } = await insertScore({
                      gameId: game.id,
                      playerName: name,
                      score,
                    });
                    setSaveWarn(!ok);
                    setSaved(true);
                  }}
                >
                  GUARDAR PUNTUACIÓN
                </button>
              </div>
            ) : (
              <>
                <div className="toast-saved">▸ PUNTUACIÓN GUARDADA_</div>
                {saveWarn && (
                  <div
                    className="mono"
                    style={{
                      fontSize: 10,
                      color: "var(--ink-dim)",
                      marginTop: 8,
                      letterSpacing: "0.12em",
                    }}
                  >
                    (sin conexión — no se pudo enviar al servidor)
                  </div>
                )}
              </>
            )}
            <div className="actions">
              <button className="btn" onClick={restart}>
                JUGAR DE NUEVO
              </button>
              <button
                className="btn magenta"
                onClick={() => router.push("/biblioteca")}
              >
                VOLVER AL VAULT
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
