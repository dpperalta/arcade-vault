"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { GAMES } from "../../../data/games";
import { insertScore } from "../../../data/catalog";
import { useArcade } from "../../../components/ArcadeProvider";
import TouchGamepad, {
  type GamepadConfig,
} from "../../../components/TouchGamepad";
import { useCoarsePointer } from "../../../components/useCoarsePointer";
import {
  createFrogger,
  type FroggerHandle,
  type GameState,
  type SkinName,
} from "./engine";

const GAME = GAMES.find((g) => g.id === "frogger")!;

const SKIN_OPTIONS: { key: SkinName; label: string }[] = [
  { key: "clasico", label: "CLÁSICO" },
  { key: "neon", label: "NEON" },
  { key: "retro", label: "RETRO" },
];

// Mando: dirección en las 4 flechas; sin botones de acción.
const PAD: GamepadConfig = {
  dirs: {
    up: "ArrowUp",
    down: "ArrowDown",
    left: "ArrowLeft",
    right: "ArrowRight",
  },
  a: null,
  b: null,
};

// SPEC 12 — Medidor de rendimiento. El chunk solo se descarga si se monta,
// así que sin `?fps=1` no se importa ni se ejecuta nada.
const PerfOverlay = dynamic(() => import("../../../components/PerfOverlay"), {
  ssr: false,
});

// `useSearchParams` vive aislado en este componente: envuelto en <Suspense>,
// suspende solo esta rama y no obliga a renderizar toda la página en cliente.
function PerfGate() {
  const on = useSearchParams().get("fps") === "1";
  return on ? <PerfOverlay /> : null;
}

const INITIAL_STATE: GameState = {
  score: 0,
  lives: 3,
  level: 1,
  phase: "playing",
};

export default function FroggerPlayer() {
  const router = useRouter();
  const { user } = useArcade();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handleRef = useRef<FroggerHandle | null>(null);

  const [gs, setGs] = useState<GameState>(INITIAL_STATE);
  const [over, setOver] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  // null = no editado: refleja el usuario hidratado (o "INVITADO") hasta que se escriba.
  const [nameEdit, setNameEdit] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveWarn, setSaveWarn] = useState(false);
  const [skin, setSkin] = useState<SkinName>("clasico");

  // Monta el motor una sola vez sobre el canvas ya renderizado.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handle = createFrogger(canvas, {
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

  const coarse = useCoarsePointer();
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
      <Suspense fallback={null}>
        <PerfGate />
      </Suspense>

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
            <div className="l">Vidas</div>
            <div className="v">{String(gs.lives).padStart(2, "0")}</div>
          </div>
          <div className="hud-stat level">
            <div className="l">Nivel</div>
            <div className="v">{String(gs.level).padStart(2, "0")}</div>
          </div>
        </div>
        <div className="hud-actions">
          {coarse ? (
            // Móvil: lista desplegable compacta, etiquetada "SKIN".
            <label className="av-skin-field">
              <span className="av-skin-label">SKIN</span>
              <select
                className="av-skin-select"
                aria-label="Skin del juego"
                value={skin}
                onChange={(e) => {
                  const key = e.target.value as SkinName;
                  setSkin(key);
                  handleRef.current?.setSkin(key);
                }}
              >
                {SKIN_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            // Desktop: chips seleccionables.
            <div
              className="av-chips"
              role="radiogroup"
              aria-label="Skin del juego"
              style={{ marginRight: 8 }}
            >
              {SKIN_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  role="radio"
                  aria-checked={skin === o.key}
                  className={`chip${skin === o.key ? " active" : ""}`}
                  onClick={() => {
                    setSkin(o.key);
                    handleRef.current?.setSkin(o.key);
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
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
            onClick={() => router.push("/juego/frogger")}
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

      {coarse && (
        <TouchGamepad
          config={PAD}
          onInput={(c, d) => handleRef.current?.input(c, d)}
        />
      )}

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
                      gameId: "frogger",
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
                className="btn cyan"
                onClick={() => router.push("/juego/frogger")}
              >
                VER LEADERBOARD
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
