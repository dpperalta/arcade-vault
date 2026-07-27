import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/utils/supabase/server";

/**
 * Destino del enlace de confirmación de correo.
 *
 * Acepta las dos formas en que Supabase puede entregar el enlace, porque
 * depende de la plantilla configurada en el dashboard:
 *  - `?token_hash=…&type=signup`  → plantilla con `{{ .TokenHash }}`
 *  - `?code=…`                    → flujo PKCE por defecto
 *
 * En ambos casos, si el canje va bien la sesión queda iniciada en cookies y se
 * entra directo a la biblioteca. Si falla, se vuelve a /auth con un aviso: un
 * enlace caducado no puede terminar en una pantalla en blanco.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) return NextResponse.redirect(`${origin}/biblioteca`);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/biblioteca`);
  }

  return NextResponse.redirect(`${origin}/auth?error=confirmacion`);
}
