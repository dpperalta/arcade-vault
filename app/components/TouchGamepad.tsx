"use client";

// ===== TouchGamepad — mando en pantalla compartido por los 4 juegos =====
// Recibe un GamepadConfig (qué direcciones/botones activa cada juego y qué
// KeyboardEvent.code inyecta cada uno) y una función onInput(code, down) que
// enruta al motor por el mismo camino que el teclado (Handle.input).
//
// - Direcciones: siempre "hold" (down en pointerdown, up en pointerup/cancel/
//   leave). El motor decide si es continuo (Asteroids/Arkanoid) o edge-triggered
//   (Tetris/Snake: solo el "down" dispara acción).
// - Botones A/B: `hold` → mismo esquema press/release; tap → un pulso down+up.
// - Direcciones/botones sin `code` salen atenuados e inertes.
// - touch-action:none + preventDefault para no scrollear/zoomear al jugar.

import { useCallback } from "react";

export type PadDir = "up" | "down" | "left" | "right";

export interface PadButton {
  label: string; // etiqueta visible: "A", "B", "↻", "⤓", …
  code: string; // KeyboardEvent.code que inyecta al motor
  hold?: boolean; // true = mantener (down/up); false/undefined = pulso (tap)
}

export interface GamepadConfig {
  dirs: Partial<Record<PadDir, string>>; // dirección → code; ausente = atenuada/inerte
  a: PadButton | null; // botón A (null = atenuado/inerte)
  b: PadButton | null; // botón B
}

interface TouchGamepadProps {
  config: GamepadConfig;
  onInput: (code: string, down: boolean) => void;
}

const DIR_GLYPH: Record<PadDir, string> = {
  up: "▲",
  down: "▼",
  left: "◀",
  right: "▶",
};

// Una tecla del mando: gestiona los eventos pointer y llama a onInput.
// - code === null → inerte (atenuada), no dispara nada.
// - hold === true → down en press, up en release (pointerup/cancel/leave).
// - hold === false → pulso down+up en el press.
function PadKey({
  label,
  code,
  hold,
  className,
  onInput,
}: {
  label: string;
  code: string | null;
  hold: boolean;
  className: string;
  onInput: (code: string, down: boolean) => void;
}) {
  const inert = code === null;

  const handleDown = useCallback(
    (e: React.PointerEvent) => {
      if (inert) return;
      e.preventDefault();
      if (hold) {
        onInput(code!, true);
      } else {
        // Pulso: down + up inmediato (para acciones edge-triggered tipo tap).
        onInput(code!, true);
        onInput(code!, false);
      }
    },
    [inert, hold, code, onInput],
  );

  const handleUp = useCallback(
    (e: React.PointerEvent) => {
      if (inert || !hold) return;
      e.preventDefault();
      onInput(code!, false);
    },
    [inert, hold, code, onInput],
  );

  return (
    <button
      type="button"
      className={`${className}${inert ? " tg-inert" : ""}`}
      disabled={inert}
      aria-disabled={inert}
      // Los cuatro eventos que pide el spec para no perder el "up".
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      onPointerLeave={handleUp}
      // Evita el "fantasma" de click/contextmenu tras el toque.
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

export default function TouchGamepad({ config, onInput }: TouchGamepadProps) {
  const dir = (d: PadDir) => (
    <PadKey
      label={DIR_GLYPH[d]}
      code={config.dirs[d] ?? null}
      hold
      className={`tg-dir tg-${d}`}
      onInput={onInput}
    />
  );

  const actionKey = (btn: PadButton | null, letter: "a" | "b") => (
    <PadKey
      label={btn?.label ?? letter.toUpperCase()}
      code={btn?.code ?? null}
      hold={btn?.hold ?? false}
      className={`tg-action tg-${letter}`}
      onInput={onInput}
    />
  );

  return (
    <div className="touch-gamepad" role="group" aria-label="Mando táctil">
      {/* Cruceta de 4 direcciones */}
      <div className="tg-dpad">
        <div className="tg-dpad-row">{dir("up")}</div>
        <div className="tg-dpad-row">
          {dir("left")}
          <span className="tg-dpad-hub" aria-hidden />
          {dir("right")}
        </div>
        <div className="tg-dpad-row">{dir("down")}</div>
      </div>

      {/* Botones de acción A / B */}
      <div className="tg-actions">
        {actionKey(config.b, "b")}
        {actionKey(config.a, "a")}
      </div>
    </div>
  );
}
