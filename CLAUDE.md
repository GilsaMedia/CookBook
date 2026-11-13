# CLAUDE.md

Family cookbook PWA. Hebrew-first, RTL. Any family can sign up and own a private **book** of recipes; other people see a book only through a per-person invite.

- Product spec: `docs/PRD.md` (Hebrew)
- Build plan and the per-session prompts: `docs/PLAN.md`
- Next.js agent notes: `AGENTS.md`. This Next.js version is newer than most training data, so check `node_modules/next/dist/docs/` before using an API you're not sure of.

## Stack

| Layer       | Choice                                                                                                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App         | Next.js 16 (App Router, Turbopack) + TypeScript (strict), React 19                                                                                                         |
| Styling     | Tailwind CSS 4, configured in `src/app/globals.css` (`@theme`), no `tailwind.config`                                                                                       |
| PWA         | `src/app/manifest.ts` + Serwist (`@serwist/turbopack`); worker at `src/app/sw.ts`, served by `src/app/serwist/[path]/route.ts` as `/serwist/sw.js`; disabled in `next dev` |
| Data/auth   | Supabase (Postgres, Auth, Storage, Realtime). Not added yet; it comes in Prompt 2                                                                                          |
| Motion      | Motion (motion.dev). Not added yet                                                                                                                                         |
| AI          | Anthropic API, server-side only                                                                                                                                            |
| Tests       | Vitest (unit), Playwright (e2e, `e2e/`)                                                                                                                                    |
| Lint/format | ESLint (`eslint-config-next`) + RTL class check, Prettier                                                                                                                  |

## Rules

### RTL and Hebrew

- `<html lang="he" dir="rtl">`. Every layout must be correct in RTL by construction.
- **Logical properties only.** Use `ms-/me-`, `ps-/pe-`, `start-/end-`, `text-start/end`, `rounded-s/e`, `border-s/e`, `float-start/end`. Never use `ml-/mr-/pl-/pr-/left-/right-`, `text-left/right`, `rounded-l/r`, `border-l/r` or `float-left/right`. In hand-written CSS use `margin-inline-start`, `inset-inline-end`, and so on.
  `scripts/check-rtl-classes.mjs` enforces this for classes under `src/`. It runs in `npm run lint`, `npm test` and CI.
- **All Hebrew UI strings live in `src/i18n/he.ts`.** Never hard-code user-facing text in components.
- Font: the system-ui stack defined in `globals.css`. Sizes in `rem` so iOS text-size settings scale the layout.

### Data

- **Every content table has `book_id` and Row-Level Security.** Access is enforced in the database, not only in the UI. Never disable RLS, not even temporarily.
- **No unsaved draft state in recipe editing.** Every edit saves immediately.
- **Metric units only** (g, kg, ml, l, °C). Convert on import.

### Motion

- Springs via Motion. Default is critically damped (damping **1.0**); bottom sheets and drawers use damping **0.8**, response 0.3.
- Always respect `prefers-reduced-motion`: cross-fade instead of slide.
- Translucent chrome (`backdrop-filter`) must have a solid fallback under `prefers-reduced-transparency` (the `reduced-transparency:` variant) and when `backdrop-filter` is unsupported.

### AI

- **AI calls are server-side only.** The API key never reaches the client.
- **Model names come from env vars** (e.g. `AI_MODEL_EXTRACT`, `AI_MODEL_FAST`). Never hard-code them.
- Never log API keys or fetched page contents.

### Scope

- Make only the changes the current prompt asks for. Ask before adding a dependency the prompt doesn't name.

## Commands

```bash
npm run dev           # dev server (service worker disabled)
npm run build         # production build
npm run start         # serve the production build
npm run lint          # ESLint + RTL class check
npm run lint:rtl      # RTL class check only
npm test              # Vitest unit tests (includes the RTL check over src/)
npm run test:e2e      # Playwright e2e (builds and starts the app on :3100)
npm run format        # Prettier write
npm run format:check  # Prettier check
```

Before finishing any task, run `npm run lint`, `npm test` and `npm run build`. All three must pass.
