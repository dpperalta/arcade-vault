# SPEC 13 — Autenticación real con Supabase: registro, login, OAuth y perfiles de jugador

- **Estado:** Aprobado
- **Fecha:** 2026-07-27
- **Depende de:** SPEC 04 (clientes Supabase en `utils/supabase/`), SPEC 06 (catálogo y leaderboard, `insertScore`), SPEC 01 (clases `.auth-card`, `.field`, `.btn` en `globals.css`).
- **Objetivo (una frase):** Sustituir el `login()` falso de `ArcadeProvider` por autenticación real de Supabase —email+contraseña, Google y GitHub, con confirmación de correo y recuperación de contraseña—, respaldada por una tabla `profiles` que da a cada cuenta un nombre de jugador único, sin bloquear ninguna ruta y sin tocar los seis juegos.

---

## Por qué existe este spec

La autenticación actual es una simulación. En `app/auth/page.tsx`, las dos pestañas (entrar y registrarse) ejecutan el mismo `submit`, que ignora por completo los campos de email y contraseña:

```tsx
login({ name: (user || "PLAYER1").toUpperCase().slice(0, 10) });
router.push("/biblioteca");
```

`app/components/ArcadeProvider.tsx` guarda ese `{ name }` en `localStorage` bajo la clave `av_user`. No hay contraseña, no hay servidor, no hay sesión. Los botones `◆ GOOGLE` y `▣ GITHUB` son `type="button"` sin `onClick`: decorativos.

Las specs anteriores dejaron esta deuda anotada por escrito, en tres sitios:

- `specs/04-integracion-supabase.md:23` — _"**Autenticación** (registro/login/OAuth, sustituir el `login()` falso, modo invitado). Va en su propio spec."_
- `specs/04-integracion-supabase.md:99` — _"`middleware.ts` **fuera** de este spec. Sin autenticación no hay sesión que refrescar; añadirlo ahora sería código muerto."_
- `specs/06-catalogo-y-leaderboard-supabase.md:30` — _"`user_id` se inserta siempre `null`. Enlazar scores a usuarios reales va en el spec de auth."_

Este es ese spec. Es el más grande del repo, y por eso el plan va en orden estricto **base de datos → sesión → UI**: cada paso deja el sitio funcionando, y si se detiene a mitad lo peor que ocurre es que falte una pantalla, nunca que el juego deje de guardar puntuaciones.

**Dos hallazgos de la fase de investigación cambian lo que parecía obvio:**

1. **En Next.js 16 el middleware se llama `proxy.ts`.** El archivo `middleware.ts` ya no es una convención reconocida. Lo confirma `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md:15`: _"Starting with Next.js 16, Middleware is now called Proxy to better reflect its purpose. The functionality remains the same."_ Toda la documentación oficial de Supabase habla de `middleware.ts`; **hay que traducirla**. Este es exactamente el caso que advierte `AGENTS.md`.
2. **Las tablas ya tienen RLS activo**, con tres políticas. La que importa es `scores_insert_public`, cuyo `with_check` valida el rango del score, la longitud del nombre y que el juego exista — pero **no dice nada de `user_id`**. Hoy da igual porque siempre se inserta `null`; en cuanto empiece a llevar valor, cualquiera podría atribuirse la puntuación de otro. Endurecerla es parte de este spec.

---

## Alcance

### Dentro de este spec

**Base de datos**

- Tabla nueva `public.profiles`, una fila por cuenta, con `player_name` **único**, de 1 a 10 caracteres.
- Función y trigger `handle_new_user()` sobre `auth.users`, que crea el perfil automáticamente y resuelve las colisiones de nombre.
- Políticas RLS de `profiles` (lectura pública, escritura solo del dueño).
- Endurecimiento de la política `scores_insert_public` para que `user_id` solo pueda ser `null` o el propio `auth.uid()`.
- Regeneración de `utils/supabase/database.types.ts` y tipado de los clientes con `<Database>`.

**Sesión**

- `utils/supabase/proxy.ts` con la función `updateSession`, y `proxy.ts` en la raíz del proyecto con su `matcher`. **Nunca redirige ni bloquea: solo refresca cookies.**
- Reescritura de `app/components/ArcadeProvider.tsx` sobre `onAuthStateChange`, con estado `loading` y el modo invitado en `localStorage` bajo la clave nueva `av_guest`.

**Interfaz**

- `app/auth/page.tsx` cableada de verdad: `signUp` y `signInWithPassword` con mensajes de error en español.
- Estado "revisa tu correo" tras el registro, y ruta `app/auth/confirmar/route.ts` que canjea el token del enlace.
- Botones de Google y GitHub cableados a `signInWithOAuth`, con ruta `app/auth/callback/route.ts`.
- Enlace "¿olvidaste tu contraseña?" y ruta `app/auth/recuperar/page.tsx` para fijar la contraseña nueva.
- Formulario de cambio de `player_name` dentro de `/auth` cuando ya hay sesión.
- Menú desplegable en `app/components/Nav.tsx` con el correo y "Cerrar sesión".

**Puntuaciones**

- `insertScore()` en `app/data/catalog.ts` pasa el `user_id` de la sesión, o `null` si es invitado.

### Fuera de este spec (NO se hace aquí)

- **No** se bloquea ninguna ruta. El sitio entero sigue siendo público y **se puede jugar sin cuenta**. El proxy solo refresca la sesión.
- **No** se crea una página `/cuenta`. El cambio de nombre vive dentro de `/auth`.
- **No** se arregla el bloque "TU MEJOR MARCA" de `app/salon/page.tsx`, que hoy inventa el puesto con `tab.length % 4` y trae la fecha `11/05/2026` hardcodeada. Sigue igual de falso al terminar este spec. Va en su propio spec.
- **No** se tocan los seis juegos (`asteroids`, `tetris`, `arkanoid`, `snake`, `frogger` y el placeholder `jugar/[id]`). Siguen leyendo `user?.name` sin un solo cambio.
- **No** se implementa magic link. Descartado.
- **No** hay roles, permisos ni administración.
- **No** hay borrado de cuenta ni exportación de datos.
- **No** se toca el catálogo `GAMES` ni las portadas.
- **No** se migran las 20 filas existentes de `scores`: se quedan con `user_id` null, como puntuaciones de invitado.

---

## Modelo de datos

### 1. Tabla `profiles`

```sql
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  player_name text not null unique
    check (char_length(player_name) between 1 and 10),
  created_at timestamptz not null default now()
);
```

Convenciones:

- La PK **es** el `id` de `auth.users`. No hay columna `user_id` aparte, y no hay perfil huérfano posible.
- `on delete cascade`: borrar la cuenta borra el perfil. Las puntuaciones **no** se borran; su `user_id` queda a `null` (ver punto 4).
- `player_name` se guarda **siempre en mayúsculas**. La normalización la hace el trigger al crear y la función de cambio de nombre al actualizar, no la UI.
- El `check` de 1 a 10 caracteres es el mismo que ya tiene `scores.player_name`, para que un nombre válido en un sitio lo sea en el otro.

### 2. Trigger de creación de perfil

```sql
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  base text;
  candidate text;
  suffix int := 0;
begin
  base := upper(regexp_replace(
    coalesce(new.raw_user_meta_data ->> 'player_name',
             split_part(new.email, '@', 1),
             'PLAYER'),
    '[^A-Za-z0-9]', '', 'g'));
  if base = '' then base := 'PLAYER'; end if;
  base := left(base, 10);
  candidate := base;

  while exists (select 1 from public.profiles p where p.player_name = candidate) loop
    suffix := suffix + 1;
    candidate := left(base, 10 - length(suffix::text)) || suffix::text;
  end loop;

  insert into public.profiles (id, player_name) values (new.id, candidate);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

Convenciones:

- **Prioridad del nombre:** primero `raw_user_meta_data.player_name` (lo que el usuario escribió en el formulario de registro y se pasa en `options.data`), luego la parte local del correo, y `PLAYER` como último recurso.
- **Antichoque:** se prueba `DIEGO`, `DIEGO1`, `DIEGO2`… recortando la base para que el resultado nunca pase de 10 caracteres.
- `security definer` es obligatorio: el trigger corre en el contexto de `auth.users`, donde el usuario que se registra todavía no tiene permisos sobre `public.profiles`.
- `set search_path = ''` y nombres cualificados (`public.profiles`) son la práctica recomendada de Supabase contra secuestro de `search_path`.
- Este trigger cubre **los tres métodos por igual**: email, Google y GitHub. Es la razón de haber elegido trigger y no un upsert desde el cliente — en OAuth no hay formulario donde pedir el nombre.

### 3. Políticas RLS de `profiles`

```sql
alter table public.profiles enable row level security;

create policy profiles_select_public on public.profiles
  for select using (true);

create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
```

Convenciones:

- **Lectura pública**, porque el salón de la fama muestra nombres de jugador. La tabla no contiene correos ni nada privado — el correo vive solo en `auth.users`, que no es accesible desde el cliente.
- **Sin política de `insert`**: solo el trigger crea filas, y lo hace como `security definer`. Un cliente no puede fabricar perfiles.
- **Sin política de `delete`**: los perfiles se van por el `on delete cascade`, no a mano.
- El `update` permite cambiar el nombre propio. El `unique` de la columna impide robar el de otro.

### 4. Endurecimiento de `scores`

La política actual, obtenida del proyecto real, no menciona `user_id`:

```sql
-- Actual: with_check = score >= 0
--                  AND char_length(player_name) between 1 and 10
--                  AND exists (select 1 from games g where g.id = scores.game_id)
```

Se reemplaza añadiendo una condición, sin quitar ninguna de las tres existentes:

```sql
and (user_id is null or user_id = auth.uid())
```

Convenciones:

- **`user_id is null` sigue permitido**: es la puntuación de un invitado, y el modo invitado se queda.
- Un usuario autenticado solo puede firmar con su propio id. No puede atribuir una puntuación a otra cuenta.
- Se añade también `on delete set null` a la FK de `scores.user_id` hacia `auth.users`, para que borrar una cuenta no borre su historial del salón de la fama.

### 5. Contrato del contexto de React

`ArcadeProvider` cambia de tres campos a diez. **La forma de `user` no cambia**, y esa es la decisión que mantiene intactos los seis juegos:

```ts
export interface User {
  name: string; // mayúsculas, máx 10 — idéntico a hoy
}

interface ArcadeContextValue {
  user: User | null; // null = sin sesión y sin invitado
  email: string | null; // solo lo lee Nav.tsx
  userId: string | null; // solo lo lee insertScore
  loading: boolean; // true hasta resolver la sesión inicial
  signUp: (
    email: string,
    password: string,
    playerName: string,
  ) => Promise<AuthResult>;
  signInWithPassword: (email: string, password: string) => Promise<AuthResult>;
  signInWithOAuth: (provider: "google" | "github") => Promise<AuthResult>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  updatePlayerName: (name: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  continueAsGuest: () => void;
}

type AuthResult = { ok: true } | { ok: false; error: string };
```

Convenciones:

- **`email` y `userId` son hermanos de `user`, no campos suyos.** Meterlos dentro de `User` habría obligado a revisar los seis juegos y `app/salon/page.tsx`, que hacen destructuring de `user`. Fuera, la superficie de cambio se reduce a `Nav.tsx` y `catalog.ts`.
- **`AuthResult` nunca lanza.** Devuelve el mensaje ya traducido al español, listo para pintar. Es el mismo criterio de `insertScore()`, que devuelve `{ ok: false }` en vez de romper la UI.
- **`loading`** existe porque `getUser()` es asíncrono. Sin él, Nav parpadearía mostrando "Iniciar Sesión" durante un instante a un usuario que sí tiene sesión.
- Desaparece `login(u | null)`. Su doble uso —iniciar sesión y entrar como invitado con el mismo método— era parte del problema. Se parte en `signInWithPassword` y `continueAsGuest`.

### 6. Estado del invitado en localStorage

```ts
const GUEST_KEY = "av_guest"; // valor: el nombre, p. ej. "INVITADO"
// La clave "av_user" queda obsoleta y se elimina al arrancar el provider.
```

Convenciones:

- Clave nueva a propósito. `av_user` guardaba un JSON que ahora significa otra cosa; reutilizarla dejaría a los usuarios actuales con una sesión falsa que el nuevo provider interpretaría mal.
- El provider hace `localStorage.removeItem("av_user")` al montar, una vez, para limpiar.
- **La sesión real gana siempre.** Si hay usuario de Supabase, el invitado guardado se ignora y se borra.

### 7. Tipos generados

Tras aplicar la migración hay que regenerar `utils/supabase/database.types.ts`, que hoy solo conoce `games` y `scores`. Además, `utils/supabase/client.ts` y `server.ts` crean los clientes **sin** el genérico `<Database>`; se les añade, para que el `insert` de `profiles` esté tipado.

---

## Plan de implementación

Orden estricto: base de datos → sesión → interfaz. Cada paso es commiteable por separado y deja el sitio funcionando.

**Paso 1 — Migración de `profiles` y su trigger.**
Aplicar el SQL de los puntos 1 y 2 del modelo de datos como una migración de Supabase.
_Verificación:_ registrar un usuario de prueba desde el dashboard de Supabase crea automáticamente su fila en `profiles`. Registrar un segundo usuario con el mismo prefijo de correo produce un nombre con sufijo, no un error.

**Paso 2 — Políticas RLS.**
Aplicar el punto 3 (políticas de `profiles`) y el punto 4 (endurecer `scores_insert_public` y poner `on delete set null` en la FK de `user_id`).
_Verificación:_ el leaderboard del salón sigue cargando (lectura pública intacta), y guardar una puntuación como invitado sigue funcionando. Un `insert` con un `user_id` ajeno es rechazado.

**Paso 3 — Regenerar tipos y tipar los clientes.**
Regenerar `utils/supabase/database.types.ts` y añadir el genérico `<Database>` a `createBrowserClient` en `client.ts` y a `createServerClient` en `server.ts`.
_Verificación:_ `npm run build` pasa y `database.types.ts` contiene `profiles`.

**Paso 4 — `proxy.ts` de refresco de sesión.**
Crear `utils/supabase/proxy.ts` con `updateSession(request)` y `proxy.ts` en la raíz, exportando la función `proxy` y su `config.matcher`. **Leer antes `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` y la referencia de `app/api-reference/file-conventions/proxy`**: la documentación de Supabase dice `middleware.ts`, que en Next.js 16 no existe. El `matcher` excluye `_next/static`, `_next/image`, el favicon y las imágenes. La función **no redirige nunca**: devuelve siempre la respuesta con las cookies actualizadas.
_Verificación:_ navegar por el sitio sin sesión no cambia nada. Con sesión iniciada, recargar tras varios minutos la mantiene.

**Paso 5 — Reescribir `ArcadeProvider`.**
Sustituir `useSyncExternalStore` sobre `localStorage` por estado de React alimentado por `getUser()` al montar y `onAuthStateChange` después. Al resolverse la sesión, leer `player_name` de `profiles`. Implementar los ocho métodos del contrato, cada uno devolviendo `AuthResult`. Mantener el invitado en `av_guest` y limpiar `av_user`.
_Verificación:_ `Nav.tsx` y los seis juegos compilan sin cambios. El nombre en el HUD de cualquier juego sigue mostrando "INVITADO" sin sesión.

**Paso 6 — Registro y login con contraseña.**
Cablear el `submit` de `app/auth/page.tsx` a `signUp` (pestaña registro, pasando el nombre de jugador en `options.data.player_name`) y a `signInWithPassword` (pestaña entrar). Añadir la zona de mensaje de error y el estado de envío del botón. Traducir al español los errores de Supabase: credenciales inválidas, correo ya registrado, contraseña demasiado corta.
_Verificación:_ una contraseña incorrecta muestra el error en español y **no** navega. Un login correcto lleva a `/biblioteca` y Nav muestra el nombre.

**Paso 7 — Confirmación de correo.**
Añadir el estado "revisa tu correo" que reemplaza el formulario tras un `signUp` correcto, y la ruta `app/auth/confirmar/route.ts` que canjea el `token_hash` del enlace y redirige a `/biblioteca`.
_Verificación:_ registrarse muestra la pantalla de aviso; el enlace del correo deja la sesión iniciada. Un enlace caducado muestra un error legible, no una pantalla en blanco.

**Paso 8 — OAuth de Google y GitHub.**
Dar de alta ambos proveedores en el dashboard de Supabase y registrar las URLs de redirección. Cablear los dos botones existentes a `signInWithOAuth` y crear `app/auth/callback/route.ts` que llame a `exchangeCodeForSession`.
_Verificación:_ entrar con Google desde cero crea la cuenta, crea el perfil por trigger y vuelve al sitio con sesión. Lo mismo con GitHub.

**Paso 9 — Recuperación de contraseña.**
Añadir el enlace "¿olvidaste tu contraseña?" en la pestaña de entrar, cableado a `requestPasswordReset`, y la ruta `app/auth/recuperar/page.tsx` donde se fija la contraseña nueva con `updateUser`.
_Verificación:_ pedir el reset muestra el aviso de correo enviado; el enlace lleva a la pantalla de contraseña nueva y, tras guardarla, se puede entrar con ella.

**Paso 10 — Cambio de nombre de jugador.**
Cuando `/auth` se abre con sesión activa, en lugar del formulario de login muestra el nombre actual y un campo para cambiarlo, cableado a `updatePlayerName`. El error de nombre ya en uso (violación de `unique`) se traduce a un mensaje claro.
_Verificación:_ cambiar el nombre lo actualiza en Nav sin recargar. Intentar poner uno ya existente muestra "Ese nombre ya está en uso".

**Paso 11 — Menú desplegable en Nav.**
Convertir el botón `NOMBRE ▾` de `Nav.tsx:65-73` en un menú real, con el correo, un enlace a `/auth` para cambiar el nombre y el botón de cerrar sesión. Se cierra con clic fuera y con `Escape`. En el panel móvil, el enlace "Cuenta" sigue llevando a `/auth`.
_Verificación:_ un clic en el nombre ya **no** cierra la sesión: abre el menú. Cerrar sesión desde el menú deja el sitio en estado de invitado.

**Paso 12 — `user_id` real en las puntuaciones.**
En `app/data/catalog.ts:134-158`, `insertScore()` acepta `userId: string | null` y lo inserta en lugar del `null` fijo. El `userId` se lo pasa cada página de juego desde `useArcade()`. Actualizar el comentario obsoleto de la función.
_Verificación:_ jugar con sesión y guardar deja una fila en `scores` con el `user_id` correcto. Jugar como invitado la deja con `user_id` null. El leaderboard muestra ambas igual.

---

## Criterios de aceptación

**Base de datos**

- [ ] Existe `public.profiles` con `player_name` único y `check` de 1 a 10 caracteres.
- [ ] Registrarse por email crea la fila en `profiles` sin intervención del cliente.
- [ ] Registrarse con Google crea la fila en `profiles` sin intervención del cliente.
- [ ] Dos cuentas cuyo nombre base coincide obtienen nombres distintos; ninguna falla al registrarse.
- [ ] Ningún `player_name` generado supera los 10 caracteres.
- [ ] Un `insert` en `scores` con un `user_id` distinto del propio es rechazado por RLS.
- [ ] Un `insert` en `scores` con `user_id` null sigue aceptándose sin sesión.
- [ ] Un `update` de `profiles` sobre una fila ajena es rechazado por RLS.
- [ ] `utils/supabase/database.types.ts` contiene `profiles`.

**Sesión**

- [ ] Existe `proxy.ts` en la raíz del proyecto. **No** existe `middleware.ts`.
- [ ] El proxy no devuelve ninguna redirección: todas las rutas siguen siendo accesibles sin sesión.
- [ ] Con sesión iniciada, recargar la página la mantiene.
- [ ] Cerrar sesión en una pestaña se refleja en las demás.
- [ ] No hay error de hidratación en la consola al cargar cualquier ruta.
- [ ] `grep -c "av_user" app/components/ArcadeProvider.tsx` solo aparece en la línea de limpieza, no como fuente de datos.

**Interfaz**

- [ ] Una contraseña incorrecta muestra un mensaje en español y no navega.
- [ ] Registrarse muestra la pantalla "revisa tu correo" y **no** inicia sesión hasta confirmar.
- [ ] El enlace del correo de confirmación deja la sesión iniciada.
- [ ] Los botones de Google y GitHub inician el flujo OAuth y vuelven con sesión.
- [ ] El enlace de contraseña olvidada envía el correo y su enlace permite fijar una nueva.
- [ ] Con sesión activa, `/auth` muestra el cambio de nombre en lugar del formulario de login.
- [ ] Un nombre ya en uso muestra "Ese nombre ya está en uso" y no rompe nada.
- [ ] Un clic en el nombre de Nav abre el menú; **no** cierra la sesión.
- [ ] El menú de Nav muestra el correo de la cuenta y se cierra con `Escape`.

**No regresión**

- [ ] Se puede jugar a los seis juegos sin iniciar sesión.
- [ ] El HUD de cada juego sigue mostrando "INVITADO" sin sesión y el nombre con ella.
- [ ] `git diff` no toca ningún archivo bajo `app/juego/*/jugar/`.
- [ ] `app/salon/page.tsx` no se modifica.
- [ ] El leaderboard sigue cayendo al mock si Supabase no responde.
- [ ] `npm run lint` y `npm run build` pasan sin errores nuevos.

---

## Decisiones

**Sobre los métodos de acceso**

- **Sí:** email+contraseña, Google y GitHub. Los tres a la vez, porque los botones sociales llevan desde la SPEC 01 pintados en la pantalla sin hacer nada; dejarlos otro spec más es peor que cablearlos.
- **No:** magic link. Obliga a salir al correo en cada entrada, y esto es una web de arcade donde se entra a jugar diez minutos.

**Sobre el modo invitado**

- **Sí:** se queda, con clave nueva `av_guest`. Es la puerta de entrada del sitio: cualquiera puede jugar y guardar una puntuación sin registrarse. Quitarlo habría obligado a proteger las rutas de juego, que es justo lo que este spec no hace.
- **No:** reutilizar la clave `av_user`. Su contenido significaba otra cosa; los usuarios actuales quedarían con una sesión falsa que el provider nuevo malinterpretaría.

**Sobre los perfiles**

- **Sí:** tabla `profiles` con trigger. Es la única forma de que OAuth tenga nombre de jugador, porque ahí no hay formulario donde pedirlo.
- **No:** upsert desde el cliente tras iniciar sesión. Si falla la red en ese momento, el usuario queda sin perfil y sin forma evidente de arreglarlo.
- **No:** derivar el nombre de `user_metadata` sin tabla. Habría hecho imposible garantizar unicidad, y el salón de la fama con cinco "DIEGO" distintos es inservible.
- **Sí:** `player_name` único, con sufijo numérico automático al chocar. La alternativa —fallar el registro porque el nombre está pillado— convierte un alta en OAuth de un clic en un callejón sin salida.
- **Sí:** el usuario puede cambiar el nombre después, desde `/auth`. Sin esa salida, quien entre con Google se queda para siempre con `DIEGOP3`.
- **No:** una pantalla obligatoria de "elige tu nombre" tras el primer login. Es mejor UX, pero añade ruta, validación de disponibilidad en vivo y un estado de "perfil incompleto" a un spec que ya es el más grande del repo.

**Sobre la sesión**

- **Sí:** `proxy.ts`, no `middleware.ts`. No es una preferencia: en Next.js 16 `middleware.ts` no es una convención reconocida, según `16-proxy.md:15`. La documentación de Supabase está escrita para Next 13-15 y hay que traducirla.
- **Sí:** el proxy solo refresca cookies y nunca redirige. Todo el sitio es público por diseño; la sesión cambia lo que se ve, no a dónde se puede entrar.
- **No:** redirigir a `/biblioteca` cuando alguien con sesión abre `/auth`. Con el paso 10, `/auth` **es** la pantalla de cuenta: redirigir la haría inalcanzable.
- **No:** una página `/cuenta` separada. Sería una ruta más para un único formulario que cabe en `/auth`.

**Sobre el contexto de React**

- **Sí:** `user` conserva la forma `{ name }`. Es lo que mantiene los seis juegos y el salón sin tocar, y reduce la superficie de regresión de once archivos a dos.
- **Sí:** `email` y `userId` como campos hermanos de `user`, no dentro. Resuelve la tensión entre "no tocar los juegos" y "mostrar el correo en Nav": solo `Nav.tsx` lee `email` y solo `catalog.ts` necesita `userId`.
- **Sí:** `loading` en el contrato. Sin él, Nav parpadea mostrando "Iniciar Sesión" a quien sí tiene sesión, mientras `getUser()` resuelve.
- **Sí:** métodos que devuelven `AuthResult` en vez de lanzar. Es el mismo criterio que `insertScore()`, que ya devuelve `{ ok: false }` para no bloquear la UI.
- **No:** conservar `login(u | null)`. Que el mismo método sirviera para iniciar sesión y para entrar como invitado es parte de por qué la auth falsa pasó desapercibida tanto tiempo.
- **No:** un `AuthProvider` nuevo conviviendo con `ArcadeProvider`. Dos fuentes de verdad sobre quién es el jugador es exactamente el bug que este spec viene a cerrar.

**Sobre las puntuaciones**

- **Sí:** endurecer `scores_insert_public` en el mismo spec que empieza a mandar `user_id`. Hoy la política no valida ese campo; en el momento en que lleve valor sin la condición nueva, cualquiera podría firmar puntuaciones con el id de otro.
- **Sí:** `on delete set null` en `scores.user_id`. Borrar una cuenta no debería borrar la historia del salón de la fama.
- **No:** migrar las 20 puntuaciones existentes. Son de la época sin auth; como puntuaciones de invitado son correctas.
- **No:** arreglar "TU MEJOR MARCA" del salón. Es el sitio más visible donde se nota que la auth era falsa, pero es una consulta nueva, un estado de carga nuevo y un caso vacío nuevo. Va en su propio spec, ahora que por fin habrá un `user_id` real que consultar.

**Sobre el alcance**

- **Sí:** incluir la recuperación de contraseña, pese al tamaño. Un login con contraseña sin forma de recuperarla genera cuentas muertas desde el primer día.
- **Sí:** plan en orden base de datos → sesión → interfaz. Cortar por la mitad deja como mucho una pantalla sin cablear, nunca el sitio roto.

---

## Riesgos

| Riesgo                                                                                                                                                                  | Mitigación                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Se sigue la documentación de Supabase al pie de la letra y se crea `middleware.ts`, que Next.js 16 ignora en silencio. La sesión caduca sin que nadie entienda por qué. | El paso 4 obliga a leer `16-proxy.md` antes de escribir. Hay un criterio de aceptación explícito: existe `proxy.ts` y **no** existe `middleware.ts`.                                                    |
| El trigger entra en bucle o falla, y el registro devuelve un error 500 opaco de Supabase.                                                                               | El bucle antichoque tiene una salida garantizada: cada iteración prueba un sufijo mayor sobre una base recortada. El paso 1 exige verificar el caso de colisión antes de tocar nada de la UI.           |
| El trigger falla por permisos y el usuario queda creado en `auth.users` sin fila en `profiles`.                                                                         | `security definer` con `search_path = ''`. Si aun así ocurriera, el provider trata la falta de perfil como "sin nombre" y ofrece el formulario de cambio de nombre, en vez de romper.                   |
| La política endurecida de `scores` rompe el guardado del invitado, que es el flujo más usado del sitio.                                                                 | La condición añadida es `user_id is null or user_id = auth.uid()`: el caso invitado está contemplado primero. El paso 2 verifica ese flujo antes de seguir.                                             |
| El `matcher` del proxy captura rutas estáticas y añade latencia a todas las peticiones de imágenes.                                                                     | El `matcher` excluye `_next/static`, `_next/image`, favicon e imágenes, siguiendo el ejemplo de la documentación.                                                                                       |
| Cambiar `useSyncExternalStore` por estado asíncrono introduce un error de hidratación, justo el problema que ese hook resolvía.                                         | El estado inicial es `loading: true` con `user: null`, idéntico en servidor y cliente. Hay un criterio de aceptación sobre ausencia de errores de hidratación.                                          |
| Las URLs de redirección de OAuth funcionan en local y fallan en producción, o al revés.                                                                                 | El paso 8 exige registrar **ambas** en el dashboard. Los `redirectTo` se construyen desde `window.location.origin`, nunca hardcodeados.                                                                 |
| El correo de confirmación no llega y el registro parece roto sin explicación.                                                                                           | La pantalla "revisa tu correo" nombra la dirección exacta a la que se envió y avisa de revisar spam.                                                                                                    |
| Regenerar `database.types.ts` cambia tipos existentes y rompe el build de `catalog.ts`.                                                                                 | El paso 3 es un commit propio, cuya única verificación es que `npm run build` pasa. Si rompe, rompe aislado.                                                                                            |
| El spec es grande y se implementa a medias, dejando el sitio en un estado incoherente.                                                                                  | El orden base de datos → sesión → interfaz garantiza que parar entre pasos deja como mucho una pantalla sin cablear. Si hace falta partirlo, el corte natural es llevar los pasos 9 y 10 a una SPEC 14. |

---

## Lo que **no** entra en este spec

- Bloquear rutas o exigir sesión para jugar. El proxy solo refresca cookies.
- Una página `/cuenta` separada.
- Arreglar el bloque "TU MEJOR MARCA" de `app/salon/page.tsx`, que seguirá inventando el puesto y la fecha.
- Tocar los seis juegos o el catálogo `GAMES`.
- Magic link, roles, permisos o administración.
- Borrado de cuenta, exportación de datos o cambio de correo.
- Migrar las puntuaciones existentes para atribuirlas a cuentas.
- Avatares, biografías o cualquier campo de perfil más allá del nombre de jugador.

Cada uno de ellos, si llega, va en su propio spec.
