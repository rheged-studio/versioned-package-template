# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Claude Code reads only `CLAUDE.md`, so the `@AGENTS.md` line below imports the canonical shared
block (which Cursor reads from `AGENTS.md` natively). Estate-wide guidance lives there;
repo-specific guidance follows below.

@AGENTS.md

## Repo

Template repository for Rheged Studio **versioned, non-npm deploy targets** — the fourth estate
archetype, the `octavo` / `shared-workflows` pattern. A repo spawned from this template gets the
full versioned release story (**release-please → git tags → GitHub Releases**) plus the shared
CI + dated-changelog shell, but publishes **no npm or GitHub package**. It is a **content-only
baseline**: no `src/`, no build step, no tsconfig, no compiled/published artefact. `package.json` is
`private: true` and exists purely as the **version-of-record** (bumped by release-please) plus a
dev-tooling manifest (skills `.mjs`, `changelog-core`, eslint, husky). A new deploy target can be
generated and given a working release story without rebuilding the infrastructure each time.

The one-time org/repo settings that stand this up as a GitHub Template repository — and the settings
every spawned repo inherits (Template flag, the `Require GO/NO GO gate` ruleset, the `Trunk`
changelog bypass, orchestrator onboarding, Claude review) — live in the
[Setup section of the README](README.md#setup), the single source of truth for the non-copied setup.
The list below covers the per-repo code edits inside a generated repo, plus the non-copied repo/org
steps (each cross-links its README subsection rather than duplicating the detail).

When generating a repo from this template, **run the `initialise-versioned-repo` skill** in the new
repo (see "## Agent skills" below, and A-946). It drives the whole post-generation checklist below in
one idempotent, dry-run-first pass — so the individual steps here are the _reference_ for what it
does, not a manual walk you have to perform by hand. (It also adapts the inherited `GLOSSARY.md` to
the new repo.) Because this is a content-only deploy target,
there is **no `src/` API to author** — that is the one manual step the npm-package template left you,
and it does not exist here.

The skill **automates**:

- **Renames the `package.json` identity** — `name` (placeholder
  `@rheged-studio/versioned-package-template`), `description`, `keywords`, `repository`,
  `homepage`, `bugs` — deriving name/URLs from `gh repo view` and prompting for
  `description`/`keywords`. `private: true` stays (a deploy target never publishes).
- **Re-seeds `.release-please-manifest.json`** so `"."` matches the new repo's starting
  `package.json` version (the template ships `"0.0.0"`). Leaving it stale is the #1 release-please
  failure mode. `release-please-config.json` itself needs no edit.
- **Resets `changelog/` to just its `README.md`.** The template dogfoods its own changelog process,
  so `changelog/` accumulates dated entries documenting the _template's own_ development. "Use this
  template" copies them into the generated repo, where they are unrelated noise. The skill deletes
  every dated entry, keeping only `README.md`; the template's entries are preserved in its own git
  history, and the repo's own first real entry is written by `/send-it`.
- **Points `infrastructure/repo-config.yaml`** at the new repo (`defaultBranch`, `nodeVersionFile`)
  where values differ, preserving comments.
- **Pulls the shared skills** via `npx skills add … --copy` from `rheged-studio/agent-skills` for
  the locked set (both Claude Code and Cursor trees) — pull-on-instantiation (A-776). Committed
  copies in the template are bootstrap only; the repo-local `initialise-versioned-repo` scaffolder is
  never overwritten.
- **Clears the template-seed skill-config gitignore** (A-812) so spawned consumers can commit the
  resolved per-skill `config.json` files — then **generates those configs** by wrapping the
  `rheged-skills-setup` skill (only the neutral `config.example.json` ships in the vendored bundles).
  Runs **after** the skills pull so configs match the pulled versions.
- **Re-creates the `Require GO/NO GO gate` required-check ruleset** (rulesets are **not** copied by
  "Use this template") — pinned to the GitHub Actions integration, **with road-runner-bot as a bypass
  actor** so the in-repo `changelog-enrich` push clears the required check (see "CI gate
  (`GO/NO GO`)" below). See [README → the required-check ruleset](README.md#the-required-check-ruleset).
- **Ensures the `Trunk` changelog bypass** (ADR 0004 / A-794) — repo-level `Trunk` ruleset with
  `road-runner-bot` as an `always` bypass actor so `changelog-enrich.yml` can push `changelog/**`.
  Creates `Trunk` when absent.
- **Creates the `Changelog write-back path guard`** (A-946) — the octavo-parity **push** ruleset
  (a `file_path_restriction` over the code/config paths) that blocks non-bot direct pushes to those
  paths while `road-runner-bot` and the repo write-roles bypass it: defence-in-depth for the in-repo
  changelog write-back. (The pre-existing `Protect main trunk` deletion / non-fast-forward ruleset is
  org/repo-level and not managed by the skill.)

The skill **verifies-and-reports** (needs org/browser/cross-repo privilege it can't take on itself),
so you finish these by hand:

- **Onboard the release-orchestrator** — the template ships every repo-side prerequisite and
  road-runner-bot is installed org-wide, so this reduces to **registering the repo in the
  orchestrator's matrix as a `kind: deploy` target** (A-648 / A-945). The `deploy` kind tells the
  orchestrator to cut a git tag + GitHub Release rather than trigger a publish. See
  [README → release-orchestrator onboarding](README.md#release-orchestrator-onboarding).
- **Verify the Claude review prerequisites** — `CLAUDE_CODE_OAUTH_TOKEN` secret **and** the Claude
  GitHub App on the repo (the App install fixes the `git fetch … could not read Username` failure —
  A-621 / A-636). Preferably both are org-wide, in which case just confirm inheritance. See
  [README → Claude review prerequisites](README.md#claude-review-prerequisites).

There is **no** npm-OIDC bootstrap, **no** `npm-release` environment, **no** Trusted-Publisher
configuration, and **no** "enable the Release workflow" step — a deploy target publishes nothing and
ships no in-repo release/publish workflow (contrast the npm-package template, where all of those
existed). The road-runner-bot App is now installed org-wide across the config-estate repos, and
`ROADRUNNER_*` is likewise org-wide (A-945), so a spawned repo inherits both the bot and its
credentials — there is no per-repo bot install or "grant selected access" step either.

## Decisions live in Linear, not ADRs

Architectural and process decisions for this template — and for every repo spawned from it —
are recorded as **Linear issues**, not as in-repo ADR files. The issue IDs threaded through
this document and the code comments (e.g. `A-326`, `A-328`, `A-447`, `A-639`) are the durable
decision record: follow the ID to Linear for the full rationale. A repo generated from the
template inherits this convention — capture new decisions as Linear issues and reference their
IDs in commits, PR bodies, and comments rather than adding a `docs/adr/` tree. The template
itself is catalogued in the Open Source initiative in Linear (A-238).

## Package manager and Node

pnpm, pinned via `packageManager` in `package.json`. Node 22 required (`.nvmrc`, `engines.node: ">=22"`, `engine-strict=true` in `.npmrc`).

## Commands

```bash
pnpm install        # install deps (runs prepare → husky hook install)
pnpm test           # vitest run (infrastructure/tests/**/*.test.{ts,mjs})
pnpm test:watch     # vitest in watch mode
pnpm test:sh        # bats on infrastructure/tests/*.bats
pnpm lint:md        # markdownlint (CI: lint reusable caller)
pnpm lint:yaml      # yamllint . (semantic YAML check; warnings non-blocking)
pnpm lint:workflows # actionlint on .github/workflows/
pnpm lint:sh        # shellcheck on infrastructure/scripts/*.sh + .husky/*
pnpm validate:changelog # schema-check changelog/*.md via changelog-core (CI: lint reusable caller)
pnpm format         # prettier write
pnpm clean          # remove node_modules
```

There is **no `build`, `tsc`, or standalone `eslint` script** — this is a content-only baseline with
nothing to compile, and ESLint runs only through the CI `lint` reusable caller (and lint-staged
locally). See "Build / type-check / lint topology" below.

## Agent skills

This repo adopts the shared `@rheged-studio/agent-skills` bundles, installed via [skills.sh](https://skills.sh) under `.claude/skills/` (mirrored to `.agents/skills/` for Cursor). The installed skills are:

- **`/send-it`** — the all-in-one finisher: commits uncommitted work as atomic Conventional Commits, runs the change-gated lint preflight, writes a dated `changelog/` entry (for **every** PR — "record everything, filter later"; non-release entries stay version-less), composes the Conventional Commits PR title, pushes, opens or updates a draft PR, and moves linked Linear issues to In Review. Prefer it over hand-rolled `git commit` + `git push` + `gh pr create`.
- **`/preflight`** — the change-gated, branch-scoped lint preflight (delegated to by `/send-it`).
- **`/changelog`** — authors, refreshes, or repairs the dated `changelog/` entry for the current branch (delegated to by `/send-it`).
- **`/linear-sync`** — transitions the Linear issue(s) linked to the current branch to a target workflow state.
- **`/cleanup-repo`** — prunes merged Git branches and worktrees, then clears filesystem cruft, behind a single confirmation gate.
- **`/triage-pr`** — drives a PR from draft-with-failing-CI to merge-ready.

One further skill is **repo-local**, not from the shared bundle (it lives only in this template's `.claude/skills/` + `.agents/skills/`, is not in `skills-lock.json`, and travels into spawned repos via "Use this template"):

- **`/initialise-versioned-repo`** — the one-shot, idempotent post-generation setup for a repo freshly spawned from this template (A-946 / A-776). Resets `changelog/` to just its README (the changelog-poisoning fix), re-seeds `.release-please-manifest.json`, rewrites the `package.json` identity + `infrastructure/repo-config.yaml` from the repo's own facts, **adapts the inherited `GLOSSARY.md`** (rewrites its context header, strips the template-only terms), **pulls the shared skills** via `npx skills add … --copy`, **wraps and runs `rheged-skills-setup`** to generate every skill's `config.json`, and applies the non-copied GitHub settings — the `Require GO/NO GO gate` required-check ruleset (with the road-runner-bot bypass), the `Trunk` changelog bypass, and the `Changelog write-back path guard` push ruleset — via `gh api` behind a confirmation gate, then verifies-and-reports the org/cross-repo steps it can't automate (orchestrator registration as `kind: deploy`, Claude review). It has **no** npm-release environment / OIDC / enable-Release steps — a deploy target publishes nothing. It **is** the executable form of the generation checklist at the top of this file. Dry-run first, safe to re-run.

Each shared-bundle skill ships a neutral `config.example.json`. The real `config.json` is **generated on install, then committed in the consumer** (agent-skills v1.1.0 generated-config model / A-812). The template seed gitignores `.claude/skills/*/config.json` and `.agents/skills/*/config.json` so "Use this template" never copies a local resolved config into a new repo; `/initialise-versioned-repo` strips those ignore lines, runs `rheged-skills-setup`, and the spawned repo **commits** the resulting configs. Run `rheged-skills-setup` again after a fresh install or a repo-fact change (the changelog directory, `R` and `A` as the Linear issue keys); it is idempotent (a second dry-run is a no-op). The template seeds `issueKeys: ["R", "A"]` in every config copy (A-2654), so a spawned repo resolves both `r-…` branches and legacy `a-…` ones.

**v1.1.0 behavioural changes (A-640).** Riding along with the v1.1.0 re-sync: `/send-it` decides release-type by the change's **semantic category** (the Conventional-Commit type of the work it commits), not by which paths the diff touches; `/preflight` gains a `blockOnWarnings` knob (defaults to errors-only blocking); `/changelog` add-links is branch-scoped by default.

**Template-propagation note (A-776).** Committed shared skill bundles (installed with `--copy`) remain in this template as **bootstrap** so `/initialise-versioned-repo` can run immediately after "Use this template". A spawned repo then **pulls** the locked shared set once via `npx skills add … --copy` (both agents) before `rheged-skills-setup` materialises per-skill `config.json` — pull-on-instantiation, not inheritance of a frozen tree with no refresh. This template is **not** a skills push-fan-out consumer (dropped in A-774); do not re-add it to the hourly matrix.

## Source layout

There is **no `src/` and no compiled `dist/`** — this is a content-only, non-npm deploy target
(A-939). `package.json` is `private: true` and carries no `main`/`module`/`types`/`exports`/`files`
publish surface; its role is the **version-of-record** (release-please bumps `version`, mirrored in
`.release-please-manifest.json`) plus the dev-tooling manifest.

The only first-party code in the repo is under `infrastructure/` — the workflow-shell shell (`.sh`)
and the repo-local init-skill tooling (`.mjs`), all unit-tested (bats + vitest). The workflow/release
shell — `.github/`, `infrastructure/`, `.husky/`, `changelog/`, `release-please-config.json`,
`.release-please-manifest.json` — is the substance of the template; there is no product artefact
alongside it.

## Build / type-check / lint topology

There is **no build, no type-check pass, and no tsconfig** — the content-only baseline (A-939)
removed the `src/` tree and, with it, the old three-tsconfig arrangement (`tsconfig.json` /
`tsconfig.tools.json` / `tsconfig.eslint.json`) and the `build`/`tsc` scripts. Nothing compiles;
CI runs `build: false` and `typecheck: false` (see "Shared reusable CI callers" below).

What remains is lint + test over the first-party `infrastructure/` code:

- **ESLint** — `eslint.config.ts` consumes `@rheged-studio/eslint-config` (`base` + `typescript`),
  and its lint surface is the `infrastructure/` `.mjs` tooling only. With no `src/` there is no
  type-aware project pin: the config ignores `.agents/**` (the Cursor skills mirror) and
  `vitest.config.ts` so the only remaining first-party `.ts` is excluded and the base preset's
  type-aware rules never look for a tsconfig that no longer exists. The config itself is excluded
  from linting by the preset's global ignores. CI scopes ESLint to `infrastructure/tests` (see below).
- **Vitest** — `vitest.config.ts` includes `infrastructure/tests/**/*.test.{ts,mjs}`. `.test.mjs`
  covers the zero-dependency `.mjs` init-skill scripts; `.test.ts` covers any infra TypeScript
  tooling.

`eslint.config.ts` and `vitest.config.ts` are authored in TypeScript (loaded by `jiti`) and are
type-checked only in the sense that `defineConfig` gives them the preset's / Vitest's shipped types
at author time — there is no separate `pnpm tsc` pass.

## Linting and formatting

This repo dogfoods the org's own shared configs:

- **ESLint** — `eslint.config.ts` consumes `@rheged-studio/eslint-config`, composing the `base`
  stack plus the `typescript` overrides, then adds one local block: an `infrastructure/**/*.{ts,mjs}`
  override (`complexity: off` + `import/no-extraneous-dependencies` with `devDependencies: true`,
  since the shell/init tooling legitimately imports devDeps). The preset also re-exports opt-in
  presets (`testing`, `frameworkRouting`, `astro`, `sanity`, `storybook`, `tableComponents`) — but a
  content-only deploy target has no application code to pull them into. The config is authored in
  `.ts` (loaded by `jiti`, a devDependency ESLint v9.18+ requires for TypeScript config) and wrapped
  in `defineConfig` from `eslint/config`, so the whole array is type-checked against the preset's
  shipped types.
- **Markdown** — `.markdownlint-cli2.jsonc` extends `@rheged-studio/markdownlint-config`. Pre-commit auto-fixes staged `**/*.{md,mdx}` via lint-staged (`|| true`, so it never blocks); the `lint` reusable caller (markdown lane) enforces. (There is no root `CHANGELOG.md` to exclude — release-please runs with `skip-changelog`.)
- **Prettier** — `pnpm format` runs `prettier --write .`; `.prettierignore` excludes `node_modules` and `pnpm-lock.yaml`.

## GitHub Actions repo config

Non-secret knobs live in **`infrastructure/repo-config.yaml`** as a declarative record:

| Key               | Purpose                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `defaultBranch`   | Canonical default branch; keep in sync with static `on:` triggers (GitHub cannot derive `on.push.branches` from this file). |
| `nodeVersionFile` | The repo's canonical Node-version file (`.nvmrc`).                                                                          |

The file is **not loaded by CI.** The estate's `reusable-load-repo-config.yml@v1` (A-779) hard-requires
the npm registry / scope keys (`npmRegistryUrl`, `npmScope`, `githubPackagesRegistryUrl`) that a deploy
target doesn't carry, so those keys were **dropped** (A-941) and `ci.yml` points each job's
`node-version-file` at `.nvmrc` directly instead of loading this file — the reusable callers default to
`.nvmrc` anyway. The file is kept as the canonical statement of the two knobs and is reconciled by the
`initialise-versioned-repo` skill on a spawned repo. Secrets (`GITHUB_TOKEN`) and release-please
behaviour are not in this file. **No bot key ships in the template.**

## Local hooks

`pnpm install` runs `prepare` (`husky`), which installs the hooks under `.husky/`. Three hooks fire:

- **`pre-commit`** — runs `pnpm lint-staged`. Auto-fixes only the staged files: `prettier --write` for everything, `eslint --fix` for `**/*.{ts,tsx,js,mjs,cjs}`, `sort-package-json` + `eslint --fix` for `**/package.json`, `markdownlint-cli2 --fix` for `**/*.{md,mdx}`, `yamllint` (read-only check) for `**/*.{yml,yaml}`, `actionlint` (read-only check) for `.github/workflows/*.{yml,yaml}`. Each task is wrapped in `bash -c '… "$@" --` so the staged file paths are passed through. The auto-fixers carry an `|| true` fallback so they never block — CI is the gate. The two YAML linters are best-effort: if the tool isn't on `PATH` locally, the hook prints a platform-appropriate install hint and skips. CI still enforces.
- **`commit-msg`** — strips any `Co-Authored-By: Claude … <noreply@anthropic.com>` trailer. Backstops the global `~/.claude/CLAUDE.md` rule (Claude is tooling, not a contributor).
- **`pre-push`** — blocks direct pushes to `main`; humans should use `/send-it` to open a PR. Bot users (`github-actions[bot]`, `road-runner-bot[bot]`) and the release-please release commit (`chore(main): release <version>`) bypass. It also runs `pnpm lint:workflows` + `pnpm lint:yaml` as a last-line gate before CI, then a best-effort `commitlint --from origin/main --to HEAD` range check (A-1021) — skips with an installation hint if `@commitlint/cli` isn't available locally or if `origin/main` is not a resolvable ref; CI's `reusable-validate-commits` gate is still the authority. Config lives in `commitlint.config.mjs` extending `@rheged-studio/commitlint-config`.

Hooks are dormant in CI: `ci.yml` and the reusable workflows set `HUSKY=0` so the `prepare` script no-ops during `pnpm install`.

To bypass any hook in an emergency: `git commit --no-verify` or `git push --no-verify` — not recommended.

## CI gate (`GO/NO GO`)

`ci.yml` ends with a single **`GO/NO GO`** aggregator job — the one stable, estate-canonical gate the release-orchestrator waits on (A-412/A-424). It `needs:` every real job (`lint`, `build-test`, `changelog-completeness`), runs `if: ${{ always() }}`, and a one-line `jq` verdict over `toJSON(needs)` succeeds **iff** every job `result` is `success` or `skipped`. The `lint` and `build-test` jobs are thin callers of the shared reusable workflows (see "Shared reusable CI callers" below), each reading its Node version from `.nvmrc` directly — there is no `config`/load-repo-config job (see "GitHub Actions repo config"). The **PR-title lint runs in its own workflow** (`validate-pr-title.yml`, A-695), not inside `ci.yml`.

- **Why a check-run, not a commit status.** The gate is the job's _intrinsic_ check-run, named `GO/NO GO`. A commit status is writable by any push-scoped token (forgeable); a **check-run can only be minted by a GitHub App** — here, the repo's own Actions run — so a push-scoped token or a fork contributor cannot forge it. Require it on `main` via a **ruleset pinned to the GitHub Actions integration** (`integration_id: 15368`), so nothing but this repo's Actions can satisfy it. Rulesets aren't copied by template generation — see the generation checklist.
- **road-runner-bot bypass (A-944 / A-1019).** The `Require GO/NO GO gate` ruleset **must** list road-runner-bot as a bypass actor: the **in-repo** `changelog-enrich` job pushes `changelog/**` directly to `main` after each merge and would otherwise be rejected by the required check. Human PRs still have to satisfy `GO/NO GO` — the bypass is scoped to the bot actor. The `Trunk` ruleset carries the same bypass for its pull-request/deletion/non-fast-forward rules. npm-package templates need the same enricher bypass on GO/NO GO (A-1019) — this is estate-wide for any repo whose enricher writes back to `main` as the bot, not a deploy-target-only rule. See [README → the required-check ruleset](README.md#the-required-check-ruleset).
- **Footguns (A-418).** The gate must **never** be path-filtered (a path-filtered required check sits Pending forever and blocks merges); `always()` is mandatory or the aggregator skips and never reports; the literal `/` and space must surface as `check_run.name == "GO/NO GO"` (they do — emoji/spaces already survive in `lint / Lint`). Fall back to explicit-create (`POST /check-runs`, Option A) only if the `/` ever misbehaves.
- **Gate name (A-419 / A-596 / A-437).** Clacks polls the `GO/NO GO` check-run only. A-419 opened a dual-accept window (`🔬 Build & Lint` **or** `GO/NO GO`); A-596 collapsed it to `GO/NO GO`-only once every served repo emitted it, and A-437 retired the old gate role. The caller swap (A-447) had already **removed** the `🔬 Build & Lint` context from this template — replaced by `lint / Lint` + `build-test / Build & Test`. The `pr-title` job name (`pr-title / Validate PR title is a Conventional Commit`) is _also_ the estate-pinned required-check context (A-405); don't tidy it.
- **Done (A-411 / A-447 / A-695).** The `lint` and `build-test` jobs are thin callers of `rheged-studio/shared-workflows`'s reusable `reusable-lint.yml` / `reusable-build-test.yml` (A-415/416). `pr-title` moved to its own `validate-pr-title.yml` caller (A-695). `GO/NO GO` stays put across the swaps, which is exactly why it lives here (custom per-repo) and not upstream.

## Shared reusable CI callers (A-447)

The `lint` and `build-test` jobs in `ci.yml` are thin callers of the estate's shared reusable workflows — the template is the **reference consumer** that proves the pattern before the fleet rollout (A-420). Both float on the shared-workflows `@v1` major tag so non-breaking releases arrive without a per-release Dependabot SHA bump (A-662 / A-672).

- **`lint`** → `reusable-lint.yml` runs ESLint + markdownlint + yamllint/actionlint + dated-changelog validation in one job (`lint / Lint`). Inputs: `eslint-args` passes **directory paths** (`infrastructure/tests`), not globs — the Layer-1 action runs `eslint $ESLINT_ARGS` word-split with bash `globstar` off, so a `**` glob would mis-expand; directories let ESLint's flat config resolve the file set recursively. ESLint is re-scoped off the (removed) `src/` onto the repo's first-party `infrastructure/tests/**` `.mjs` (A-940) — scoped to `infrastructure/tests` rather than the whole `infrastructure/` tree on purpose (the shared eslint-config's YAML rules would double-lint `repo-config.yaml`, which the yaml lane owns; and `infrastructure/scripts` is shell-only, where ESLint errors when every file under a directory is ignored). `markdown-globs` mirrors the `lint:md` script; `changelog-script: validate:changelog` (the repo's script name; the reusable default is `changelog:validate`). The yaml lane uses **actionlint 1.7.12** (the reusable default, owned upstream in lockstep per A-422 — _not_ the `1.7.5` the local `ensure-actionlint.sh` pins) and shared-workflows' **centralised `.yamllint.yml`** (A-438), so the repo's local `.yamllint.yml` now only feeds the pre-commit hook.
- **`build-test`** → `reusable-build-test.yml` runs Vitest + ShellCheck + bats (`build-test / Build & Test`). **`build: false` and `typecheck: false`** — the content-only baseline (A-939) has no `src/` to compile and no tsconfig to type-check, so there is no verification build or type-check to run. `shellcheck-paths` passes the scripts dir + the three extensionless husky hooks explicitly (the action `find`s `*.sh/*.bash` under directories but takes files literally). `bats: true` runs `pnpm exec bats` — which is why **`bats` is a devDependency** (`bats@1.13.0`, matching `ensure-bats.sh`'s pin); the tests are self-contained (no `bats-support`/`bats-assert`).
- **No `config` job.** The reusable callers default `node-version-file` to `.nvmrc`, so each job (`lint`, `build-test`, and the inline `changelog-completeness`) sets `node-version-file: .nvmrc` directly. The estate's `reusable-load-repo-config.yml@v1` is deliberately **not** used: it hard-requires the npm registry/scope keys a deploy target doesn't carry (A-941).

The callers run on **all** branches including `release-please--*` (no skip), so the changelog lane validates the finalised entries before the release PR merges.

The `ensure-actionlint.sh` / `ensure-yamllint.sh` / `ensure-bats.sh` scripts (and `requirements-yamllint.txt`) are **no longer run in CI** — those tools install inside the reusable workflows now. They are retained as unit-tested reference shell (still exercised by `pnpm test:sh`) and document the install-and-verify pattern.

## Validating workflows and YAML

Two non-Node tools augment Prettier's formatting pass with the semantic checks Prettier can't see (Actions schema, `${{ … }}` expression typos, duplicate keys, etc.). Since A-447, **CI runs them inside the `lint` reusable caller** (the yaml lane), not inline — so the install scripts below are the **local/pre-commit + reference** path. Note the version split: the reusable workflow pins **actionlint 1.7.12** (and yamllint 1.37.1); the local `ensure-actionlint.sh` still pins **1.7.5**.

- **`actionlint` v1.7.5 (local)** — Go binary. Local install: `brew install actionlint` (macOS) or `bash <(curl -fsSL https://raw.githubusercontent.com/rhysd/actionlint/v1.7.5/scripts/download-actionlint.bash)` elsewhere.
- **`yamllint` 1.37.1** — Python tool. Local install: `brew install yamllint` (macOS) or `pip install --user yamllint==1.37.1` elsewhere.

**Digest-pinned bootstraps (A-327).** The CI install scripts for these tools fetch-and-execute third-party code, so each is pinned by digest, not just a mutable tag:

- `ensure-actionlint.sh` fetches `download-actionlint.bash` from the **immutable commit SHA** of the v1.7.5 tag (not the `v1.7.5` tag), passes the version explicitly so it installs that exact release, then independently re-verifies the extracted binary against a pinned sha256 (enforced on the CI arch, linux/amd64). It also **version-gates the cached binary** and **drops the cache `restore-keys` fallback** (A-349), so a version bump forces a clean reinstall instead of silently restoring a stale binary.
- `ensure-bats.sh` verifies the downloaded release tarball against a pinned sha256 before extraction.
- `ensure-yamllint.sh` installs via `pip install --require-hashes -r infrastructure/requirements-yamllint.txt`, so pip refuses any artefact — yamllint or a transitive dep — whose digest isn't listed. Regenerate that file when bumping (see its header).

When bumping any of these, update the version **and** the matching digest/requirements together. The same install-and-verify discipline now lives in the shared reusable workflows' read-scoped jobs.

Configuration: `.yamllint.yml` at the repo root extends defaults, demotes line-length / indentation to warnings (Prettier owns formatting), allows the GitHub Actions truthy values (`on`, `off`, `yes`, `no`), and ignores `node_modules/`, `dist/`, `.turbo/`, `pnpm-lock.yaml`. **Local + pre-commit only** since A-447 — CI's yaml lane uses shared-workflows' centralised config (A-438). No `.actionlintrc.yaml` — defaults are fine for this repo.

Enforcement: pre-commit is best-effort (skip with install hint when missing); CI is the `lint` reusable caller's yaml lane (`lint / Lint`), always enforced. The local install-and-run logic for both tools lives in `infrastructure/scripts/ensure-yamllint.sh` and `ensure-actionlint.sh` — now CI-unused but kept as unit-tested reference (see `infrastructure/README.md`).

## Validating workflows locally with `act`

`actionlint` and `yamllint` catch schema and expression-level mistakes. They say nothing about whether a workflow actually _works_ end-to-end — Node/pnpm setup ordering, env propagation, conditional skips, step interdependencies. [`act`](https://github.com/nektos/act) closes that gap by running the workflow against your local Docker daemon so you can iterate without push-and-pray.

**Install:** `brew install act` (macOS) or `bash <(curl -fsSL https://raw.githubusercontent.com/nektos/act/master/install.sh)` (Linux). Requires a running container engine — Docker Desktop, Colima, or podman. `pnpm act:list` is the smoke test: if it enumerates the jobs in `.github/workflows/`, you're set up.

**`.actrc`** at the repo root pins `ubuntu-latest` to `catthehacker/ubuntu:act-latest` (Ubuntu 24.04-based, matching real `ubuntu-latest`). The default `act` image is intentionally minimal and silently breaks Node/pnpm setups, so don't remove this. Container architecture is deliberately **not** pinned — `act` defaults to the host arch (arm64 on Apple Silicon), which is fast and matches GHA's _results_ for this codebase even though GHA runners are amd64.

**Capability matrix** for the workflows:

| Workflow / Job                              | Under `act` | Notes                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml` → `lint` / `build-test`            | ⚠️ remote   | Thin callers of `rheged-studio/shared-workflows` reusable workflows (Node version from `.nvmrc`, no `config` job). `act` must **fetch the remote reusable workflow** (needs network + a `GITHUB_TOKEN`); it won't run fully offline. The decisive check is the real PR run, not `act`.                          |
| `ci.yml` → `changelog-completeness`         | ✅ full     | Checkout → pnpm → Node 22 → install → completeness gate. A no-op unless the PR title is `feat`/`fix`/breaking (it reads `PR_TITLE`, unset under `act`).                                                                                                                                                         |
| `validate-pr-title.yml` → `pr-title`        | ⚠️ remote   | Thin caller of `reusable-validate-pr-title.yml`; lints the PR title as a Conventional Commit. `act` must fetch the remote reusable workflow; the decisive check is the real PR run.                                                                                                                             |
| `changelog-enrich.yml` → `changelog-enrich` | ⚠️ remote   | Thin caller of `reusable-changelog-enrich.yml` (`mode: enrich`). `act` must **fetch the remote reusable workflow** (needs network + a `GITHUB_TOKEN`); the App-token write-back push of `changelog/**` **won't run locally** (no `ROADRUNNER_*`), so this is really a real-`main`-push check, not an `act` one. |
| `claude-code-review.yml` / `claude.yml`     | ⏭️ skip     | Need `CLAUDE_CODE_OAUTH_TOKEN`. The `act:*` scripts use `-W` to scope to specific workflows, so these aren't loaded by default.                                                                                                                                                                                 |

**Commands:**

```bash
pnpm act:list           # smoke test — enumerate every job in .github/workflows/
pnpm act:ci             # run ci.yml as a PR event, using .github/act-events/pull_request.json
```

There is no `act:release:dry` script — a deploy target ships no in-repo release/publish workflow to dry-run.

The PR event fixture lives at `.github/act-events/pull_request.json` and sets `pull_request.head.ref` / `pull_request.base.ref` / `pull_request.title` so the changelog-completeness gate (`git diff …origin/${{ github.base_ref }}`) resolves against a real ref and title instead of `origin/`.

**Apple Silicon caveat:** arm64 default is fast (native, no emulation). To strictly mirror real `ubuntu-latest` (amd64) for one-off parity debugging, append `--container-architecture linux/amd64` (expect 3–5× slowdown via Rosetta/QEMU and a multi-minute first-run image pull).

**Post-push triage** (when CI runs remotely, after `/send-it`): `pnpm ci:list` shows recent runs, `pnpm ci:watch` streams the latest one, `pnpm ci:view` opens a specific run. All three require `gh auth login` first.

## `infrastructure/`

`act` validates workflow _wiring_ — that the YAML resolves, steps fire in order, env propagates. It says nothing about whether the logic _inside_ a `run:` block is correct. `infrastructure/` is the home for that logic: shell + `.mjs` extracted from workflow `run:` blocks (and the repo-local init-skill tooling), runnable and unit-tested in isolation. The full conventions document is `infrastructure/README.md`; the high-level rules:

- **Per-script language.** Shell + bats for CLI orchestration (`git`, `gh`, `jq`, `curl`, `pip`). TypeScript/`.mjs` + vitest for parsing, branching, anything touching octokit. If a shell script grows past ~20 lines with conditionals, port to TS.
- **Inputs via env, not argv.** Workflows pass values through `env:`; tests mock by passing an env object. No shell quoting drama; clean test seam.
- **Pure functions exported for tests.** Each script exports the pure logic; `main()` wires it to real subprocesses. Tests inject a fake runner that records argv.
- **Idempotent.** Re-running with the same inputs is safe. The CI cache-hit branch of `ensure-yamllint.sh` / `ensure-actionlint.sh` / `ensure-bats.sh` is exactly this scenario.
- **Pinned versions in env defaults**, e.g. `ACTIONLINT_VERSION="${ACTIONLINT_VERSION:-1.7.5}"`. The workflow's cache-key still hard-codes the version separately — match them when bumping.

Scripts:

| File                           | Replaces                       | Tests                                                                                                                   |
| ------------------------------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `scripts/ensure-yamllint.sh`   | (reference) yamllint install   | `tests/ensure-yamllint.bats` (install / already-installed branches)                                                     |
| `scripts/ensure-actionlint.sh` | (reference) actionlint install | `tests/ensure-actionlint.bats` (cache-hit / cache-miss branches)                                                        |
| `scripts/ensure-bats.sh`       | (reference) bats install       | `tests/ensure-bats.bats` (cache hit/miss, version override, off-PATH cache, substring guard, `GITHUB_PATH` propagation) |

The repo-local `initialise-versioned-repo` init-skill scripts are covered by the `.mjs` test suites under `tests/` (`initialise-versioned-repo-*.test.mjs`). The npm-publish reference scripts (`publish-via-raw-npm.sh`, `publish-to-github-packages.sh`) that the npm-package template carried here are **gone** — a deploy target publishes nothing.

Changelog validate / completeness / enrich are provided by
`@rheged-studio/changelog-core` (`pnpm validate:changelog`,
`pnpm exec changelog-core check-completeness`). Post-merge write-back is the
in-repo `changelog-enrich.yml` workflow calling
`reusable-changelog-enrich.yml` in `mode: enrich` (A-944 / A-821).

CI (A-447): the `build-test` reusable caller runs ShellCheck (`infrastructure/scripts` + the husky hooks), Vitest, and bats (`pnpm exec bats`, so `bats` is a devDependency) against this directory; the `lint` caller runs `validate:changelog`; the `changelog-completeness` job runs the completeness gate. Locally, `pnpm lint:sh` / `pnpm test:sh` skip with install hints if `shellcheck` / `bats` aren't on PATH — `pnpm test` (vitest) always runs because vitest is a node devDep.

> `eslint.config.ts` scopes a `devDependencies: true` + `complexity: off` override to `infrastructure/**` for the branchy ensure-\* reference scripts and the init-skill `.mjs`.

When adding workflow-extracted tooling, write the test first, then wire from YAML as a one-liner: `run: pnpm tsx infrastructure/scripts/<name>.ts` or `run: bash infrastructure/scripts/<name>.sh`.

## Dated changelog (`changelog/`)

The `changelog/` directory is the **only** changelog in the repo — there is no root `CHANGELOG.md` (release-please runs with `skip-changelog`, A-371). It keeps **one dated Markdown file per PR** — a browsable, per-change, machine-readable record. (The `version` field exists for octavo-schema parity but stays **blank** on this deploy target: the in-repo `mode: enrich` path never stamps it and there is no `finalise` step — see the lifecycle below.) The release-orchestrator sources its GitHub-Release notes from the **release-please PR body**, not from the changelog entries. Full schema and lifecycle in **`changelog/README.md`**. The template ships only that README; the first real entry is written by `/send-it`.

Two-stage lifecycle — post-merge enrichment runs **in-repo** via `changelog-enrich.yml`
(calling `reusable-changelog-enrich.yml`, `mode: enrich`) on every push to `main` (A-944; following
A-796 / A-800 / A-821). The old central `enrich-changelogs.yml` orchestrator cron is retired (A-801).

1. **PR-time** — `/send-it` writes `changelog/<YYYYMMDD-HHMMSS>-<slug>.md` with the PR-time fields (and empty enrichment placeholders) for **every** PR under the "record everything, filter later" model — a non-release entry simply stays version-less and is filtered out of release notes. The entry merges to `main` with its PR and sits with placeholders until post-merge enrich. CI's changelog-completeness gate enforces the one hard coupling: a release-triggering `feat`/`fix`/breaking PR title **must** carry an entry.
2. **Post-merge (in-repo)** — `changelog-enrich.yml` (`mode: enrich`) resolves the just-merged PR and fills `merged_at`/`commit`/`pr`/`stats` via `changelog-core enrich`. Write-back pushes only `changelog/**` as `road-runner-bot[bot]` (ADR 0004) via an App token minted from the org-wide `ROADRUNNER_*` secrets (`secrets: inherit`). `mode: enrich` is the **deploy-target mode**: it fills only `merged_at`/`commit`/`pr`/`stats` and does **not** stamp `version` (contrast the npm targets' `mode: finalise`, which reads the just-bumped `package.json` version). Nothing in the deploy path stamps it afterwards either — the orchestrator's release cut reads the version from `.release-please-manifest.json` and sources its notes from the release-please PR body — so on this deploy target `version` stays blank. App-token pushes re-fire the workflow; the reusable's "no associated PR" path is the loop guard (a bot enrich commit has no PR → clean no-op).

`validate:changelog` (`pnpm exec changelog-core validate`) enforces the schema (CI: the `lint` reusable caller's changelog lane). Required frontmatter is relaxed to `title`/`created_at`/`category`/`breaking` so backfilled historical entries and in-flight entries both pass.

## Release workflow

A deploy target has **no in-repo release or publish workflow** — no `pkg-release.yml`, no
`release.yml`, no publish step, no OIDC, no `npm-release` environment, no Trusted Publisher, and
nothing to bootstrap-publish. It publishes no npm or GitHub package. Versioning and the release cut
are owned entirely by **Clacks**; this repo just carries the
version-of-record (`package.json` + `.release-please-manifest.json`) and the release-please config.

### The deploy-target release model

release-please is configured (`release-please-config.json`) as a single `"."` package with
`release-type: node`, `include-v-in-tag: true`, `bump-minor-pre-major: true`, `skip-changelog: true`,
`separate-pull-requests: false`, and the mandatory
`group-pull-request-title-pattern: "chore${scope}: release${component} ${version}"` (A-677 — the
group-title pattern is what lets the orchestrator recognise and merge the release PR).

1. Make changes on a feature branch; `/send-it` bundles, writes the dated `changelog/<slug>.md` entry (for every PR), sets a **Conventional Commits PR title** (`feat`/`fix`/`feat!` for a release, a non-release type otherwise), pushes, opens a PR. Feature PRs land as **merge commits**; release-please ranks Conventional Commits on `main` (A-824). Conventional PR titles stay required (CI `validate-pr-title`) but are no longer the sole post-merge bump signal. CI (`ci.yml`) runs lint + test, the changelog-completeness gate, and (via `validate-pr-title.yml`) the conventional-PR-title lint.
2. After merge, **Clacks** (road-runner-bot, runs a cron) mints a short-lived repo-scoped App token, runs `release-please release-pr` (which infers the bump from Conventional Commits on `main` and writes `package.json` + `.release-please-manifest.json`), pushes the `release-please--branches--main` branch, and opens the "`chore(main): release <version>`" release PR. On a later tick it **squash-merges** that release PR once the `GO/NO GO` check-run is green. Fan-out PRs also stay squash.
3. The orchestrator's App-token merge pushes to `main`. Because this is a `kind: deploy` repo, the orchestrator then **cuts the git tag (`v<version>`) and the GitHub Release directly** — reading `v<version>` from `.release-please-manifest.json` and sourcing the notes from the **release-please PR body** (its grouped release notes) — there is no in-repo workflow to trigger. In parallel, the in-repo `changelog-enrich.yml` job (`mode: enrich`) fills the post-merge changelog metadata (`merged_at`/`commit`/`pr`/`stats`); it does **not** stamp `version`, and no other step does either, so `version` stays blank on this deploy target's entries.

**The A-326 cross-boundary publish hardening is moot here.** npm Trusted Publishing binds an OIDC
subject to repository + workflow filename, so the npm-package template needed a `no-workflow_dispatch`
caller, a branch-restricted `npm-release` environment, and an explicit ref guard to stop an arbitrary
ref minting a publish credential. A deploy target mints **no** publish credential and runs **no**
privileged publish job, so none of that applies — there is nothing publishable to protect.

**Choosing the bump.** There is no changeset file. Feature PRs land as **merge commits**;
release-please ranks Conventional Commits on `main` to decide the bump (A-824):
`fix:`/`perf:`/`revert:` → patch, `feat:` → minor, a `!` breaking marker (or a
`BREAKING CHANGE:` footer) → major. Conventional **PR titles** stay required (CI
`validate-pr-title`) but are no longer the sole post-merge bump signal for feature work —
commitlint / `validate-commits` remain the per-commit gate. `/send-it` still composes a
Conventional Commits title; for a hand-opened PR, set the title yourself. The orchestrator
still **squash-merges** the release PR; fan-out stays squash. Non-release types
(`docs:`/`chore:`/`ci:`/`refactor:`/`test:`/`build:`/`style:`) don't cut a release. The
conventional-PR-title lint (`validate-pr-title.yml`) + the changelog-completeness gate in
`ci.yml` keep the PR-time title honest for the completeness coupling.
