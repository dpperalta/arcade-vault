import type { NextConfig } from "next";

/**
 * Cabeceras de seguridad aplicadas a todas las rutas (SPEC 14).
 *
 * Se comprueban antes del sistema de archivos, así que cubren también /public.
 * No hay `Content-Security-Policy` a propósito: exige nonce por request y su
 * propia lista de orígenes, y va en su propio spec.
 */
const securityHeaders = [
  // El navegador no adivina el tipo de un recurso: usa el Content-Type declarado.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Clickjacking: Arcade Vault no se embebe en ningún iframe, ni propio ni ajeno.
  // Quedará superseded por `frame-ancestors` cuando entre CSP.
  { key: "X-Frame-Options", value: "DENY" },
  // No filtrar rutas internas ni query strings al salir del sitio.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // El sitio no usa ninguna de estas APIs; nadie embebido puede pedirlas.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  // Dos años, sin `includeSubDomains` ni `preload`: todavía no hay dominio de
  // producción. Cuando lo haya, el valor pasa a:
  //   max-age=63072000; includeSubDomains; preload
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
];

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: [
    "http://localhost:3000",
    "192.168.50.34",
    "192.168.110.79",
  ],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
