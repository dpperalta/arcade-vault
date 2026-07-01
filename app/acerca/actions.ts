"use server";

import { Resend } from "resend";

export type ContactInput = { name: string; email: string; msg: string };
export type ContactResult = { ok: true } | { ok: false; error: string };

// Remitente de pruebas de Resend (ver SPEC 03): solo entrega al dueño de la cuenta.
const FROM = "Arcade Vault <onboarding@resend.dev>";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Envía el mensaje de contacto por Resend. El servidor es la fuente de verdad
// de la validación; nunca filtra detalles internos al cliente.
export async function sendContact(input: ContactInput): Promise<ContactResult> {
  const name = input.name?.trim() ?? "";
  const email = input.email?.trim() ?? "";
  const msg = input.msg?.trim() ?? "";

  if (!name || !email || !msg) {
    return { ok: false, error: "Completa nombre, correo y mensaje." };
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "El correo no tiene un formato válido." };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO_EMAIL;
  if (!apiKey || !to) {
    return { ok: false, error: "El servicio de correo no está configurado." };
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: FROM,
      to,
      replyTo: email,
      subject: `Nuevo mensaje de ${name}`,
      text: `Nombre: ${name}\nCorreo: ${email}\n\nMensaje:\n${msg}`,
    });
    if (error) {
      return { ok: false, error: "No se pudo enviar el mensaje. Inténtalo de nuevo." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo enviar el mensaje. Inténtalo de nuevo." };
  }
}
