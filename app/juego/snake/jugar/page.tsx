"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GAMES } from "../../../data/games";
import { insertScore } from "../../../data/catalog";
import { useArcade } from "../../../components/ArcadeProvider";
import { createSnake, type SnakeHandle, type GameState } from "./engine";

const GAME = GAMES.find((g) => g.id === "snake")!;

const INITIAL_STATE: GameState = {
  score: 0,
  length: 3,
  level: 1,
  phase: "playing",
};

export default function SnakePlayer() {
  const router = useRouter();
  const { user } = useArcade();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handleRef = useRef<SnakeHandle | null>(null);

  const [gs, setGs] = useState<GameState>(INITIAL_STATE);
  const [over, setOver] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  // null = no editado: refleja el usuario hidratado (o "INVITADO") hasta que se escriba.
  const [nameEdit, setNameEdit] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveWarn, setSaveWarn] = useState(false);

  // Monta el motor una sola vez sobre el canvas ya renderizado.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handle = createSnake(canvas, {
      onState: (s) => setGs(s),
      onGameOver: (fs) => {
        setFinalScore(fs);
        setOver(true);
      },
    });
    handleRef.current = handle;

    // Mundo responsive: re-mide y recalcula el tamaño de celda al cambiar tamaño.
    const ro = new ResizeObserver(() => handle.resize());
    ro.observe(canvas);

    return () => {
      ro.disconnect();
      handle.destroy();
      handleRef.current = null;
    };
  }, []);

  const paused = gs.phase === "paused";
  const name = nameEdit ?? user?.name ?? "INVITADO";

  const restart = () => {
    setOver(false);
    setSaved(false);
    setSaveWarn(false);
    setNameEdit(null);
    handleRef.current?.restart();
  };

  return (
    <div className="av-player fade-in">
      <div className="player-hud">
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div className="hud-stat">
            <div className="l">Jugador</div>
            <div className="v" style={{ color: "var(--ink)" }}>
              {user?.name ?? "INVITADO"}
            </div>
          </div>
          <div className="hud-stat">
            <div className="l">Puntuación</div>
            <div className="v">{gs.score.toLocaleString("es-ES")}</div>
          </div>
          <div className="hud-stat">
            <div className="l">Longitud</div>
            <div className="v">{String(gs.length).padStart(2, "0")}</div>
          </div>
          <div className="hud-stat level">
            <div className="l">Nivel</div>
            <div className="v">{String(gs.level).padStart(2, "0")}</div>
          </div>
        </div>
        <div className="hud-actions">
          <button
            className="btn yellow"
            onClick={() =>
              paused ? handleRef.current?.resume() : handleRef.current?.pause()
            }
          >
            {paused ? "REANUDAR" : "PAUSA"}
          </button>
          <button
            className="btn magenta"
            onClick={() => handleRef.current?.forceGameOver()}
          >
            FIN
          </button>
          <button
            className="btn ghost"
            onClick={() => router.push("/juego/snake")}
          >
            SALIR
          </button>
        </div>
      </div>

      <div className="crt">
        <div className="crt-screen">
          <canvas
            ref={canvasRef}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              display: "block",
            }}
          />
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
          <span>{GAME.title} · CRT-83 · 60 HZ</span>
          <span>CARGA · 1MB</span>
        </div>
      </div>

      {over && (
        <div className="modal-bd">
          <div className="modal">
            <h2>FIN DEL JUEGO</h2>
            <div className="final-label">PUNTUACIÓN FINAL</div>
            <div className="final">{finalScore.toLocaleString("es-ES")}</div>
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
                      gameId: "snake",
                      playerName: name,
                      score: finalScore,
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
