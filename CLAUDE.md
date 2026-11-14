# CLAUDE.md

Family cookbook PWA. Hebrew-first, RTL. Any family can sign up and own a private **book** of recipes; other people see a book only through a per-person invite.

- Product spec: `docs/PRD.md` (English, with Hebrew UI text)
- Build plan and the per-session prompts: `docs/PLAN.md`
- Next.js agent notes: `AGENTS.md`. This Next.js version is newer than most training data, so check `node_modules/next/dist/docs/` before using an API you're not sure of.

## Stack

| Layer       | Choice                                                                                                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App         | Next.js 16 (App Router, Turbopack) + TypeScript (strict), React 19                                                                                                         |
| Styling     | Tailwind CSS 4, configured in `src/app/globals.css` (`@theme`), no `tailwind.config`                                                                                       |
| PWA         | `src/app/manifest.ts` + Serwist (`@serwist/turbopack`); worker at `src/app/sw.ts`, served by `src/app/serwist/[path]/route.ts` as `/serwist/sw.js`; disabled in `next dev` |
| Data/auth   | Supabase (Postgres, Auth, Storage, Realtime). Schema in `supabase/migrations/`, typed client in `src/lib/supabase/`, session refresh in `src/proxy.ts`                     |
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
- Child rows (ingredients, steps, images…) reference their parent with a composite foreign key `(parent_id, book_id)`, so they can't point into another book. Follow the same pattern for new tables.
- RLS helpers live in the unexposed `private` schema (`private.member_role`, `is_member`, `is_owner`, `can_edit_recipe`). Reuse them in new policies.
- Any new table or policy needs cases in `supabase/tests/rls.test.ts`, and `npm run test:db` must pass.
- Schema changes are new migrations (`npx supabase migration new <name>`), then `npm run db:types`. Never edit a migration that has been pushed.
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
npm run test:e2e      # Playwright e2e (builds and starts the app on :3100; needs local Supabase + .env.local)
npm run db:start      # start local Supabase (Docker)
npm run db:env        # write .env.local from the running local Supabase
npm run db:reset      # re-apply all migrations to the local database
npm run db:types      # regenerate src/lib/supabase/database.types.ts
npm run test:db       # RLS / database integration tests (needs local Supabase)
npm run format        # Prettier write
npm run format:check  # Prettier check
```

Before finishing any task, run `npm run lint`, `npm test` and `npm run build`. All three must pass. If the task touched the database, also run `npm run test:db`.

## Git workflow

Each prompt in `docs/PLAN.md` §7 is one unit of work: one branch, one pull request, merged into `main` before the next prompt starts.

### Before starting a prompt

1. `git status` must be clean. If it isn't, stop and ask; never discard someone's uncommitted work.
2. Start from the latest `main`: `git fetch origin main` and branch from `origin/main`.
3. If the previous prompt's branch isn't merged into `main` yet, stop and say so. Every prompt assumes the previous one is merged. If the owner says to continue anyway, branch from the previous prompt's branch instead (a stacked branch) and point its pull request at that branch.
4. Branch name: `prompt-NN-<slug>`. The slug can be plainly descriptive or a joke, as long as a reader can still tell what's in the branch. Kitchen puns about the branch's content are welcome, e.g. `prompt-02-no-peeking-in-other-pots` (RLS: nobody sees another family's book), `prompt-07-the-list-that-does-the-math` (shopping list). Keep it lowercase, hyphenated, under ~50 characters, and free of personal or work details (the repo may be public). The owner can also ask for a session-assigned name instead.

### While working

- Commit after each completed step of the prompt's Progress list, not one giant commit at the end. Each commit should build.
- Commit message format ([Conventional Commits](https://www.conventionalcommits.org)):

  ```
  <type>(<scope>): <what changed, imperative, ≤ 72 chars>

  <why: the reason and any decision worth remembering, wrapped at 72>

  Prompt: NN
  ```

  - **type:** `feat` (user-visible feature), `fix` (bug fix), `test`, `docs`, `refactor`, `chore` (deps, config, tooling), `ci`, `db` (migrations, RLS policies).
  - **scope:** the area, e.g. `library`, `shopping`, `cook`, `import`, `auth`, `rls`, `pwa`, `i18n`.
  - Example: `feat(shopping): merge ingredients across dishes by canonical name`

- Never commit secrets: `.env*` files, API keys, Supabase service-role keys, tokens. Put example variables in `.env.example` with empty values.
- Never commit generated output (`.next/`, `test-results/`, `playwright-report/`, `coverage/`).

### Before finishing a prompt

1. Run `npm run lint`, `npm test` and `npm run build`. All three must pass. Also run `npm run test:e2e` when the prompt changed UI or flows.
2. Commit any remaining work, then push: `git push -u origin <branch>`. Retry network failures up to 4 times with backoff.
3. Open a pull request into `main` titled `Prompt NN: <prompt objective>`. In the description:
   - what was built, with the Progress list
   - each acceptance criterion as a checkbox, ticked only if verified, with how it was verified
   - anything skipped, deferred or decided differently from the prompt, and why
   - manual checks the reviewer must do (e.g. iPhone home-screen tests)
4. Don't merge it yourself. The owner reviews and merges.

### Never

- Force-push to `main` or rewrite history that's already pushed. Fix mistakes with a new commit.
- Push directly to `main`.
- Edit or delete an applied database migration; add a new one instead.
- Delete branches you didn't create.
