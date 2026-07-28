import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/utils/supabase/server";

/**
 * Vuelta de OAuth (Google y GitHub). Supabase redirige aquí con `?code=…`, que
 * se canjea por la sesión; las cookies quedan escritas en la respuesta.
 *
 * Si el usuario cancela en la pantalla del proveedor, la vuelta trae `error`
 * en lugar de `code`. Se distingue de un fallo real para no acusar de error a
 * quien simplemente se ha echado atrás.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error");

  if (oauthError) {
    // access_denied = el usuario pulsó "cancelar". No es un fallo del sistema.
    const motivo = oauthError === "access_denied" ? "cancelado" : "oauth";
    return NextResponse.redirect(`${origin}/auth?error=${motivo}`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/biblioteca`);
  }

  return NextResponse.redirect(`${origin}/auth?error=oauth`);
}
