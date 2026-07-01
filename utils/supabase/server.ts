import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente de Supabase para el servidor (Server Components, Server Actions,
 * Route Handlers). Cableado a las cookies de la request de Next.js 16, cuyo
 * `cookies()` es asíncrono, por lo que este helper es `async`.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Llamado desde un Server Component (cookies de solo lectura).
            // Se puede ignorar si hay middleware que refresca la sesión;
            // ese middleware llegará en el spec de autenticación.
          }
        },
      },
    },
  );
}
