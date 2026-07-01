# SPEC 03 — Página "Acerca de" y formulario de contacto con Resend

> **Status:** Aprobado
> **Depends on:** SPEC 01, SPEC 02
> **Date:** 2026-07-01
> **Objective:** Portar `about.jsx` de `references/templates/home-about/` a Next.js 16 como ruta `/acerca` (visualmente idéntica) y conectar su formulario de contacto al envío real de correo mediante Resend a través de una Server Action.

---

## Scope

**In:**

- Nueva ruta **`app/acerca/page.tsx`** (Server Component) que porta `about.jsx` visualmente idéntico: hero "ACERCA DE ARCADE VAULT" (kicker, título, misión, `highlight-row` con 3 tarjetas + `HighlightIcon` HEART/BROWSER/PLANT), el `about-divider` con los 24 píxeles animados, y la sección de contacto (`contact-grid`: intro con `contact-tips` + formulario).
- Nuevo componente cliente **`app/components/ContactForm.tsx`** con el formulario (campos NOMBRE, CORREO ELECTRÓNICO, MENSAJE), la validación de campos vacíos con animación `shake`, y los estados: inicial, enviando, éxito (terminal `terminal-success`) y **error dedicado** (terminal con líneas `[ERROR]` + botón reintentar sin perder lo escrito).
- Nueva **Server Action** `app/acerca/actions.ts` (`"use server"`) que valida en servidor, instancia Resend con `RESEND_API_KEY`, envía el correo (`from: onboarding@resend.dev`, `to: CONTACT_TO_EMAIL`, `reply_to:` el email del visitante, asunto y cuerpo con nombre/email/mensaje) y devuelve `{ ok: true }` o `{ ok: false, error }`.
- Añadir dependencia **`resend`** a `package.json`.
- Añadir **`.env.local`** (no versionado) con `RESEND_API_KEY` y `CONTACT_TO_EMAIL`, y **`.env.example`** versionado documentando ambas claves sin valores secretos.
- Actualizar **`app/components/Nav.tsx`**: enlace **"Acerca de"** → `/acerca` en la barra y en el panel móvil, con estado activo (`isAbout = pathname === "/acerca"`).
- Portar a **`app/globals.css`** las reglas `.about-*`, `.contact-*`, `.highlight*`, `.hl-*`, `.tip*`, `.about-divider`/`.div-*`, `.terminal-success`/`.term-*`/`.line`/`.prompt`/`.caret`, animación `shake` y sus media queries desde `references/templates/home-about/styles.css` (más el estilo del nuevo estado de error).
- **Verificación anti-regresión de z-index** con capturas reales: todo el contenido de `/acerca` visible sobre `av-bg`/`av-noise`.

**Out of scope (for future specs):**

- Dominio propio verificado en Resend (seguimos con el remitente de pruebas `onboarding@resend.dev`, que solo entrega al dueño de la cuenta).
- Rate limiting / protección anti-spam del formulario (captcha, honeypot, throttling).
- Persistir los mensajes enviados (base de datos, historial).
- Autoresponder al visitante o plantillas HTML enriquecidas del correo (se envía texto/HTML simple).
- Internacionalización de la ruta (`/about`) o metadata SEO por ruta más allá del título global.
- Cualquier cambio en Home, biblioteca, salón o auth.

---

## Data model

Esta feature **no introduce estructuras de datos persistentes** ni claves de `localStorage`. No toca `GAMES`, `scores` ni `ArcadeProvider`.

Solo aparecen tipos locales para el contrato de la Server Action y variables de entorno:

```ts
// Entrada del formulario (app/components/ContactForm.tsx → Server Action)
type ContactInput = { name: string; email: string; msg: string };

// Resultado que devuelve la Server Action al cliente
type ContactResult =
  | { ok: true }
  | { ok: false; error: string }; // 'error' es un mensaje genérico, sin filtrar detalles internos
```

Variables de entorno (leídas solo en servidor):

```bash
RESEND_API_KEY=          # secreta, la provee el usuario (apikey.txt) — va en .env.local, NO se versiona
CONTACT_TO_EMAIL=diego.peralta.suing@gmail.com   # destino de los mensajes
```

Constante fija en la Server Action (no es env var): `from = "onboarding@resend.dev"`.

Conventions:

- La validación es doble: cliente (campos no vacíos + `shake`) y servidor (no vacíos + formato de email); el servidor es la fuente de verdad.
- El correo del visitante va en `reply_to` y también en el cuerpo del mensaje.

---

## Implementation plan

1. **Dependencia y variables de entorno.** Instalar `resend` (`npm install resend`). Crear `.env.local` (no versionado) con `RESEND_API_KEY` (valor de `apikey.txt`) y `CONTACT_TO_EMAIL=diego.peralta.suing@gmail.com`. Crear `.env.example` versionado con ambas claves vacías y un comentario. Confirmar que `.env.local` está en `.gitignore`. Test manual: `npm run dev` arranca sin error.

2. **Portar el CSS del About.** Añadir a `app/globals.css` las reglas que faltan (`.about`, `.about-hero`, `.about-title`, `.about-mission`, `.highlight-row`/`.highlight`/`.hl-icon`/`.hl-text`, `.about-divider`/`.div-bar`/`.div-pixels`, `.about-contact`/`.contact-grid`/`.contact-intro`/`.contact-title`/`.contact-sub`/`.contact-tips`/`.tip`/`.tip-led`, `.contact-form`/`.field`, `.terminal-success`/`.term-bar`/`.dot`/`.term-title`/`.term-body`/`.line`/`.prompt`/`.caret`, animación `shake`) desde `references/templates/home-about/styles.css`, más una variante de estado de error (`.line.error`/`[ERROR]`). Verificar `z-index`/`position` sobre `av-bg`/`av-noise`. Test manual: `npm run lint` pasa; sin selectores duplicados conflictivos.

3. **Server Action de envío.** Crear `app/acerca/actions.ts` (`"use server"`) con `sendContact(input: ContactInput): Promise<ContactResult>`: valida en servidor (campos no vacíos + formato de email), instancia `new Resend(process.env.RESEND_API_KEY)`, envía (`from: onboarding@resend.dev`, `to: process.env.CONTACT_TO_EMAIL`, `reply_to: input.email`, asunto `Nuevo mensaje de {name}`, cuerpo con nombre/email/mensaje), y devuelve `{ ok: true }` o `{ ok: false, error }` capturando excepciones. Test manual: importable, `npm run lint` pasa.

4. **Formulario cliente.** Crear `app/components/ContactForm.tsx` (`"use client"`) portando el form de `about.jsx`: estado `form`, `shake`, y un estado de fase (`idle` | `sending` | `sent` | `error`). En submit: validación vacíos → `shake`; si ok, `sending` y llamar `sendContact`; según resultado → `sent` (terminal éxito con el nombre) o `error` (terminal `[ERROR]` + botón "REINTENTAR" que vuelve a `idle` conservando lo escrito). El botón de éxito "ENVIAR OTRO MENSAJE" limpia el form. Test manual: compila; validación vacíos dispara `shake`.

5. **Página `/acerca`.** Crear `app/acerca/page.tsx` (Server Component) portando el resto de `about.jsx` idéntico: `about-hero` (kicker, título, misión, `highlight-row` con `HighlightIcon` HEART/BROWSER/PLANT), `about-divider` con 24 píxeles, y `about-contact` (`contact-grid`: `contact-intro` con `contact-tips` + `<ContactForm />`). Montar `<Reveal />` para las clases `.reveal`. Test manual: `/acerca` renderiza todo el contenido igual al template.

6. **Enlace en el Nav.** En `app/components/Nav.tsx` añadir `isAbout = pathname === "/acerca"` y el enlace **"Acerca de"** → `/acerca` en la barra (tras "Salón de la Fama") y en el panel móvil, con su estado activo. Test manual: en `/acerca` se resalta "Acerca de"; navega bien en desktop y móvil.

7. **Envío real de correo.** Con `RESEND_API_KEY` válida, enviar un mensaje de prueba desde `/acerca` y confirmar que llega a `diego.peralta.suing@gmail.com` con `reply-to` = el email escrito. Forzar un fallo (key inválida temporal) y confirmar que aparece el estado de error con reintentar. Test manual: correo recibido; estado de error visible al fallar.

8. **Verificación anti-regresión z-index + cierre.** Capturas reales (Playwright → `.playwright-screenshots`) de `/acerca` (hero, highlights, divider, contacto y ambos estados terminal), confirmando que nada queda tras `av-bg`/`av-noise`. Ejecutar `npm run build` y `npm run lint`. Test manual: build y lint sin errores; capturas muestran todo visible e idéntico al template.

---

## Acceptance criteria

- [ ] `npm run build` y `npm run lint` terminan sin errores.
- [ ] No hay errores en la consola del navegador al cargar `/acerca`.
- [ ] La ruta `/acerca` muestra, idéntica al template: hero (kicker "▸ ACERCA DE", título, misión), `highlight-row` con las 3 tarjetas e iconos HEART/BROWSER/PLANT, el `about-divider` con los 24 píxeles animados, y la sección de contacto (intro con los 3 `tip` + formulario).
- [ ] El formulario valida campos vacíos en cliente: al enviar con algún campo vacío se dispara la animación `shake` y NO se llama a la Server Action.
- [ ] Con los tres campos rellenos, el envío exitoso muestra la terminal `terminal-success` con el nombre en mayúsculas; "ENVIAR OTRO MENSAJE" limpia el formulario.
- [ ] El correo llega a `diego.peralta.suing@gmail.com`, con `from` = `onboarding@resend.dev`, `reply-to` = el email escrito por el visitante, y cuerpo con nombre/email/mensaje.
- [ ] Si Resend falla (p. ej. API key inválida), se muestra el estado de error dedicado (terminal con `[ERROR]`) con botón "REINTENTAR" que vuelve al formulario conservando lo escrito.
- [ ] `RESEND_API_KEY` no aparece en el bundle del cliente ni en el HTML; solo se usa en la Server Action.
- [ ] `.env.local` no está versionado; `.env.example` sí, con `RESEND_API_KEY` y `CONTACT_TO_EMAIL` documentadas y sin valores secretos.
- [ ] El Nav (barra y panel móvil) muestra "Acerca de"; se resalta como activo en `/acerca`.
- [ ] **Anti-regresión z-index:** en capturas reales de `/acerca`, todo el contenido (incluidas las secciones `.reveal` y los estados terminal) se ve por encima de `av-bg`/`av-noise`; ningún bloque queda invisible.

---

## Decisions

- **Sí:** Ruta en español `/acerca`, coherente con `/biblioteca` y `/salon`. **No:** `/about`, rompería la convención de rutas en español ya establecida.
- **Sí:** Envío mediante **Server Action** (`"use server"`). La API key vive solo en servidor y no se expone endpoint público. **No:** Route Handler `app/api/contact`; añade una URL pública que no necesitamos para un form propio.
- **Sí:** El About es **Server Component** y el formulario un **componente cliente aparte** (`ContactForm.tsx`). Solo el form necesita estado/interacción; así el resto de la página no arrastra `"use client"`.
- **Sí:** Remitente de pruebas `onboarding@resend.dev`. Deja el envío funcionando sin verificar dominio. **No:** Dominio propio verificado ahora; requiere DNS y queda para otro spec.
- **Sí:** Destino en env var `CONTACT_TO_EMAIL` (`diego.peralta.suing@gmail.com`) en vez de hardcodearlo. Con el remitente de pruebas debe ser el dueño de la cuenta Resend.
- **Sí:** `reply_to` = email del visitante, para responder directo desde la bandeja. **No:** dejar el email solo en el cuerpo.
- **Sí:** Estado de error dedicado con reintentar, en el mismo estilo terminal. **No:** reusar solo el `shake` para fallos de red; no distingue "campo vacío" de "el envío falló".
- **Sí:** Doble validación (cliente para UX, servidor como fuente de verdad). El mensaje de error al cliente es genérico, sin filtrar detalles internos de Resend.
- **Sí:** Secretos en `.env.local` (no versionado) + `.env.example` versionado como documentación. **No:** hardcodear la key ni subir `apikey.txt` al repo.
- **Sí:** Portar el CSS del About a `app/globals.css` (fuente única de estilos, heredado de SPEC 01/02). **No:** un CSS Module aparte.
- **Sí:** Verificación anti-regresión de z-index con **capturas reales**, no solo DOM. Ya ocurrió antes que contenido quedara oculto tras las capas de fondo.

---

## Risks

| Riesgo | Mitigación |
| ------ | ---------- |
| `onboarding@resend.dev` solo entrega al dueño de la cuenta Resend; si `CONTACT_TO_EMAIL` no coincide, el envío se rechaza silenciosamente. | Documentar en `.env.example` la restricción; el paso 7 verifica con un envío real que el correo llega a `diego.peralta.suing@gmail.com`. |
| La `RESEND_API_KEY` se filtra al cliente si se importa la Server Action o `resend` desde código cliente. | La key solo se lee en `app/acerca/actions.ts` (`"use server"`); el criterio de aceptación verifica que no aparece en bundle/HTML. |
| Subir `apikey.txt` o `.env.local` al repo por descuido. | Confirmar `.gitignore` cubre `.env*.local`; no versionar `apikey.txt`. Solo `.env.example` (sin valores) va al repo. |
| Contenido de `/acerca` desaparece tras `av-bg`/`av-noise` por `z-index`/`position` mal portados (bug ya visto en SPEC 02). | El CSS fija `position`/`z-index` sobre el fondo; el paso 8 verifica con capturas reales. |
| Olvidar `"use client"` en `ContactForm.tsx` o `"use server"` en `actions.ts` rompe el build de Next 16. | El plan marca explícitamente qué archivo lleva cada directiva; el paso 8 lo confirma con `npm run build`. |
| La Server Action lanza excepción no capturada (red/Resend caído) y el form queda colgado en `sending`. | `sendContact` envuelve todo en try/catch y siempre devuelve `{ ok:false }`; el estado `error` con reintentar cubre el caso. |

---

## What is **not** in this spec

- Dominio propio verificado en Resend (seguimos con `onboarding@resend.dev`).
- Rate limiting / anti-spam (captcha, honeypot, throttling).
- Persistir mensajes o historial en base de datos.
- Autoresponder al visitante y plantillas HTML enriquecidas.
- Ruta `/about` en inglés y metadata SEO por ruta.

Cada uno de esos, si se aborda, va en su propio spec.
