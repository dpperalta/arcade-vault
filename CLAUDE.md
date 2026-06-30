# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Critical: Next.js version

This repo runs **Next.js 16.2.9** (App Router, React 19). It contains breaking changes versus older Next.js that may be in your training data. **Before writing or changing any Next.js code, read the relevant guide under `node_modules/next/dist/docs/`** (`01-app`, `02-pages`, `03-architecture`). These docs also embed `AI agent hint` comments for specific features — heed them (e.g. instant navigation requires exporting `unstable_instant` from the route, not just Suspense).

## Commands

```bash
npm run dev     # start dev server (http://localhost:3000)
npm run build   # production build
npm run start   # serve the production build
npm run lint    # ESLint (flat config, eslint-config-next core-web-vitals + typescript)
```

There is no test runner configured yet.

## Architecture

- **App Router** under `app/`. `app/layout.tsx` is the root layout (Geist fonts via `next/font/google`, Tailwind via `app/globals.css`); `app/page.tsx` is the home route. Add routes as nested folders with `page.tsx`/`layout.tsx`.
- **Styling**: Tailwind CSS v4 through the PostCSS plugin (`@tailwindcss/postcss`, configured in `postcss.config.mjs`). No `tailwind.config.js` — v4 is configured in CSS.
- **TypeScript**: `strict` mode. Import alias `@/*` resolves to the project root (e.g. `@/app/...`).
- **Domain**: Arcade Vault is an online platform where users play games and compete for the highest score. The codebase is currently the starter scaffold; product features are not yet built.

## Workflow: Spec-Driven Design

This project follows spec-driven design using the `/spec` and `/spec-impl` skills from [Klerith/fernando-skills](https://github.com/Klerith/fernando-skills). Write/refine a spec with `/spec` before implementing it with `/spec-impl`.
