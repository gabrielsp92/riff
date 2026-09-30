# DevOps

Infrastructure and delivery pipeline for RIFF. RIFF is a client-only PWA
(no backend, no database), so the pipeline is deliberately small: verify
the build, then deploy to Vercel automatically.

## CI/CD — `.github/workflows/ci.yml`

Runs on every push and pull request targeting `main`:

1. **Lint & build** — `npm ci`, `npm run lint`, `npm test`, `npm run build`.
2. **Deploy production** (pushes to `main` only, i.e. merged PRs) — once
   job 1 passes, deploys to Vercel production. Production deploys are
   serialized, never cancelled mid-flight.

Pull requests only run the checks; nothing is deployed until the PR is
merged. A red CI run never deploys.

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

Reusable workflow that ci.yml calls for production deploys. It uses
the Vercel CLI: `vercel pull` → `vercel build` → `vercel deploy --prebuilt`.
It can also be dispatched by hand (Actions tab → **Deploy (Vercel)** → **Run
workflow**) to redeploy any branch to `production` or `preview`.

`vercel.json` sets `git.deploymentEnabled: false` so Vercel's own Git
integration never deploys on its own. All deploys go through GitHub Actions
behind the CI gate.

### One-time setup (required before first deploy)

Someone with a Vercel account needs to do this once:

1. Install the [Vercel CLI](https://vercel.com/docs/cli) and log in:
   `npm i -g vercel && vercel login`.
2. From the repo root, run `vercel link` and create or link a Vercel
   project for RIFF (framework: Next.js, default settings).
3. Read `.vercel/project.json` for `orgId` and `projectId` (the file is
   gitignored).
4. Generate a Vercel access token: Vercel dashboard → **Account Settings →
   Tokens**.
5. Add three GitHub Actions secrets (**Settings → Secrets and variables →
   Actions**, or `gh secret set <NAME>`):
   - `VERCEL_TOKEN`
   - `VERCEL_ORG_ID`
   - `VERCEL_PROJECT_ID`

If a secret is missing, the deploy job fails immediately with an error
naming it.

GitHub creates the `preview` and `production` Environments on first deploy.
To require approval before production goes out, add required reviewers to
the `production` environment (**Settings → Environments**).

## Local dev server

`.claude/launch.json` defines the `riff-dev` configuration (`npm run dev`
on port 3000, auto-incrementing if taken) used by the Claude Code preview
tooling. This is a dev-loop convenience, not part of the deploy pipeline.

## Not yet set up

- No custom domain, staging URL, or CDN/caching config beyond Vercel's
  defaults — none of that exists today, so nothing further is documented
  here yet.
