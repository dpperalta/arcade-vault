# SPEC 04 — Integración base de Supabase

> **Status:** Aprobado
> **Depends on:** SPEC 03
> **Date:** 2026-07-01
> **Objective:** Integrar Supabase en la app de Next.js 16 creando los clientes de navegador y servidor con `@supabase/ssr`, las variables de entorno y una verificación temporal de conexión, sin implementar ninguna funcionalidad de producto.

---

## Scope

**In:**

- Añadir dependencias **`@supabase/supabase-js`** y **`@supabase/ssr`** a `package.json`.
- Crear **`utils/supabase/client.ts`**: cliente de **navegador** vía `createBrowserClient`, para usar desde componentes cliente (`"use client"`).
- Crear **`utils/supabase/server.ts`**: cliente de **servidor** vía `createServerClient`, cableado a `cookies()` de Next.js 16, para usar desde Server Components, Server Actions y Route Handlers.
- Añadir a **`.env.local`** (no versionado) las variables `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (publishable key), con los valores del proyecto de Supabase ya existente.
- Documentar ambas variables en **`.env.example`** (versionado), sin valores.
- **Verificación temporal de conexión**: un check en servidor que instancia el cliente y hace una llamada trivial (`auth.getUser()`) para confirmar que las credenciales conectan; se elimina al cerrar el spec (no queda código de prueba en el repo).

**Out of scope (for future specs):**

- **Autenticación** (registro/login/OAuth, sustituir el `login()` falso, modo invitado). Va en su propio spec.
- **`middleware.ts`** de refresco de sesión: se añadirá con el spec de auth, cuando haya sesión que refrescar.
- Mover **puntuaciones** (`av_scores` / `seededScores`) a la base de datos; el Salón sigue con datos mock.
- Mover el **catálogo de juegos** (`app/data/games.ts`) a una tabla; sigue hardcodeado.
- Crear **tablas, migraciones, RLS o políticas** en Supabase.
- Generar los **tipos TypeScript** del esquema (no hay tablas todavía).
- Cualquier cambio en componentes, rutas o features existentes (Home, biblioteca, salón, acerca, auth).

---

## Data model

Esta feature **no introduce estructuras de datos persistentes** ni tablas, ni claves de `localStorage`. No toca `GAMES`, `scores`, `SavedScore` ni `ArcadeProvider`.

Solo aparecen **variables de entorno** (patrón heredado de SPEC 03) y el contrato de los dos helpers:

```bash
# .env.local (NO versionado) — valores del proyecto Supabase existente
NEXT_PUBLIC_SUPABASE_URL=          # URL del proyecto (pública)
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=     # publishable/anon key (pública, segura para el cliente)
```

Contrato de los helpers:

```ts
// utils/supabase/client.ts — para componentes cliente
export function createClient(): SupabaseClient; // createBrowserClient(url, anonKey)

// utils/supabase/server.ts — para Server Components / Actions / Route Handlers
export async function createClient(): Promise<SupabaseClient>; // createServerClient + cookies()
```

Convenciones:

- Ambas variables llevan prefijo `NEXT_PUBLIC_` porque la anon/publishable key está diseñada para ser pública; la seguridad real vendrá de RLS en el spec que cree tablas.
- El cliente de servidor es `async` porque `cookies()` en Next.js 16 se resuelve de forma asíncrona.
- Se exporta `createClient` en ambos archivos (mismo nombre, distinta ubicación), siguiendo la convención oficial de `@supabase/ssr`.

---

## Implementation plan

1. **Instalar dependencias.** `npm install @supabase/supabase-js @supabase/ssr`. Test manual: aparecen en `package.json`; `npm run dev` arranca sin error.

2. **Variables de entorno.** Añadir a `.env.local` (no versionado) `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` con los valores del proyecto (obtenidos vía MCP: `get_project_url` y `get_publishable_keys`). Añadir ambas claves, sin valores, a `.env.example` versionado con un comentario. Confirmar que `.env*.local` está en `.gitignore`. Test manual: `npm run dev` arranca; las variables se leen.

3. **Cliente de navegador.** Crear `utils/supabase/client.ts` que exporte `createClient()` usando `createBrowserClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)`. Test manual: importable desde un componente cliente; `npm run lint` pasa.

4. **Cliente de servidor.** Antes de escribir, leer la guía SSR de Supabase y el patrón de `cookies()` en `node_modules/next/dist/docs/`. Crear `utils/supabase/server.ts` con `createClient()` `async` usando `createServerClient` cableado a `cookies()` (getAll/setAll con try/catch para el caso Server Component de solo lectura). Test manual: importable desde un Server Component; `npm run lint` pasa.

5. **Verificación temporal de conexión.** Añadir un check temporal en servidor (p. ej. una ruta o un log en un Server Component) que llame a `supabase.auth.getUser()` y confirme respuesta sin error de red/credenciales ("conexión OK"). Ejecutar y comprobar. Test manual: la llamada responde sin error de conexión.

6. **Limpieza y cierre.** Eliminar el check temporal del paso 5 (no queda código de prueba en el repo). Ejecutar `npm run build` y `npm run lint`. Test manual: build y lint sin errores; los dos helpers quedan en `utils/supabase/` listos para el siguiente spec.

---

## Acceptance criteria

- [ ] `npm run build` y `npm run lint` terminan sin errores.
- [ ] `@supabase/supabase-js` y `@supabase/ssr` aparecen en `package.json`.
- [ ] Existe `utils/supabase/client.ts` que exporta `createClient()` y devuelve un cliente de navegador sin lanzar error al importarse desde un componente cliente.
- [ ] Existe `utils/supabase/server.ts` que exporta `createClient()` `async`, cableado a `cookies()`, sin lanzar error al importarse desde un Server Component.
- [ ] `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` están definidas en `.env.local` y documentadas (sin valores) en `.env.example`.
- [ ] `.env.local` no está versionado; `.env.example` sí.
- [ ] La verificación temporal de conexión (`auth.getUser()`) respondió sin error de credenciales/red durante la implementación.
- [ ] No queda en el repo ningún archivo ni código de prueba temporal de la verificación.
- [ ] No se han creado tablas, migraciones ni políticas en Supabase; el esquema `public` sigue vacío.
- [ ] No se ha modificado ningún componente, ruta ni dato existente (Home, biblioteca, salón, acerca, auth, `ArcadeProvider`, `games.ts`, `scores.ts`).

---

## Decisions

- **Sí:** Integración base **sin implementar features** (solo clientes + env + verificación). Cada funcionalidad (auth, puntuaciones, catálogo) irá en su propio spec. **No:** meter auth o persistencia "de paso"; abriría alcance y riesgo.
- **Sí:** `@supabase/ssr` con clientes separados de navegador y servidor. Es el patrón oficial para App Router y evita fugas de cookies/estado entre requests. **No:** usar solo `createClient` de `@supabase/supabase-js` global; no maneja sesión SSR correctamente.
- **Sí:** Helpers en **`utils/supabase/`**, convención oficial de Supabase. **No:** `lib/supabase/`; funcionaría, pero se alejaría de la documentación que seguiremos en los specs de auth.
- **Sí:** `middleware.ts` **fuera** de este spec. Sin autenticación no hay sesión que refrescar; añadirlo ahora sería código muerto. Se incorpora con el spec de auth.
- **Sí:** Variables con prefijo `NEXT_PUBLIC_` (URL + publishable key). Son públicas por diseño; la seguridad vendrá de RLS cuando existan tablas. **No:** usar service_role key en el cliente; nunca debe salir del servidor.
- **Corrección durante la implementación:** el spec proponía `NEXT_PUBLIC_SUPABASE_ANON_KEY`, pero el `.env.local` ya usaba `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` con la publishable key moderna (`sb_publishable_...`), que es el enfoque recomendado hoy por Supabase. Se adoptó ese nombre y valor en todo el spec y los clientes.
- **Sí:** Verificación de conexión **temporal** con `auth.getUser()` y luego se elimina. Confirma credenciales sin dejar rastro ni depender de tablas. **No:** dejar una página/endpoint de health check permanente; no aporta al producto.
- **Sí:** Reutilizar el patrón `.env.local` + `.env.example` de SPEC 03 (fuente única de convención de secretos). **No:** hardcodear credenciales.
- **Sí:** No generar tipos TypeScript aún. **No:** `generate_typescript_types` sobre un esquema vacío; se hará cuando haya tablas.

---

## Risks

| Riesgo                                                                                                                      | Mitigación                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Filtrar la `service_role` key en el cliente por confundirla con la anon key.                                                | Este spec solo usa `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (publishable); la service_role no se introduce en ningún archivo.                                       |
| El cliente de servidor rompe el build de Next 16 por el manejo asíncrono de `cookies()` (API distinta a versiones previas). | El paso 4 obliga a leer la guía SSR de Supabase y los docs de `cookies()` en `node_modules/next/dist/docs/` antes de escribir; `getAll/setAll` van con try/catch. |
| Subir `.env.local` con las credenciales al repo por descuido.                                                               | Confirmar que `.gitignore` cubre `.env*.local`; solo `.env.example` (sin valores) va al repo.                                                                     |
| El código de verificación temporal se queda en el repo y contamina el siguiente spec.                                       | El paso 6 exige eliminarlo; un criterio de aceptación verifica que no queda rastro.                                                                               |
| Instanciar el cliente de navegador en un Server Component (o viceversa) al usarlos en el siguiente spec.                    | Nombres de archivo explícitos (`client.ts` vs `server.ts`) y contrato documentado en el data model; se refuerza en el spec de auth.                               |

---

## What is **not** in this spec

- Autenticación (registro, login, OAuth, modo invitado, sustituir el `login()` falso).
- `middleware.ts` de refresco de sesión.
- Mover puntuaciones o el catálogo de juegos a la base de datos.
- Crear tablas, migraciones, RLS o políticas en Supabase.
- Generar los tipos TypeScript del esquema.

Cada uno de esos, si se aborda, va en su propio spec.
