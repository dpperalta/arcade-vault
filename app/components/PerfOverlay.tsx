"use client";

// ===== PerfOverlay — medidor de FPS / frame-time / heap (SPEC 12) =====
// Se monta solo bajo `?fps=1`. Vive fuera del ciclo de render de React: se
// alimenta de su propio requestAnimationFrame y escribe el texto directo al
// DOM por ref, sin declarar ni un solo estado de React. Un medidor que
// re-renderiza a 60 fps falsearía justo lo que viene a medir.
//
// Coste por frame: una resta y una escritura en un buffer preasignado. El
// texto se repinta 4 veces por segundo, no 60.

import { useEffect, useRef } from "react";

const SAMPLE_COUNT = 120; // ~2 s a 60 fps
const PAINT_MS = 250; // refresco del texto: 4 Hz

// `performance.memory` es no estándar (solo Chromium). No está en lib.dom.
interface MemoryInfo {
  usedJSHeapSize: number;
}

function readHeapMb(): number | null {
  const mem = (performance as Performance & { memory?: MemoryInfo }).memory;
  return mem ? mem.usedJSHeapSize / 1048576 : null;
}

export default function PerfOverlay() {
  const fpsRef = useRef<HTMLSpanElement | null>(null);
  const p95Ref = useRef<HTMLSpanElement | null>(null);
  const heapRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    // Buffers asignados una sola vez al montar; nunca crecen ni se reemplazan.
    const frameMs = new Float64Array(SAMPLE_COUNT); // circular
    const sorted = new Float64Array(SAMPLE_COUNT); // copia reutilizada para el p95
    let head = 0;
    let filled = 0;

    let prev = performance.now();
    let lastPaint = prev;
    let raf = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);

      const dt = now - prev;
      prev = now;

      frameMs[head] = dt;
      head = (head + 1) % SAMPLE_COUNT;
      if (filled < SAMPLE_COUNT) filled++;

      if (now - lastPaint < PAINT_MS) return;
      lastPaint = now;

      if (fpsRef.current) {
        fpsRef.current.textContent = dt > 0 ? (1000 / dt).toFixed(0) : "—";
      }

      if (p95Ref.current) {
        // Ordena in situ sobre la copia preasignada: sin `[...arr].sort()`.
        sorted.set(frameMs);
        const view = sorted.subarray(0, filled);
        view.sort();
        const i = Math.min(filled - 1, Math.floor(filled * 0.95));
        p95Ref.current.textContent = `${view[i].toFixed(1)} ms`;
      }

      if (heapRef.current) {
        const mb = readHeapMb();
        heapRef.current.textContent = mb === null ? "—" : `${mb.toFixed(1)} MB`;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className="perf-overlay"
      style={{
        position: "fixed",
        top: 8,
        right: 8,
        zIndex: 9999,
        pointerEvents: "none",
        display: "grid",
        gridTemplateColumns: "auto auto",
        columnGap: 10,
        rowGap: 2,
        padding: "8px 10px",
        background: "rgba(0,0,0,0.72)",
        border: "1px solid var(--cyan)",
        borderRadius: 4,
        fontFamily: "var(--mono)",
        fontSize: 11,
        letterSpacing: "0.08em",
        lineHeight: 1.4,
        color: "var(--cyan)",
      }}
    >
      <span style={{ color: "var(--ink-dim)" }}>FPS</span>
      <span ref={fpsRef} style={{ textAlign: "right" }}>
        —
      </span>
      <span style={{ color: "var(--ink-dim)" }}>P95</span>
      <span ref={p95Ref} style={{ textAlign: "right" }}>
        —
      </span>
      <span style={{ color: "var(--ink-dim)" }}>HEAP</span>
      <span ref={heapRef} style={{ textAlign: "right" }}>
        —
      </span>
    </div>
  );
}
