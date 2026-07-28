"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useArcade } from "./ArcadeProvider";

export default function Nav() {
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { user, email, signOut } = useArcade();

  const isHome = pathname === "/";
  // "biblioteca" cubre el catálogo y las rutas de juego (detalle/reproductor).
  const isLibrary =
    pathname.startsWith("/biblioteca") ||
    pathname.startsWith("/juego/") ||
    pathname.startsWith("/jugar/");
  const isSalon = pathname === "/salon";
  const isAbout = pathname === "/acerca";
  const isAuth = pathname === "/auth";

  const close = () => setOpen(false);

  // El menú de cuenta se cierra al pulsar fuera y con Escape. Ambos listeners
  // solo existen mientras está abierto.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const salir = async () => {
    setMenuOpen(false);
    await signOut();
    router.push("/");
  };

  return (
    <>
      <nav className="av-nav">
        <Link className="logo" href="/" onClick={close}>
          <div className="logo-mark" />
          <div className="logo-text neon-cyan">
            ARCADE <span className="neon-magenta">VAULT</span>
          </div>
        </Link>
        <div className="links">
          <Link className={isHome ? "active" : ""} href="/" onClick={close}>
            Inicio
          </Link>
          <Link
            className={isLibrary ? "active" : ""}
            href="/biblioteca"
            onClick={close}
          >
            Biblioteca
          </Link>
          <Link
            className={isSalon ? "active" : ""}
            href="/salon"
            onClick={close}
          >
            Salón de la Fama
          </Link>
          <Link
            className={isAbout ? "active" : ""}
            href="/acerca"
            onClick={close}
          >
            Acerca de
          </Link>
        </div>
        <div className="spacer" />
        <div className="coin-counter">
          <span className="coin" />
          <span>CRÉDITOS · 03</span>
        </div>
        {user ? (
          <div className="av-user" ref={menuRef}>
            <button
              className="btn ghost auth-btn"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              {user.name} {menuOpen ? "▴" : "▾"}
            </button>
            {menuOpen && (
              <div className="av-user-menu" role="menu">
                <div className="who">{email ?? "Sesión iniciada"}</div>
                <Link
                  className="btn ghost"
                  href="/auth"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                >
                  PERFIL
                </Link>
                <button className="btn ghost" role="menuitem" onClick={salir}>
                  CERRAR SESIÓN
                </button>
              </div>
            )}
          </div>
        ) : (
          <Link className="btn auth-btn" href="/auth" onClick={close}>
            Iniciar Sesión
          </Link>
        )}
        <button
          className="btn ghost hamburger"
          onClick={() => setOpen(true)}
          aria-label="Menú"
        >
          ≡
        </button>
      </nav>

      <div
        className={"av-mobile-backdrop" + (open ? " open" : "")}
        onClick={close}
      />
      <aside className={"av-mobile-panel" + (open ? " open" : "")}>
        <div
          className="pixel neon-cyan"
          style={{ fontSize: 11, marginBottom: 16 }}
        >
          MENÚ
        </div>
        <Link className={isHome ? "active" : ""} href="/" onClick={close}>
          Inicio
        </Link>
        <Link
          className={isLibrary ? "active" : ""}
          href="/biblioteca"
          onClick={close}
        >
          Biblioteca
        </Link>
        <Link className={isSalon ? "active" : ""} href="/salon" onClick={close}>
          Salón de la Fama
        </Link>
        <Link
          className={isAbout ? "active" : ""}
          href="/acerca"
          onClick={close}
        >
          Acerca de
        </Link>
        <Link className={isAuth ? "active" : ""} href="/auth" onClick={close}>
          {user ? "Cuenta" : "Iniciar Sesión"}
        </Link>
        <div style={{ flex: 1 }} />
        <div
          className="pixel"
          style={{
            fontSize: 9,
            color: "var(--ink-faint)",
            letterSpacing: "0.16em",
          }}
        >
          CRÉDITOS · 03
        </div>
      </aside>
    </>
  );
}
