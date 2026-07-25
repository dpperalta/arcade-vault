# SPEC 11 — Apariencia neón "Gamepad MK-II" para el mando táctil

- **Estado:** Aprobado
- **Fecha:** 2026-07-25
- **Depende de:** SPEC 10 (mando táctil `TouchGamepad`, `useCoarsePointer`, layout portrait de `.av-player`). No modifica su comportamiento; solo su aspecto.
- **Objetivo (una frase):** Rediseñar visualmente el `TouchGamepad` de SPEC 10 para que en móvil (`pointer: coarse`) luzca idéntico a la referencia "Gamepad MK-II" (`references/gamepad-assets/`) —chasis neón envolvente, cruceta con flechas SVG y gema LED pulsante, y botones A/B esféricos con glow y anillo—, **sin alterar ninguna funcionalidad, mapeo de controles ni el cableado existente**.

---

## Alcance

### Dentro de este spec

- **Restyle visual del `TouchGamepad`** (`app/components/TouchGamepad.tsx` + estilos en `app/globals.css`) para igualar la referencia `references/gamepad-assets/gamepad.html` / `gamepad-neon.png`:
  - **Chasis envolvente** alrededor del mando: cuerpo con degradado, borde neón, doble borde interior (`::before`), textura punteada (`::after`), sombra glow y bordes redondeados.
  - **Cruceta**: flechas como **SVG de triángulo** (una por dirección, como la referencia) en vez de glyphs de texto; teclas con relieve (sombra inferior + inset), estado `:active`/`.on` con glow cian; **hub central con gema en rombo** (`clip-path`) y animación `pulse-led`.
  - **Botones A/B**: forma **esférica** (radial-gradient con brillo especular), **letra con text-shadow/glow**, **anillo punteado** (`ab-ring`) que aparece en hover/activo, y hundimiento en `:active`/`.on`.
- **Markup puramente visual** dentro de `TouchGamepad.tsx`: SVG de flechas, elemento de gema en el hub, spans de letra y anillo en A/B. No cambia props, tipos, ni la lógica de eventos.
- **Solo móvil**: el nuevo aspecto vive bajo `@media (pointer: coarse)` (o en clases que solo se montan cuando el mando aparece). En desktop nada cambia porque el mando no se monta.
- **Verificación visual** por capturas en viewport de teléfono (Playwright), comparando contra `gamepad-neon.png`.

### Fuera de este spec (NO se hace aquí)

- **No** se toca la funcionalidad de SPEC 10: `GamepadConfig`, `PadButton`, el método `input(code, down)` de los motores, el mapeo por juego, la detección `useCoarsePointer` ni el cableado en las 4 `page.tsx`.
- **No** se cambia el mapeo de colores: se conserva **A = cian, B = magenta** (la referencia usa el inverso; se adapta su estilo a nuestros colores).
- **No** se cambia qué `code` inyecta cada botón, ni el esquema hold/tap, ni `touch-action`/`preventDefault`.
- **No** se modifica el layout portrait de `.av-player` (HUD/canvas/mando) más allá de lo mínimo para acomodar el chasis (márgenes/anchos); no se rediseña el HUD ni el modal de fin.
- **No** aplica a desktop, ni a otras páginas del sitio, ni a catálogo/Supabase.
- **No** se añaden skins ni selector de tema al mando: es un único aspecto neón fijo.

---

## Modelo de datos

**No aplica.** Este spec no introduce ni modifica estructuras de datos. Los tipos de SPEC 10 (`PadDir`, `PadButton`, `GamepadConfig`, `TouchGamepadProps`) se conservan **sin cambios**. Todo lo que se añade son elementos de markup visual y clases CSS (presentación), no datos.

---

## Plan de implementación

Cada paso deja el sistema funcional y verificable.

**Paso 1 — Markup visual de la cruceta (flechas SVG + hub con gema).**
En `TouchGamepad.tsx`, reemplazar los glyphs de texto (`DIR_GLYPH`) por los **SVG de triángulo** de la referencia (un `path` por dirección: up/down/left/right). El `<span className="tg-dpad-hub">` pasa a contener un elemento de gema (`tg-dpad-gem`). No cambian props, `code`, ni la lógica de `PadKey`. _Verificación:_ el mando sigue inyectando el mismo `code` por dirección; las flechas se ven como triángulos y el hub muestra la gema.

**Paso 2 — Markup visual de los botones A/B (letra + anillo).**
En `TouchGamepad.tsx`, cada botón de acción renderiza un `<span className="tg-ab-ring">` y la etiqueta dentro de `<span className="tg-ab-letter">` (conservando `btn.label`, que puede ser "A", "B", "↻", "⤓", …). La lógica hold/tap y los eventos pointer quedan idénticos. _Verificación:_ A/B (y sus labels por juego) siguen disparando lo mismo; ahora muestran letra con contenedor y anillo.

**Paso 3 — Chasis neón envolvente (CSS).**
En `globals.css`, reestilizar `.touch-gamepad` como el `.gp` de la referencia: degradado de cuerpo, borde neón, `::before` (doble borde interior) y `::after` (textura punteada), sombra glow, `border-radius`. Mantener `touch-action: none`, `user-select`, anchos responsivos y que no genere scroll horizontal desde 320px. _Verificación:_ el mando aparece dentro de un chasis, sin desbordes ni scroll horizontal en viewport de teléfono.

**Paso 4 — Estilo de teclas de cruceta + gema pulsante (CSS).**
Reestilizar `.tg-dir` (relieve, `box-shadow` inferior + inset), estados `:active`/`.on` con glow cian y `drop-shadow` en el SVG; estilar `.tg-dpad-hub` y `.tg-dpad-gem` (rombo por `clip-path`, glow) con la animación `@keyframes pulse-led`. _Verificación:_ al pulsar una dirección se ilumina en cian y la gema late suavemente.

**Paso 5 — Estilo de botones A/B esféricos (CSS).**
Reestilizar `.tg-action`/`.tg-a`/`.tg-b` como esferas (radial-gradient + brillo especular), letra con text-shadow/glow (`.tg-ab-letter`), anillo punteado (`.tg-ab-ring`) visible en hover/activo, y hundimiento en `:active`/`.on`. Mantener **A = cian, B = magenta**. Conservar el estilo atenuado/inerte (`.tg-inert`) para direcciones/botones no usados por el juego. _Verificación:_ A (cian) y B (magenta) se ven esféricos con glow; los inertes siguen atenuados y sin reaccionar.

**Paso 6 — Verificación visual final con capturas.**
Con Playwright en viewport de teléfono (portrait), capturar el mando de los 4 juegos (Asteroids, Tetris, Arkanoid, Snake) y comparar contra `gamepad-neon.png`. Confirmar por píxeles el chasis, las flechas SVG, la gema, y A/B. Guardar capturas en `.playwright-screenshots` con prefijo `gamepad-neon-*.png`. _Verificación:_ las 4 capturas muestran el look de la referencia sin regresiones de layout ni de controles.

---

## Criterios de aceptación

- [ ] El `TouchGamepad` en móvil (`pointer: coarse`) reproduce el look de `references/gamepad-assets/gamepad-neon.png`: chasis con degradado, borde neón, doble borde interior, textura punteada y sombra glow.
- [ ] Las direcciones se renderizan como **SVG de triángulo** (up/down/left/right), no como glyphs de texto.
- [ ] El hub central muestra una **gema en rombo** (`clip-path`) con la animación `pulse-led` activa.
- [ ] Al pulsar/mantener una dirección, la tecla se ilumina en cian (glow + `drop-shadow` en el SVG) y vuelve al soltar.
- [ ] Los botones A/B se ven **esféricos** (radial-gradient + brillo especular), con letra glow y **anillo punteado** visible en activo; **A = cian, B = magenta**.
- [ ] Se conserva el mapeo de SPEC 10: cada dirección/botón inyecta el **mismo `code`** que antes en los 4 juegos, con el mismo esquema hold/tap.
- [ ] Las direcciones/botones no usados por un juego siguen **atenuados e inertes** (`.tg-inert`).
- [ ] No hay scroll horizontal ni zoom al usar el mando desde 320px de ancho (`touch-action: none` intacto).
- [ ] En **desktop no cambia nada** (el mando sigue sin montarse; ninguna regresión visual fuera de la ruta de juego).
- [ ] Los tipos y props de `TouchGamepad` (`GamepadConfig`, `PadButton`, `onInput`) quedan **sin cambios**.
- [ ] `npm run lint` y `npm run build` pasan sin errores.
- [ ] Existen capturas `gamepad-neon-*.png` en `.playwright-screenshots` de los 4 juegos que evidencian el nuevo aspecto.

---

## Decisiones tomadas y descartadas

- **Solo apariencia, sin tocar comportamiento (elegido) vs. reescribir el mando.** Se restyla el `TouchGamepad` de SPEC 10 conservando intactos config, mapeo, eventos y cableado, para minimizar riesgo de regresión en la jugabilidad táctil. Se descartó reimplementar el componente.
- **Conservar mapeo de color A = cian / B = magenta (elegido) vs. copiar el de la referencia (A magenta / B cian).** Se adapta el _estilo_ de la referencia a los colores ya establecidos en el repo para mantener coherencia con el resto de la UI. Se descartó invertir los colores.
- **Flechas SVG (elegido) vs. mantener glyphs de texto `▲▼◀▶`.** La referencia usa triángulos SVG que permiten `drop-shadow`/glow nítido; se adoptan aunque impliquen cambio de markup, por fidelidad visual. Se descartaron los glyphs de texto.
- **Chasis envolvente completo (elegido) vs. restyle solo de teclas.** El "cuerpo" de gamepad (degradado, bordes, textura, glow) es lo que define el look; se incluye entero. Se descartó el restyle parcial por quedar a medias respecto a la referencia.
- **Gema LED pulsante incluida (elegido) vs. estática.** La animación `pulse-led` anima solo `opacity`/`transform` sobre un elemento diminuto (compositable por GPU, coste despreciable en móvil), así que se mantiene fiel a la referencia. Se descartó dejarla estática.
- **Aspecto neón único (elegido) vs. skins de mando.** El mando tiene un solo tema fijo; no se añade selector ni variantes, para no ampliar el alcance. Se descartaron los skins de mando.

---

## Riesgos identificados

- **Regresión en el layout portrait de SPEC 10.** El chasis envolvente (padding, borde, `border-radius`) añade tamaño; mal medido puede provocar scroll horizontal o comprimir el canvas en pantallas de 320px. _Mitigación:_ mantener anchos responsivos (`clamp`, `max-width: 100%`), verificar por captura desde 320px y no reducir el alto útil del canvas.
- **`::after` con textura punteada y `pointer-events`.** Los pseudo-elementos decorativos del chasis podrían interceptar toques y "comerse" pulsaciones de teclas. _Mitigación:_ `pointer-events: none` en `::before`/`::after`, igual que la referencia.
- **Área táctil de las flechas SVG.** Al pasar de texto a SVG, si el `<svg>` no cubre toda la tecla, el área efectiva de toque puede encoger. _Mitigación:_ el `<button>` conserva su tamaño (`--tg-key`) como blanco táctil; el SVG es solo relleno visual dentro.
- **`drop-shadow`/glow y animación en móviles de gama baja.** Múltiples `box-shadow`/`filter` simultáneos podrían costar en repaint. _Mitigación:_ limitar glows a estados `:active`/`.on`, y restringir la animación a `opacity`/`transform` (ya validado como despreciable).
- **Etiquetas no-"A/B" (`↻`, `⤓`).** El estilo de letra (glow, tamaño) se pensó para letras; símbolos podrían verse descentrados. _Mitigación:_ estilar `.tg-ab-letter` de forma tolerante al contenido (centrado por flex, tamaño relativo) y verificar Tetris en captura.
