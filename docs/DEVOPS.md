# DevOps

Infrastructure and delivery pipeline for RIFF. RIFF is a client-only PWA
(no backend, no database), so the pipeline is deliberately small: verify
the build, then let a human trigger a deploy.

## CI — `.github/workflows/ci.yml`

Runs automatically on every push and pull request targeting `main`:

1. `npm ci`
2. `npm run lint`
3. `npm test` (Vitest, see below)
4. `npm run build`

This is check-only. It never deploys and needs no secrets.

## Tests — Vitest

`npm test` runs [Vitest](https://vitest.dev) once (`vitest run`, not watch
mode) against `src/**/*.test.ts`, config in `vitest.config.ts`. Today this
covers pure-logic modules under `src/lib/**` only (`environment: "node"`,
no DOM/React testing setup yet — add `jsdom`/`@testing-library/react` if
component tests are introduced later). Run it locally the same way CI
does:

```bash
npm test
```

## Deploy — `.github/workflows/deploy.yml`

Deploys to [Vercel](https://vercel.com) using the Vercel CLI. Trigger:
**manual only** (`workflow_dispatch` from the Actions tab). It never runs
on push, including to `main` — a deploy is an "apply" and should be a
deliberate, human-initiated action, not a side effect of merging.

Steps in the job: `vercel pull` → `vercel build` → `vercel deploy --prebuilt`,
against either the `production` or `preview` environment, chosen when the
workflow is dispatched.

### One-time setup (required before first deploy)

Someone with a Vercel account needs to do this once; none of it can be
done from CI itself:

1. Create a Vercel account/team if one doesn't exist, and install the
   [Vercel CLI](https://vercel.com/docs/cli) locally.
2. From the repo root, run `vercel link` and follow the prompts to create
   or link a Vercel project for RIFF.
3. Generate a Vercel access token: Vercel dashboard → **Settings → Tokens**.
4. After `vercel link`, read `.vercel/project.json` for `orgId` and
   `projectId`.
5. In the GitHub repo, go to **Settings → Secrets and variables →
   Actions** and add:
   - `VERCEL_TOKEN`
   - `VERCEL_ORG_ID`
   - `VERCEL_PROJECT_ID`
6. Optional but recommended: create GitHub **Environments** named
   `production` and `preview` (**Settings → Environments**) and add
   required reviewers to `production`. The deploy workflow already
   references `environment: ${{ inputs.environment }}`, so once the
   environment exists, GitHub will hold the run for approval before it
   deploys — a second confirmation gate on top of the manual trigger.

### Running a deploy

GitHub → **Actions** tab → **Deploy (Vercel)** → **Run workflow** → choose
`production` or `preview`.

## Local dev server

`.claude/launch.json` defines the `riff-dev` configuration (`npm run dev`
on port 3000, auto-incrementing if taken) used by the Claude Code preview
tooling. This is a dev-loop convenience, not part of the deploy pipeline.

## Not yet set up

- No custom domain, staging URL, or CDN/caching config beyond Vercel's
  defaults — none of that exists today, so nothing further is documented
  here yet.
