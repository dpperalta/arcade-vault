// TEMPORAL (SPEC 04, paso 5) — verificación de conexión. Eliminar en paso 6.
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error && error.name !== "AuthSessionMissingError") {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, user: data.user ?? null });
}
