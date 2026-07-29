# SPEC 14 — Endurecimiento de seguridad: headers, política de contraseñas y warnings de Supabase

> **Estado:** Aprobado
> **Depende de:** SPEC 04 (clientes Supabase), SPEC 06 (tablas `games`/`scores` y sus políticas RLS), SPEC 13 (autenticación real, tabla `profiles`, `proxy.ts`).
> **Fecha:** 2026-07-29
> **Objetivo:** Cerrar los cinco puntos del checklist de seguridad y dejar el linter de Supabase en cero warnings, añadiendo headers de seguridad a Next.js, subiendo el mínimo de contraseña a 8 caracteres en los tres sitios donde hoy dice 6, limitando los registros a 10 por hora por IP y revocando el `EXECUTE` público de `rls_auto_enable()`.

---

## Por qué existe este spec

El punto de partida es `references/secutirty/security-checklist.md`, con cinco puntos y el panel de advertencias de Supabase. La investigación previa cambió lo que el checklist da por pendiente, en tres puntos:

1. **RLS ya está activo.** `games`, `scores` y también `profiles` tienen `rowsecurity = true`, con cinco políticas entre las tres. Además existe un event trigger `ensure_rls` que activa RLS automáticamente en cada tabla nueva del esquema `public`. Ese punto del checklist es una **auditoría**, no una implementación.
2. **Los dos primeros warnings de Supabase son falsos positivos.** Ambos señalan `public.rls_auto_enable()` como una función `SECURITY DEFINER` invocable por `anon` y `authenticated` vía `/rest/v1/rpc/`. La función **devuelve `event_trigger`**, un tipo que PostgREST no sabe exponer: no es llamable por REST tenga el `EXECUTE` que tenga. Se arregla igualmente, porque el arreglo es una línea y un panel con warnings crónicos es un panel que se deja de mirar.
3. **El mínimo de contraseña está desincronizado en tres sitios.** `app/auth/recuperar/page.tsx` valida 6 en sus dos campos, `app/auth/page.tsx` **no valida nada** —el campo de contraseña no tiene `minLength`— y `app/components/ArcadeProvider.tsx:77` traduce el error diciendo 6. Tres fuentes de verdad para un solo número.

---

## Alcance

### Dentro de este spec

**Next.js**

- `next.config.ts` gana un bloque `headers()` que aplica cinco cabeceras a todas las rutas (`/(.*)`): `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` y `Strict-Transport-Security`.

**Política de contraseñas**

- Mínimo de 8 caracteres en la config de Supabase Auth (dashboard).
- Los **tres** sitios del código que hoy asumen 6 se alinean a 8:
  - `app/auth/page.tsx` — el campo de contraseña, que hoy **no tiene `minLength`**, pasa a tenerlo con valor 8.
  - `app/auth/recuperar/page.tsx:102` y `:114` — `minLength={6}` → `minLength={8}`.
  - `app/components/ArcadeProvider.tsx:77` — el texto de `weak_password` pasa a decir 8.
- Texto de ayuda visible bajo el campo de contraseña en el registro, indicando el mínimo.
- Protección de rutas con Proxy Next.js: Aquí información de proxy: https://nextjs.org/docs/app/getting-started/proxy
  Ejemplo: proxy.ts

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// This function can be marked `async` if using `await` inside
export function proxy(request: NextRequest) {
  return NextResponse.redirect(new URL("/home", request.url));
}

// Alternatively, you can use a default export:
// export default function proxy(request: NextRequest) { ... }

export const config = {
  matcher: "/about/:path*",
};
```

**Supabase Auth (dashboard)**

- Activar _Leaked password protection_ (comprobación contra HaveIBeenPwned).
- Fijar el rate limit de _sign ups and sign ins_ en **10 por hora por IP**.

**Base de datos**

- `revoke execute on function public.rls_auto_enable() from anon, authenticated, public`, aplicado con `apply_migration` del MCP. El event trigger `ensure_rls` sigue funcionando: lo dispara el owner de la base, no el rol que ejecuta el DDL.

**Verificación de RLS**

- Se comprueba y se deja constancia de que `games`, `scores` y `profiles` tienen `rowsecurity = true`, y de que el event trigger `ensure_rls` está activo. **No se implementa nada aquí**: ya lo está desde las SPEC 06 y 13.

### Fuera de este spec (NO se hace aquí)

- **No** hay `Content-Security-Policy`. Es el header que más aporta contra XSS, pero exige nonce por request generado en `proxy.ts` y una lista de orígenes para Supabase; mal puesto deja la web en blanco. Va en su propio spec.
- **No** se arregla que `insertScore()` acepte cualquier puntuación enviada desde el navegador. La política RLS solo valida `score >= 0`, así que hoy se puede insertar un millón desde la consola. Es un problema real y grande; necesita validación en servidor y un spec propio.
- **No** se auditan secretos ni se toca `allowedDevOrigins` de `next.config.ts`, con sus IPs de LAN hardcodeadas.
- **No** se fuerza a los usuarios existentes a cambiar su contraseña. El mínimo de 8 aplica solo a contraseñas nuevas; quien tenga una de 6 sigue entrando con ella.
- **No** se añade MFA, CAPTCHA ni protección anti-bot más allá del rate limit.
- **No** se crea `supabase/migrations/`. Las migraciones siguen aplicándose por MCP, como en SPEC 13.
- **No** se bloquea ninguna ruta. El sitio sigue siendo íntegramente público y jugable sin cuenta.
- **No** se tocan los seis juegos, el catálogo `GAMES`, el salón ni las portadas.
- **No** se rotan las claves de Supabase.

---

## Modelo de datos

Este spec **no introduce ninguna estructura de datos nueva**: no crea tablas, ni columnas, ni claves de `localStorage`, ni campos en el contexto de React. Lo que sí introduce son **valores de configuración concretos**, y esos sí necesitan quedar escritos con exactitud.

Los valores de las cabeceras salen de `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/headers.md`, que confirma que `headers()` es una función `async` devolviendo un array de `{ source, headers: [{ key, value }] }` e incluye una sección de cabeceras de seguridad recomendadas.

### 1. Cabeceras de seguridad

Se definen en `next.config.ts` como una constante `securityHeaders` y se aplican con `source: "/(.*)"`.

| Cabecera                    | Valor                                                          | Qué evita                                                                                  |
| --------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `X-Content-Type-Options`    | `nosniff`                                                      | Que el navegador adivine el tipo de un recurso y ejecute lo que no debe.                   |
| `X-Frame-Options`           | `DENY`                                                         | Clickjacking: nadie puede meter Arcade Vault en un `iframe`.                               |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                              | Filtrar rutas internas y query strings a terceros al salir del sitio.                      |
| `Permissions-Policy`        | `camera=(), microphone=(), geolocation=(), browsing-topics=()` | Que cualquier script embebido pida cámara, micrófono o ubicación. El sitio no usa ninguna. |
| `Strict-Transport-Security` | `max-age=63072000`                                             | Downgrade a HTTP y sslstrip, el día que haya un dominio con HTTPS.                         |

Convenciones y desviaciones respecto a la documentación de Next.js:

- **`X-Frame-Options: DENY`, no `SAMEORIGIN`.** La documentación usa `SAMEORIGIN` como ejemplo; el checklist pide `DENY` y es lo correcto aquí, porque Arcade Vault no se embebe a sí mismo en ningún sitio. La documentación también advierte que esta cabecera está superseded por `frame-ancestors` de CSP — cierto, y por eso `frame-ancestors` entrará cuando entre CSP, en otro spec.
- **HSTS sin `includeSubDomains` ni `preload`.** La documentación propone `max-age=63072000; includeSubDomains; preload`. Aquí se deja solo el `max-age` de dos años, porque **todavía no hay dominio de producción**: `preload` es una lista pública de la que salir cuesta meses, e `includeSubDomains` afectaría a subdominios que aún no existen. La línea a añadir cuando haya dominio queda anotada en el propio archivo como comentario.
- **`browsing-topics=()`** viene tal cual del ejemplo oficial. Desactiva la API de Topics de Chrome. El sitio no la usa.
- **`source: "/(.*)"`**, exactamente como el snippet del checklist. Aplica a todo: páginas, rutas de `app/auth/*/route.ts` y archivos de `/public`. La documentación aclara que las cabeceras se comprueban **antes** del sistema de archivos, así que `/public` también queda cubierto.
- Las cabeceras se emiten **también en `npm run dev`**. HSTS sobre `http://localhost` lo ignora el navegador, que es el comportamiento correcto y por eso no molesta en local.

### 2. Migración SQL

Una sola sentencia, aplicada con `apply_migration` bajo el nombre `revoke_public_execute_rls_auto_enable`:

```sql
revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
```

Convenciones:

- El ACL actual de la función es `=X/postgres | postgres=X/postgres | anon=X/postgres | authenticated=X/postgres | service_role=X/postgres`. El `=X/postgres` del principio es el `EXECUTE` a `PUBLIC`, de donde heredan `anon` y `authenticated`; por eso hay que revocar los tres, no solo los dos roles.
- **No se revoca a `service_role` ni a `postgres`.** El owner necesita conservarlo.
- El event trigger `ensure_rls` **sigue funcionando**. Un event trigger lo ejecuta el motor con los privilegios del owner de la función; el `EXECUTE` del rol que lanzó el `CREATE TABLE` no interviene. Esto hay que verificarlo explícitamente, porque es la única forma de que este cambio rompa algo.

### 3. Valores de configuración de Supabase Auth

Los tres viven en el dashboard y **no** son versionables desde el repo. Quedan aquí como la fuente de verdad de qué valor debe tener cada campo:

| Ajuste                              | Ubicación en el dashboard                    | Valor                |
| ----------------------------------- | -------------------------------------------- | -------------------- |
| Minimum password length             | Authentication → Sign In / Providers → Email | `8`                  |
| Leaked password protection          | Authentication → Sign In / Providers → Email | activado             |
| Rate limit de sign ups and sign ins | Authentication → Rate Limits                 | `10` por hora por IP |

### 4. Constante compartida en el cliente

Para que los tres sitios del código no vuelvan a desincronizarse, el mínimo se escribe **una vez**:

```ts
// app/components/ArcadeProvider.tsx
export const MIN_PASSWORD_LENGTH = 8;
```

`app/auth/page.tsx` y `app/auth/recuperar/page.tsx` la importan para el `minLength` y para el texto de ayuda. El mensaje de `weak_password` la interpola en lugar de llevar el número escrito a mano.

Convención: esta constante es **solo para la UI**. Quien manda de verdad es Supabase, que rechaza la contraseña corta con o sin validación de navegador. Su papel es que el error se vea antes de la ida y vuelta al servidor.

---

## Plan de implementación

Seis pasos. Cada uno es commiteable por separado y deja el sitio funcionando. El orden no es arbitrario: la UI sube a 8 **antes** que el servidor, porque el estado intermedio "el cliente pide 8 y el servidor acepta 6" es inocuo, mientras que el inverso —el servidor exige 8 y el formulario dice 6— produce un rechazo que el usuario no ve venir.

**Paso 1 — Auditoría de RLS, sin cambios.**
Ejecutar las dos consultas de comprobación y pegar el resultado en el commit: `rowsecurity` de `games`, `scores` y `profiles`, y la lista de políticas de `pg_policies`. Confirmar también que el event trigger `ensure_rls` está en estado `O` (habilitado).
_Verificación:_ las tres tablas devuelven `rls_enabled = true` y existen las cinco políticas actuales. **Si alguna diera `false`, este spec se detiene aquí** y el paso 1 pasa a ser un `alter table ... enable row level security` antes de seguir. No se espera que ocurra.
_Sin cambios en archivos._

**Paso 2 — Cabeceras de seguridad en `next.config.ts`.**
Añadir la constante `securityHeaders` con las cinco cabeceras de la tabla del modelo de datos y la función `async headers()` que las aplica a `/(.*)`. Dejar el comentario sobre `includeSubDomains` y `preload` para cuando haya dominio. No tocar `allowedDevOrigins`.
_Verificación:_ `npm run dev` y `curl -I http://localhost:3000` muestran las cinco cabeceras. `curl -I http://localhost:3000/biblioteca` y `curl -I` sobre un archivo de `/public` también. Navegar por el sitio, entrar a un juego y guardar una puntuación sigue funcionando; la consola no muestra ningún recurso bloqueado.

**Paso 3 — Revocar el `EXECUTE` público de `rls_auto_enable()`.**
Aplicar la migración `revoke_public_execute_rls_auto_enable` con el MCP de Supabase.
_Verificación, en tres partes:_

1. El ACL de la función ya no contiene `=X/postgres`, ni `anon=X`, ni `authenticated=X`.
2. **El event trigger sigue vivo:** crear una tabla de prueba (`create table public.tmp_rls_check (id int)`), comprobar que `rowsecurity` salió `true` sola, y borrarla. Este es el único modo real de que este paso rompa algo.
3. `get_advisors` de tipo `security` ya no lista `anon_security_definer_function_executable` ni `authenticated_security_definer_function_executable`.

**Paso 4 — Mínimo de 8 caracteres en la interfaz.**
Exportar `MIN_PASSWORD_LENGTH = 8` desde `app/components/ArcadeProvider.tsx` e interpolarla en el mensaje `weak_password`. Importarla en `app/auth/page.tsx` para añadir `minLength` al campo de contraseña —que hoy no tiene ninguno— y un texto de ayuda bajo el campo cuando la pestaña es la de registro. Importarla en `app/auth/recuperar/page.tsx` para sustituir los dos `minLength={6}` de las líneas 102 y 114.
_Verificación:_ `grep -rn "minLength={6}\|al menos 6" app/` no devuelve nada. En el formulario de registro, enviar una contraseña de 7 caracteres lo bloquea el propio navegador sin llegar a la red. `npm run lint` y `npm run build` pasan.

**Paso 5 — Los tres ajustes del dashboard de Supabase.**
Aplicar a mano los valores de la tabla del modelo de datos: mínimo `8`, leaked password protection activado y rate limit de sign ups/sign ins en `10` por hora por IP. **Este paso lo ejecuta una persona en el dashboard**: no es accesible ni por SQL ni por el MCP.
_Verificación:_ registrar una cuenta con contraseña `1234567` es rechazada por el servidor (no solo por el navegador: probar desactivando la validación del cliente desde devtools). Registrar una con `password` —que está en HaveIBeenPwned— devuelve el error de contraseña comprometida. `get_advisors` ya no lista `auth_leaked_password_protection`.
_Sin cambios en archivos._

** Paso 6 - Prección de rutas con Proxy Next.js**

**Paso 7 — Cierre y actualización del checklist.**
Volver a ejecutar `get_advisors` de tipo `security` y confirmar cero lints. Marcar las cinco casillas de `references/secutirty/security-checklist.md` y anotar bajo cada una qué se hizo, o que ya estaba hecho en el caso de RLS.
_Verificación:_ `get_advisors` devuelve una lista vacía. El checklist no tiene ninguna casilla sin marcar.

---

## Resultado de la implementación

Tres desviaciones respecto a lo planificado. Ninguna es opcional: dos las impone
el plan de Supabase y la tercera es un paso que se escribió sin contenido.

**1. Leaked password protection — no se aplica.** La comprobación contra
HaveIBeenPwned no está disponible en el plan actual del proyecto, así que el
toggle no se puede activar. Consecuencias sobre los criterios de aceptación:

- "Registrarse con la contraseña `password` es rechazado por estar comprometida"
  → **no se cumple**, y no puede cumplirse sin cambiar de plan.
- "`get_advisors` de tipo `security` devuelve una lista vacía de lints" → **no se
  cumple**: queda permanentemente `auth_leaked_password_protection`. El objetivo
  de "cero warnings" del encabezado de este spec es inalcanzable hoy; se alcanzó
  el resto (de 3 lints a 1).

**2. Rate limit en 2/hora, no en 10.** El plan tampoco deja configurar el rate
limit de sign ups / sign ins, que está fijo en 2 por hora por IP. El criterio
"el campo del dashboard muestra `10` por hora" **no se cumple**. El valor real es
más restrictivo que el pedido, así que la intención anti-bot queda cubierta; lo
que sube es el riesgo que ya anticipaban los riesgos de este spec —usuarios
legítimos tras la misma IP— y con 2/hora es fácil de provocar.

**3. Paso 6 saltado.** Se escribió como un título sin cuerpo ("Protección de
rutas con Proxy Next.js"), sin verificación ni criterios de aceptación asociados,
y lo que sugiere contradice el alcance de este mismo spec: "No se bloquea ninguna
ruta. El sitio sigue siendo íntegramente público y jugable sin cuenta". Además
`proxy.ts` **ya existe** desde SPEC 13, con un `matcher` que cubre todo el sitio
y la decisión explícita de no redirigir nunca: solo refresca la sesión de
Supabase. No se tocó nada. Si se quiere proteger alguna ruta, es un spec propio.

**Desviación menor, dentro de lo previsto.** En `app/auth/page.tsx` el
`minLength` se aplica **solo** cuando la pestaña es la de registro. El plan lo
enunciaba sin condición, pero un `minLength` incondicional bloquearía en el
navegador el login de las cuentas con contraseña de 6, que es justo lo que
prohíbe el criterio de no regresión "iniciar sesión con una cuenta existente cuya
contraseña tiene menos de 8 caracteres sigue funcionando". La forma condicional
es la única que satisface los dos criterios a la vez.

**Nota de proceso.** Durante la verificación del paso 5 el dashboard tenía
activado además "Password Requirements" (exigir mayúsculas, números y símbolos),
que este spec descarta expresamente. Se detectó porque el servidor rechazaba
`contrasenya` con un motivo que la interfaz no explicaba, y se desactivó. El
único motivo posible de `weak_password` vuelve a ser la longitud, que es lo que
dice su traducción en `ArcadeProvider`.

---

## Criterios de aceptación

**Cabeceras**

- [ ] `curl -I http://localhost:3000` devuelve `X-Content-Type-Options: nosniff`.
- [ ] `curl -I http://localhost:3000` devuelve `X-Frame-Options: DENY`.
- [ ] `curl -I http://localhost:3000` devuelve `Referrer-Policy: strict-origin-when-cross-origin`.
- [ ] `curl -I http://localhost:3000` devuelve `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()`.
- [ ] `curl -I http://localhost:3000` devuelve `Strict-Transport-Security: max-age=63072000`, **sin** `includeSubDomains` ni `preload`.
- [ ] Las cinco cabeceras aparecen igual en `/biblioteca`, `/salon`, `/auth` y en un archivo servido desde `/public`.
- [ ] `next.config.ts` conserva `allowedDevOrigins` sin cambios.

**Base de datos**

- [ ] El ACL de `public.rls_auto_enable()` no contiene `=X/postgres`, `anon=X/postgres` ni `authenticated=X/postgres`.
- [ ] El ACL de `public.rls_auto_enable()` sigue conteniendo `postgres=X/postgres` y `service_role=X/postgres`.
- [ ] Crear una tabla nueva en `public` la deja con `rowsecurity = true` sin intervención manual; la tabla de prueba se borra al terminar.
- [ ] El event trigger `ensure_rls` sigue en estado habilitado (`evtenabled = 'O'`).
- [ ] `games`, `scores` y `profiles` siguen con `rowsecurity = true`.
- [ ] Las cinco políticas RLS existentes siguen presentes y sin modificar.

**Contraseñas**

- [ ] `grep -rn "minLength={6}" app/` no devuelve ninguna línea.
- [ ] `grep -rn "al menos 6 caracteres" app/` no devuelve ninguna línea.
- [ ] `MIN_PASSWORD_LENGTH` está declarada una sola vez en el repo y las dos pantallas de contraseña la importan.
- [ ] El campo de contraseña de `app/auth/page.tsx` tiene `minLength` (hoy no tiene ninguno).
- [ ] En el registro, una contraseña de 7 caracteres es bloqueada por el navegador sin llegar a la red.
- [ ] En `/auth/recuperar`, una contraseña de 7 caracteres es bloqueada igual en los dos campos.
- [ ] Saltándose la validación del cliente, el servidor rechaza una contraseña de 7 caracteres.
- [ ] Registrarse con la contraseña `password` es rechazado por estar comprometida.

**Rate limit**

- [ ] El campo de sign ups / sign ins del dashboard muestra `10` por hora.

**Cierre**

- [ ] `get_advisors` de tipo `security` devuelve una lista vacía de lints.
- [ ] Las cinco casillas de `references/secutirty/security-checklist.md` están marcadas.

**No regresión**

- [ ] Se puede jugar a los seis juegos y guardar una puntuación como invitado.
- [ ] Iniciar sesión con una cuenta existente cuya contraseña tiene menos de 8 caracteres sigue funcionando.
- [ ] El login con Google y con GitHub sigue completando el flujo y volviendo con sesión.
- [ ] El leaderboard del salón sigue cargando.
- [ ] `git diff` no toca ningún archivo bajo `app/juego/*/jugar/`.
- [ ] `npm run lint` y `npm run build` pasan sin errores nuevos.

---

## Decisiones

**Sobre las cabeceras**

- **Sí:** las tres del checklist más `Permissions-Policy` y `Strict-Transport-Security`. Ninguna de las cinco bloquea recursos, así que el coste de añadir las dos extra es cero y el riesgo de romper la web también.
- **Sí:** `X-Frame-Options: DENY` en lugar del `SAMEORIGIN` que propone la documentación de Next.js. Arcade Vault no se embebe a sí mismo en ningún sitio, así que `SAMEORIGIN` solo sería permisividad sin beneficio.
- **Sí:** HSTS con `max-age` de dos años pero **sin** `includeSubDomains` ni `preload`, pese a que el ejemplo oficial los lleva. `preload` es una lista pública de la que salir tarda meses, e `includeSubDomains` compromete subdominios que aún no existen. Todavía no hay dominio de producción: comprometerse ahora es firmar por un futuro que no está decidido.
- **No:** `Content-Security-Policy`. Es la cabecera que de verdad mitiga XSS y la única que hace redundante a `X-Frame-Options`, pero exige generar un nonce por request en `proxy.ts`, enumerar los orígenes de Supabase y convivir con los scripts inline de Next.js. Mal configurada deja el sitio en blanco. Es un spec entero, no una línea más en una tabla.
- **No:** `X-DNS-Prefetch-Control`. La documentación lo menciona, pero es una cabecera de rendimiento, no de seguridad.

**Sobre la política de contraseñas**

- **Sí:** una constante `MIN_PASSWORD_LENGTH` exportada desde `ArcadeProvider`. El número está hoy en tres sitios distintos y por eso se desincronizó: `recuperar/page.tsx` valida 6, `page.tsx` no valida nada y el mensaje de error dice 6. Un solo origen impide que vuelva a pasar.
- **Sí:** validar también en el cliente, no solo en el servidor. Supabase rechaza igual, pero la ida y vuelta para enterarse de que faltaba un carácter es una fricción evitable en el momento más frágil del embudo.
- **No:** forzar a los usuarios existentes a cambiar la contraseña. Supabase no ofrece caducidad de contraseñas, así que habría que invalidar sesiones y mandar un correo de reset a todos. Eso es una decisión de producto con coste de usuarios perdidos, no un punto de un checklist técnico.
- **No:** traducir al español el error de contraseña comprometida. Cae en el mensaje genérico que ya existe. Es un caso poco frecuente y añadirlo obliga a averiguar el código exacto que devuelve Supabase, que solo se ve una vez la protección está activa — es decir, después del paso 5. Se anota como mejora posterior.
- **No:** exigir mayúsculas, números o símbolos. Ocho caracteres más la comprobación contra HaveIBeenPwned protege más que un requisito de composición, que en la práctica produce `Password1!` en todas partes.

**Sobre `rls_auto_enable()`**

- **Sí:** revocar el `EXECUTE`, aunque los dos warnings sean técnicamente **falsos positivos**. La función devuelve `event_trigger`, un tipo que PostgREST no sabe exponer: nadie puede llamarla por `/rest/v1/rpc/` por mucho `EXECUTE` que tenga. Se revoca igualmente porque el arreglo es una línea, no rompe nada y deja el panel de advertencias limpio — un panel con warnings crónicos es un panel que se deja de mirar.
- **Sí:** revocar también a `public`, no solo a `anon` y `authenticated`. El `=X/postgres` del ACL es el permiso a `PUBLIC`, y de ahí heredan los otros dos: revocar solo los roles nominales no cambiaría nada.
- **No:** cambiar la función a `SECURITY INVOKER`, que es la otra remediación que sugiere el linter. Rompería el trigger: necesita privilegios de owner para hacer `alter table ... enable row level security` sobre tablas ajenas.
- **No:** borrar la función y el event trigger. Es una red de seguridad valiosa: garantiza que cualquier tabla futura nazca con RLS activo, que es precisamente el primer punto del checklist.
- **Sí:** verificar el trigger creando y borrando una tabla temporal en la base real. Es la única comprobación que distingue "razoné que no se rompe" de "comprobé que no se rompió".

**Sobre el alcance**

- **Sí:** el punto de RLS del checklist se cierra como auditoría documentada, no como implementación. Ya estaba hecho desde las SPEC 06 y 13; fingir que se implementa sería falsear el registro.
- **Sí:** los ajustes del dashboard entran en el spec pese a no ser código, con pasos manuales y verificación objetiva. Tres de los cinco puntos del checklist viven ahí; dejarlos fuera vaciaría el spec.
- **No:** un script contra la Management API para versionar esos ajustes. Obliga a custodiar un token de permisos amplios y a mantener un archivo más, para tres campos que se tocan una vez.
- **No:** crear `supabase/migrations/`. Las trece specs anteriores aplican migraciones por MCP; inaugurar una convención distinta aquí dejaría la carpeta desincronizada desde el primer día con todo lo ya aplicado.
- **No:** el anti-trampa de puntuaciones. Es el agujero más grave que tiene el proyecto —`insertScore()` envía el score desde el navegador y la política RLS solo valida `score >= 0`, así que cualquiera inserta un millón desde la consola—, pero arreglarlo es rediseñar cómo se guardan las puntuaciones. Candidato natural a SPEC 15.
- **No:** auditar secretos ni tocar las IPs de LAN de `allowedDevOrigins`. Fuera del checklist.
- **No:** MFA ni CAPTCHA. El rate limit cubre el caso de bots que motivaba ese punto del checklist.

**Sobre el orden**

- **Sí:** la interfaz sube a 8 antes que el servidor. El estado intermedio "el cliente pide 8 y el servidor acepta 6" no perjudica a nadie; el inverso produce rechazos que el usuario no ve venir.

---

## Riesgos

| Riesgo                                                                                                                                                                                                       | Mitigación                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| El revoke rompe el event trigger `ensure_rls` y, sin que nadie se entere, las tablas futuras nacen sin RLS. Sería irónico: el arreglo de un warning desactivaría la garantía del primer punto del checklist. | El paso 3 no se da por bueno leyendo el ACL: crea una tabla real, comprueba que `rowsecurity` salió `true` sola y la borra. Hay un criterio de aceptación específico para ello.                              |
| Se revoca solo a `anon` y `authenticated`, el ACL conserva el `=X/postgres` de `PUBLIC` y el warning sigue apareciendo tras el trabajo.                                                                      | El SQL revoca los tres en la misma sentencia. El criterio de aceptación nombra los tres literales que **no** deben aparecer en el ACL.                                                                       |
| `X-Frame-Options: DENY` interfiere con el flujo OAuth de Google o GitHub y el login social deja de funcionar sin error visible.                                                                              | Es improbable —OAuth navega en la pestaña principal, no en un iframe— pero es exactamente el tipo de suposición que conviene comprobar. Hay un criterio de no regresión que exige completar ambos flujos.    |
| HSTS se emite con `includeSubDomains` o `preload` por copiar el ejemplo de la documentación de Next.js, y el día que haya dominio queda un compromiso público difícil de revertir.                           | El valor exacto está fijado en la tabla del modelo de datos y hay un criterio de aceptación que exige la **ausencia** de ambas directivas. El archivo lleva el comentario de qué añadir cuando haya dominio. |
| Subir el mínimo a 8 impide entrar a las cuentas existentes con contraseña más corta.                                                                                                                         | El mínimo se aplica al fijar contraseña, no al verificarla. Hay un criterio de no regresión que lo comprueba con una cuenta real antes de dar el paso por cerrado.                                           |
| El rate limit de 10 por hora por IP bloquea a usuarios legítimos que comparten NAT: un aula, una oficina, un evento.                                                                                         | 10 por hora deja margen para varias personas tras la misma IP. Si aparece el problema, el ajuste es un campo del dashboard, reversible en segundos y sin desplegar nada.                                     |
| La protección de contraseñas filtradas devuelve un código de error que `ArcadeProvider` no traduce, y el usuario ve un mensaje genérico que no explica por qué no puede registrarse.                         | Asumido a propósito (ver decisiones). El mensaje genérico ya existe y no rompe la pantalla. La traducción se añadirá cuando se conozca el código exacto, que solo es observable con la protección ya activa. |
| El paso 5 depende de una persona entrando al dashboard, y se da por hecho sin hacerlo. El spec quedaría "implementado" con tres de los cinco puntos sin tocar.                                               | Los tres ajustes tienen criterios de aceptación verificables desde fuera del dashboard: dos pruebas de registro y `get_advisors` sin lints.                                                                  |

---

## Lo que **no** entra en este spec

- `Content-Security-Policy` y su `frame-ancestors`.
- El anti-trampa de puntuaciones: `insertScore()` seguirá aceptando cualquier score enviado desde el navegador.
- Forzar el cambio de contraseña a las cuentas existentes.
- Traducir al español el error de contraseña comprometida.
- MFA, CAPTCHA o cualquier otra defensa anti-bot más allá del rate limit.
- Requisitos de composición de contraseña (mayúsculas, números, símbolos).
- Auditoría de secretos y limpieza de las IPs de LAN en `allowedDevOrigins`.
- Crear `supabase/migrations/` o versionar los ajustes del dashboard.
- Bloquear rutas o exigir sesión: el sitio sigue siendo íntegramente público.
- Rotar las claves de Supabase.
- Tocar los seis juegos, el catálogo `GAMES`, el salón o las portadas.

Cada uno de ellos, si llega, va en su propio spec.
