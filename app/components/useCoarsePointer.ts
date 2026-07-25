"use client";

// ===== useCoarsePointer — detecta dispositivos táctiles (SPEC 10) =====
// Reactivo: escucha cambios de `(pointer: coarse)` (p. ej. al conectar/quitar
// un puntero fino). Devuelve false en SSR y en el primer render para evitar
// hydration mismatch; se corrige tras el montaje en el cliente.

import { useEffect, useState } from "react";

export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  return coarse;
}
