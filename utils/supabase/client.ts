import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente de Supabase para el navegador (componentes cliente, `"use client"`).
 * Usa la publishable key, segura para exponerse en el cliente.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
