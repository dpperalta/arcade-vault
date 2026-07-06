"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GAMES } from "../../../data/games";
import {
  createAsteroids,
  type AsteroidsHandle,
  type GameState,
} from "./engine";

const GAME = GAMES.find((g) => g.id === "asteroids")!;

const INITIAL_STATE: GameState = {
  score: 0,
  lives: 3,
  level: 1,
  tripleShot: 0,
  phase: "playing",
};

export default function AsteroidsPlayer() {
  const router = useRouter();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handleRef = useRef<AsteroidsHandle | null>(null);

  const [gs, setGs] = useState<GameState>(INITIAL_STATE);

  // Monta el motor una sola vez sobre el canvas ya renderizado.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handle = createAsteroids(canvas, {
      onState: (s) => setGs(s),
      onGameOver: () => {
        // El modal de fin se cablea en el Paso 7.
      },
    });
    handleRef.current = handle;

    return () => {
      handle.destroy();
      handleRef.current = null;
    };
  }, []);

  const paused = gs.phase === "paused";

  return (
    <div className="av-player fade-in">
      <div className="player-hud">
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div className="hud-stat">
            <div className="l">Jugador</div>
            <div className="v" style={{ color: "var(--ink)" }}>
              INVITADO
            </div>
          </div>
          <div className="hud-stat">
            <div className="l">Puntuación</div>
            <div className="v">{gs.score.toLocaleString("es-ES")}</div>
          </div>
          <div className="hud-stat lives">
            <div className="l">Vidas</div>
            <div className="v">{"♥ ".repeat(gs.lives).trim() || "—"}</div>
          </div>
          <div className="hud-stat level">
            <div className="l">Nivel</div>
            <div className="v">{String(gs.level).padStart(2, "0")}</div>
          </div>
          {gs.tripleShot > 0 && (
            <div className="hud-stat">
              <div className="l">Disparo 3x</div>
              <div className="v" style={{ color: "var(--cyan)" }}>
                {gs.tripleShot.toFixed(1)}s
              </div>
            </div>
          )}
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
            onClick={() => router.push("/juego/asteroids")}
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
    </div>
  );
}
