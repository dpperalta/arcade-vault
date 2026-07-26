---
name: spec-impl-game
description: >
  Igual que /spec-impl (implementa un spec Aprobado paso a paso), pero pensado para
  specs de JUEGO: al terminar la implementación dispara automáticamente y en cadena los
  subagentes skin-designer (skins Neon/Retro/Clásico) y luego mobile-porter (responsividad
  móvil) sobre el juego recién implementado.
disable-model-invocation: true
argument-hint: <NN-spec-name>
allowed-tools: Bash(git status:*), Bash(git branch:*), Bash(git checkout:*), Bash(cat:*), Bash(ls:*)
---

# /spec-impl-game — Implementer of approved game specs (+ skins & mobile)

Este comando es idéntico a `/spec-impl` (implementa un spec cuyo estado significa
"Aprobado", paso a paso, con pausas para revisar el diff) **pero pensado para specs de
juego**: cuando la implementación termina, dispara de forma **automática y secuencial** dos
subagentes del repo sobre el juego recién implementado — primero **`skin-designer`** y,
cuando ese termine, **`mobile-porter`** (ver Fase 5).

## Session context

Current repository state:
!`git status --short`

Current branch:
!`git branch --show-current`

Specs available in this folder:
!`ls specs/ 2>/dev/null || echo "The specs/ folder does not exist"`

Branch-creation config:
!`cat specs/.spec-config.yml 2>/dev/null || echo "AutoCreateBranch: true (default, no config file)"`

---

## Instructions

Follow these five phases in strict order. **Do not advance to the next phase if the previous one did not complete correctly.**

---

### Phase 1 — Identify the spec

The received argument is: `$ARGUMENTS`

If `$ARGUMENTS` is empty:

- List the files available in `specs/` (you already have them above).
- Ask the user to specify the exact name of the spec.
- Stop and wait for an answer. Do not continue.

If `$ARGUMENTS` has a value:

- Look for the file in `specs/`. The user may have written the full name (`01-mvp-arkanoid`), only the number (`01`), or only the slug (`mvp-arkanoid`). Try to find the correct file in any of those cases.
- If you do not find the file, show the available specs and ask the user to correct the name.
- If you do find it, continue to Phase 2.

---

### Phase 2 — Validate the spec's state

Read the spec file you located in Phase 1 using the Read tool or `cat`.

In the file's contents, look for the line that contains the spec's state. The header label is typically `**Status:**` (English) or `**Estado:**` (Spanish), but it may use any language. Match by position (status line near the top of the spec) and by the surrounding state machine, not by the exact label.

**Absolute rule:** You can only continue if the state **means "Approved"** — regardless of the language used.

Treat any of the following (and their equivalents in other languages) as the **Approved** state and continue:

- English: `Approved`
- Spanish: `Aprobado`
- Portuguese: `Aprovado`
- French: `Approuvé`
- German: `Genehmigt`
- Italian: `Approvato`
- …or any other language's word that clearly means "approved"

Anything else (Draft / Borrador, In review / En revisión, Implemented / Implementado, Obsolete / Obsoleto, or any unrecognized value) means **stop** and show the error message below.

| State category                            | Examples (any language)                           | Action                                                                     |
| ----------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------- |
| Approved                                  | `Approved`, `Aprobado`, `Aprovado`, `Approuvé`, … | Continue to Phase 3.                                                       |
| Draft                                     | `Draft`, `Borrador`, …                            | Stop. Show the error message below.                                        |
| In review                                 | `In review`, `En revisión`, …                     | Stop. Show the error message below.                                        |
| Implemented                               | `Implemented`, `Implementado`, …                  | Stop. Show the error message below.                                        |
| Obsolete                                  | `Obsolete`, `Obsoleto`, …                         | Stop. Show the error message below.                                        |
| State line not found / unrecognized value | —                                                 | Stop. The file does not follow the expected format. Tell this to the user. |

If you are unsure whether a value means "approved", **do not assume**. Stop and ask the user to clarify or to update the spec to the canonical wording.

**Standard error message when the state does not mean Approved:**

```
❌ I cannot implement this spec.

Current state: [STATE FOUND]
I only work with specs whose state means "Approved" (e.g. `Approved`, `Aprobado`,
or the equivalent in another language).

To continue you have two options:
  1. If the spec is ready to be implemented, open it and change the state
     to "Approved" (or the equivalent term your team uses) manually.
     That change is made by the human, not the agent.
  2. If the spec still needs work, use /spec [name] to resume it.
```

Do not offer alternatives, do not suggest "I can still start if you want". The block is intentional.

---

### Phase 3 — Create the git branch and switch to it

Once you have confirmed the state means `Approved`:

1. Derive the branch name from the spec file's full name, without the extension. Format: `spec-NN-slug`. Examples:

   - `01-mvp-arkanoid.md` → branch `spec-01-mvp-arkanoid`
   - `02-powerups.md` → branch `spec-02-powerups`

2. Read the `AutoCreateBranch` flag from the **Branch-creation config** shown in the session context above.

   - If the config file does not exist, the value is missing, or the value is unrecognized → treat it as `true` (the default).
   - Only an explicit `false` (in any capitalization) disables automatic branch creation.

   **If `AutoCreateBranch` is `true` (default):** proceed without asking.

   - If the branch **does not exist**: create it with `git checkout -b spec-NN-slug`.
   - If it **already exists**: inform the user that the branch already existed (it may mean previous work is being resumed).
   - In both cases: switch to the branch with `git checkout spec-NN-slug` and confirm the change was successful before continuing.

   **If `AutoCreateBranch` is `false`:** ask before touching git. Show:

   ```
   AutoCreateBranch is set to false.
   Create and switch to the branch spec-NN-slug? [y/N]
   ```

   - If the user answers **yes**: create/switch to the branch exactly as in the `true` case above.
   - If the user answers **no** or leaves it empty: **do not create any branch.** Tell the user you will implement on the current branch (the one shown in the session context above) and ask for explicit confirmation to continue there. Do not improvise — wait for the answer.

3. Visually confirm to the user the spec is ready and which branch is active:

   ```
   ✅ Ready to implement.

   Spec:   specs/NN-slug.md
   Branch: spec-NN-slug  (active)   (← or the current branch, if no new branch was created)
   State:  Approved   (← echo back the actual value found in the spec)
   ```

4. **Do not start implementing yet.** First show the spec summary to the user so they have it fresh. Extract and show:
   - The **objective** (the line after `**Objective:**` / `**Objetivo:**` / equivalent label).
   - The **scope** (the `## Scope` / `## Alcance` / equivalent section).
   - The **implementation plan** (the section with the numbered steps — `## Implementation plan` / `## Plan de implementación` / equivalent).
   - The **acceptance criteria** (the checklist — `## Acceptance criteria` / `## Criterios de aceptación` / equivalent).

Match section headings by meaning, not by exact wording — the spec may be authored in any language.

---

### Phase 4 — Implement step by step

After showing the spec summary, tell the user:

```
I am going to implement the spec following the implementation plan exactly.
I will pause after each step so you can review the diff.

Shall we start with Step 1?
```

Wait for explicit confirmation ("yes", "go ahead", "go", or equivalent). Do not start without it.

Once confirmed, follow these rules during the entire implementation:

**One rule above all:** implement what the spec says. If something in the spec looks suboptimal to you, mention it as an observation but implement what was agreed. Changes to the spec go into the spec, not into the code by surprise.

**Work rhythm:**

- Implement one step of the plan.
- Show a summary of which files you touched and what you did.
- Say: `Step N completed. Could you review the diff and let me know if I continue with Step N+1?`
- Wait for confirmation before continuing.

**If during the implementation you find an ambiguity** the spec does not resolve:

- Stop.
- Describe the ambiguity exactly.
- Present two or three concrete options.
- Wait for the user's decision.
- Do not improvise.

**If the user asks for something that is out of the spec's scope:**

- Remind them that it is out of this spec's scope.
- Suggest noting it down for the next spec.
- Do not implement it on this branch.

**When finishing the last step**, do NOT close the flow yet — this command adds a post-implementation phase. Tell the user:

```
✅ All steps of the plan are implemented.

Next: I will pass the game through its post-implementation agents
(skin-designer → mobile-porter). See Phase 5.
```

Then continue to Phase 5 **without waiting for confirmation** (the dispatch is automatic and sequential).

---

### Phase 5 — Post-implementation: skins & mobile

This phase runs **automatically** once the last implementation step is done. Its job is to
fire two repo subagents **one after the other** over the game just implemented: first
**`skin-designer`** (guarantees Neon/Retro/Clásico skins), and **only when it finishes**,
**`mobile-porter`** (guarantees the game plays well on a phone in portrait).

#### 5.1 — Derive the game slug

The target slug is the game folder created/edited during the implementation, at
`app/juego/<slug>/jugar/` (with `engine.ts` + `page.tsx`).

- **Do NOT use the spec's filename slug** — it can differ from the game slug
  (e.g. `07-juego-tetris-canvas.md` → game slug `tetris`).
- Determine `<slug>` from the files the plan touched, or by listing `app/juego/` and picking
  the folder that has `jugar/engine.ts` matching this implementation.
- If more than one candidate is plausible, ask the user which `<slug>` is the game this spec
  produced. Do not guess.

#### 5.2 — Guard: game specs only

Verify that **both** `app/juego/<slug>/jugar/engine.ts` and `app/juego/<slug>/jugar/page.tsx`
exist. If they do not (the spec did not produce a playable canvas game), show:

```
ℹ️ This spec did not produce a playable game under app/juego/<slug>/jugar/.
   /spec-impl-game only runs skin-designer and mobile-porter on game specs,
   so I am skipping those agents. The implementation itself is complete.
```

…and **finish without launching any agent** (jump to 5.5).

#### 5.3 — Run `skin-designer` (synchronous)

Launch the subagent with the **Agent** tool:

- `subagent_type: "skin-designer"`
- `run_in_background: false` (must run synchronously — we need it done before the next one)
- `description`: e.g. `"Skins for <slug>"`
- `prompt`: tell it the target game is `app/juego/<slug>/jugar/` and to **validate and, if
  needed, implement** the 3 mandatory skins (`clasico` default, `neon`, `retro`) per its own
  contract, without touching gameplay.

Wait for it to return. Its final report is **not shown to the user**, so **relay** what it
did (which skins existed, what it added, screenshots) in a short summary.

#### 5.4 — Run `mobile-porter` (synchronous, only after 5.3 returned)

**Only after `skin-designer` has returned**, launch the second subagent with the **Agent**
tool:

- `subagent_type: "mobile-porter"`
- `run_in_background: false`
- `description`: e.g. `"Mobile port for <slug>"`
- `prompt`: tell it the target game is `app/juego/<slug>/jugar/` and to **validate and, if
  needed, fix** the portrait/mobile layout per SPEC 10, without touching gameplay.

Wait for it to return and **relay** its outcome to the user.

The "one after another" guarantee comes from (a) running both in the foreground
(`run_in_background: false`) and (b) **never** invoking `mobile-porter` until `skin-designer`
has returned. Never launch both at once, and never launch them in the background.

#### 5.5 — Close

```
✅ Implementation + post-implementation agents finished.

  • skin-designer → [one-line outcome]
  • mobile-porter → [one-line outcome]

Next step: verify the spec's acceptance criteria one by one.
If they all pass, update the spec's state to "Implemented" (or the equivalent
in your repo's language) and make the final commit before merging this branch.
```

---

## Hard rules for Phase 5

- **Sequential, never parallel.** `mobile-porter` starts only after `skin-designer` returns.
- **Never in the background.** Both agents run with `run_in_background: false`.
- **No playable game → no agents.** If the guard in 5.2 fails, skip both agents; the
  implementation still counts as complete.
- **Respect each agent's frontier.** They change only skins / mobile appearance — not
  gameplay, catalog (`GAMES`) or Supabase. Do not ask them to do anything outside that.
- **Relay their work.** The user does not see subagent reports; summarize each outcome.

---

## Summary of expected behavior

```
/spec-impl-game 09-snake

  Phase 1  →  Finds specs/09-snake.md
  Phase 2  →  Reads the state → "Aprobado" → ✅ continues
  Phase 3  →  git checkout -b spec-09-snake → git checkout spec-09-snake
              Shows objective, scope, plan and criteria
  Phase 4  →  Implements step by step with pauses
  Phase 5  →  Derives slug `snake` → app/juego/snake/jugar/ exists → ✅
              Runs skin-designer (sync) → relays outcome
              Then runs mobile-porter (sync) → relays outcome
              Reminds to verify acceptance criteria

/spec-impl-game 02-powerups  (state: Draft / Borrador)

  Phase 1  →  Finds specs/02-powerups.md
  Phase 2  →  Reads the state → "Draft" → ❌ stops
              Shows the standard error message
              Does not create branch, does not touch code, does not run agents
```

**Branch creation is controlled by the `AutoCreateBranch` flag** in `specs/.spec-config.yml`.
It defaults to `true`. Set it to `false` to make Phase 3 ask `[y/N]` before creating the branch.
