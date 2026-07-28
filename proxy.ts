import type { NextRequest } from "next/server";

import { updateSession } from "@/utils/supabase/proxy";

/**
 * En Next.js 16 la convención `middleware.ts` fue renombrada a `proxy.ts`, y el
 * export debe llamarse `proxy`. El runtime por defecto es Node.js.
 *
 * Aquí solo se refresca la sesión de Supabase: no se bloquea ni se redirige
 * ninguna ruta. Todo Arcade Vault es público, incluidos los juegos.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Todas las rutas salvo:
     * - _next/static (archivos estáticos)
     * - _next/image  (optimización de imágenes)
     * - favicon.ico
     * - archivos de imagen servidos desde /public
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
