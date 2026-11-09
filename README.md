# CookBook

A personal recipe app (installable PWA) built with React + TypeScript + Vite and Firebase.

## Local development (emulators only)

```bash
npm install
cp .env.example .env.local        # set VITE_USE_EMULATORS=true for local work
npm run emulators                 # Firebase emulators (project: demo-cookbook)
npm run dev                       # in a second terminal
```

The `demo-` project id means the emulators never touch a real Firebase project.
With `VITE_USE_EMULATORS=true` the other `VITE_FIREBASE_*` values may be left blank.
The emulators need Java 21+; `firebase-tools` is a project dev dependency (no global install).

## Scripts

| Command          | What it does                                  |
| ---------------- | --------------------------------------------- |
| `npm run build`  | Type-check and build the production PWA       |
| `npm test`       | Unit/component tests (Vitest)                 |
| `npm run emulators` | Start the Firebase emulators               |

## Configuration

All Firebase web config comes from `VITE_FIREBASE_*` env vars (see `.env.example`).
Real values go in `.env.local`, which is git-ignored.

**Secrets:** the Anthropic API key is never in the client, env files, or git. It lives only in
Firebase Secret Manager as `ANTHROPIC_API_KEY` and is read by Cloud Functions.

## Sign-in setup (one-time, in the Firebase console)

1. Authentication → Sign-in method → enable **Google** and **Apple**.
2. Apple requires an Apple Developer account: create a Services ID, a Sign in with Apple key,
   and register the return URL `https://<authDomain>/__/auth/handler`.
3. Set `VITE_FIREBASE_AUTH_DOMAIN` to the domain the app is served from (e.g. `<project>.web.app`).
   On iPhone/iPad the app signs in by full-page redirect, and Safari only keeps that sign-in
   when the auth domain matches the app's own domain.
