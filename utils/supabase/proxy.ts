import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "./database.types";

/**
 * Refresca la sesión de Supabase en cada request y propaga las cookies nuevas.
 *
 * Se invoca desde `proxy.ts` en la raíz del proyecto. Ojo con el nombre: la
 * documentación de Supabase habla de `middleware.ts`, pero en Next.js 16 esa
 * convención ya no existe y se llama `proxy` (ver
 * `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`).
 *
 * **Nunca redirige.** Arcade Vault es público entero: se puede jugar sin cuenta.
 * La sesión cambia lo que se ve, no a dónde se puede entrar.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // No metas código entre `createServerClient` y `getUser()`. Es la llamada que
  // dispara el refresco del token; cualquier cosa en medio puede provocar que
  // la sesión se cierre sola de forma aleatoria y muy difícil de depurar.
  await supabase.auth.getUser();

  // Hay que devolver este mismo objeto, sin reconstruirlo, para no perder las
  // cookies que Supabase acaba de escribir.
  return supabaseResponse;
}
