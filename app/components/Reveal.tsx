"use client";

import { useEffect } from "react";

/**
 * Observa los elementos con la clase `.reveal` y les añade `.in` cuando entran
 * en el viewport, disparando la animación de revelado al hacer scroll.
 * Portado de `useReveal` en `references/templates/home-about/home.jsx`.
 *
 * No renderiza nada: se monta una vez en la página y observa el DOM existente.
 */
export default function Reveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".reveal");
    if (!els.length) return;

    // Sin IntersectionObserver: mostrar todo sin animación (fail-safe).
    if (typeof IntersectionObserver === "undefined") {
      els.forEach((el) => el.classList.add("in"));
      return;
    }

    const root = document.documentElement;
    // Solo ahora —ya montados y con el observer listo— habilitamos el estado
    // oculto+animado. Si este efecto no corre, el contenido queda visible.
    root.setAttribute("data-reveal", "");

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    els.forEach((el) => io.observe(el));

    return () => {
      io.disconnect();
      root.removeAttribute("data-reveal");
    };
  }, []);

  return null;
}
