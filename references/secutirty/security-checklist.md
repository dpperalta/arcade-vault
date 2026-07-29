## Checklist de seguridad básico

> Cerrado por **SPEC 14** (`specs/14-endurecimiento-seguridad.md`) el 2026-07-29.
> Cada casilla lleva debajo qué se hizo y cómo se comprobó. Dos puntos quedan
> **bloqueados por el plan de Supabase**, no por falta de trabajo: están marcados
> como tales y explicados.

  - [x] RLS: Row Level Security habilitado en ambas tablas: `games` y `scores`
    **Ya estaba hecho** desde las SPEC 06 y 13; aquí solo se auditó. `games`,
    `scores` y también `profiles` dan `relrowsecurity = true`, con cinco políticas
    entre las tres (`games_select_public`, `profiles_select_public`,
    `profiles_update_own`, `scores_insert_public`, `scores_select_public`).
    Además el event trigger `ensure_rls` (estado `O`) activa RLS solo en cada
    tabla nueva del esquema `public`: comprobado creando y borrando una tabla de
    prueba, que nació con `rowsecurity = true` sin intervención manual.

  - [x] Minimum password length — mínimo 8 caracteres
    Fijado en `8` en el dashboard y verificado contra el servidor: `/auth/v1/signup`
    con siete caracteres devuelve `422 weak_password` con
    `reasons: ["length"]`. En el código, el número vive en un solo sitio,
    `MIN_PASSWORD_LENGTH` en `app/components/ArcadeProvider.tsx`, que consumen
    `app/auth/page.tsx` (campo de registro y texto de ayuda) y
    `app/auth/recuperar/page.tsx` (sus dos campos). Antes estaba desperdigado:
    `recuperar` validaba 6, `page.tsx` no validaba nada y el mensaje de error
    decía 6.
    Nota: en `/auth` el `minLength` solo se aplica a la pestaña de **registro**.
    Al iniciar sesión no se valida el largo, para no dejar fuera a las cuentas
    anteriores a este spec, cuya contraseña de 6 sigue siendo válida para entrar.

  - [ ] Leaked password protection — (el warning 4)
    **BLOQUEADO POR EL PLAN.** La comprobación contra HaveIBeenPwned no está
    disponible en el plan actual de Supabase, así que el toggle no se puede
    activar. Consecuencia: el warning `auth_leaked_password_protection` seguirá
    apareciendo en el panel de forma permanente, y hoy se puede registrar una
    contraseña comprometida siempre que tenga 8 caracteres o más.
    Se reabre el día que el proyecto cambie de plan.

  - [~] Max signup rate — limitar signups por IP (anti-bot)
    **Hay límite, pero no es el que pedía el spec.** El plan actual no deja
    configurar el rate limit de sign ups / sign ins, que está fijo en **2 por
    hora por IP**. El spec pedía 10. El valor real es *más* restrictivo, así que
    la intención anti-bot está cubierta de sobra; lo que sube es el riesgo
    contrario, el que ya anticipaba el spec: varios usuarios legítimos tras la
    misma IP (un aula, una oficina) se quedan fuera enseguida. Si aparece el
    problema, la salida es cambiar de plan, no tocar código.

  - [x] Headers de seguridad en Next.js
    Cinco cabeceras en `next.config.ts`, aplicadas a `source: "/(.*)"`. Además de
    las tres del ejemplo de abajo se añadieron `Permissions-Policy` y
    `Strict-Transport-Security`. Comprobadas con `curl -I` en `/`, `/biblioteca`,
    `/salon`, `/auth` y en un archivo de `/public`:

    ```
    X-Content-Type-Options: nosniff
    X-Frame-Options: DENY
    Referrer-Policy: strict-origin-when-cross-origin
    Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()
    Strict-Transport-Security: max-age=63072000
    ```

    HSTS va **sin** `includeSubDomains` ni `preload` a propósito: todavía no hay
    dominio de producción. La línea a usar cuando lo haya queda anotada en el
    propio `next.config.ts`.
    **No** hay `Content-Security-Policy`: es la cabecera que de verdad mitiga XSS,
    pero exige nonce por request y una lista de orígenes de Supabase, y mal puesta
    deja el sitio en blanco. Va en su propio spec.

  Ej:

```ts
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

// En la config de Next.js:
headers: async () => [
  { source: '/(.*)', headers: securityHeaders }
]
```

## Por el ladod e Supabase:

- [x] TODO: vayan al panel de warnings y errores de Supabase

De los tres warnings de la tabla, **dos se cerraron** y **uno queda abierto por el
plan**:

| warning | estado |
| --- | --- |
| `anon_security_definer_function_executable` | **Resuelto.** |
| `authenticated_security_definer_function_executable` | **Resuelto.** |
| `auth_leaked_password_protection` | **Abierto.** No disponible en el plan actual (ver arriba). |

Los dos primeros señalaban `public.rls_auto_enable()` como función
`SECURITY DEFINER` invocable por `anon` y `authenticated` vía `/rest/v1/rpc/`.
Eran **falsos positivos**: la función devuelve `event_trigger`, un tipo que
PostgREST no sabe exponer, así que no era llamable por REST tuviera el `EXECUTE`
que tuviera. Se arreglaron igualmente, porque el arreglo es una línea y un panel
con warnings crónicos es un panel que se deja de mirar:

```sql
-- migración: revoke_public_execute_rls_auto_enable
revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
```

Hay que revocar los tres, no solo los dos roles: el `=X/postgres` del ACL es el
`EXECUTE` a `PUBLIC`, de donde heredaban `anon` y `authenticated`. ACL antes y
después:

```
antes:   {=X/postgres, postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}
después: {postgres=X/postgres, service_role=X/postgres}
```

`postgres` y `service_role` conservan el permiso a propósito: el owner lo
necesita. El event trigger `ensure_rls` **sigue funcionando** tras el revoke —lo
ejecuta el motor con los privilegios del owner de la función, no con los del rol
que lanzó el DDL—, comprobado creando una tabla real y viendo que salió con
`rowsecurity = true` sola.

**No** se cambió la función a `SECURITY INVOKER`, que es la otra remediación que
sugiere el linter: rompería el trigger, que necesita privilegios de owner para
hacer `alter table ... enable row level security` sobre tablas ajenas.

---

## Lo que este checklist NO cubre

Queda fuera a propósito, cada uno candidato a su propio spec:

- **Anti-trampa de puntuaciones.** Es el agujero más grave que tiene el proyecto:
  `insertScore()` manda el score desde el navegador y la política RLS solo valida
  `score >= 0` (más el nombre y que el juego exista), así que cualquiera puede
  insertar un millón desde la consola. Arreglarlo es rediseñar cómo se guardan
  las puntuaciones.
- `Content-Security-Policy` y su `frame-ancestors`.
- Forzar el cambio de contraseña a las cuentas existentes con menos de 8
  caracteres. El mínimo aplica solo al *fijar* contraseña, no al verificarla.
- MFA, CAPTCHA y cualquier otra defensa anti-bot más allá del rate limit.
- Requisitos de composición de contraseña (mayúsculas, números, símbolos):
  descartados a propósito. Ocho caracteres protegen más que un requisito de
  composición, que en la práctica produce `Password1!` en todas partes.
- Auditoría de secretos y limpieza de las IPs de LAN de `allowedDevOrigins`.
- Rotación de las claves de Supabase.
