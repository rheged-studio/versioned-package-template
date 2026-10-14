# Rheged Studio versioned package template

A GitHub Template repository for Rheged Studio **versioned, non-npm deploy targets** — the
`octavo` / `shared-workflows` pattern. A spawned repo gets the full versioned release story
(**release-please → git tags → GitHub Releases**) plus the shared CI + dated-changelog shell, but
publishes **no npm or GitHub package**. It is a **content-only baseline**: no `src/`, no build, no
compiled artefact — `package.json` is `private: true` and exists purely as the version-of-record
plus the dev-tooling manifest. Click **Use this template** to spawn a new deploy-target repo, then
work through [Setup](#setup) below (the per-repo edits live in [`CLAUDE.md`](CLAUDE.md#repo)).

## Setup

This repo is both the template and its own reference deploy target. There are two audiences:

- **Standing up a spawned repo?** Start at the [spawned-repo quick checklist](#spawned-repo-quick-checklist).
- **Template maintainer setting up the org?** Jump to the one-time
  [org-level bootstrap](#org-level-one-time-bootstrap).

> **Important:** branch protection, rulesets, and repo/org settings are **not** copied by GitHub's
> "Use this template". Each spawned repo must re-apply the [repo-level settings](#repo-level-settings)
> itself. This checklist is the single source of truth for the non-copied setup — `CLAUDE.md`'s
> generation checklist links here rather than duplicating it.
>
> These settings were proven on the `eslint-config` testbed (R-311 / R-312 / R-313 / R-314) and
> reconciled to the current estate (release-please, the `GO/NO GO` aggregator check-run, and shared
> reusable CI callers — R-371 / R-413 / R-424 / R-447 / R-432).

### Spawned-repo quick checklist

After "Use this template", in the new repo:

> **Run the `initialise-versioned-repo` skill first.** It automates the setup half of steps 1–2
> (in-repo file edits, **shared-skills pull** via `npx skills add … --copy`, `rheged-skills-setup`,
> and the rulesets), all idempotent and dry-run-first, and verifies-and-reports the org / cross-repo
> steps 3–4 it deliberately cannot take on itself. There is **no `src/` to author** — this is a
> content-only deploy target. The numbered steps below are the reference for what it does — walk
> them by hand only if you're not using the skill. See
> [`CLAUDE.md` → Agent skills](CLAUDE.md#agent-skills). Committed skill bundles from the template are
> bootstrap only; the scaffolder refreshes them at pull-on-instantiation (R-776). This template is
> not a skills-push-fan-out consumer (R-774).

1. **Per-repo edits** — rename `package.json` identity, point `infrastructure/repo-config.yaml` at
   the new repo, **re-seed `.release-please-manifest.json`** so `"."` matches the starting
   `package.json` version (the #1 release-please failure mode), reset `changelog/` to just its
   `README.md`, **pull the shared skills** (`npx skills add … --copy`), and generate the skill
   configs (all automated by the skill). Full steps in [`CLAUDE.md`](CLAUDE.md#repo).
   The skill also adapts the inherited [`GLOSSARY.md`](GLOSSARY.md) (new header, template-only
   terms stripped); add the repo's own domain terms afterwards.
2. Apply the [repo-level settings](#repo-level-settings) (rulesets are not copied).
3. Onboard the [release-orchestrator](#release-orchestrator-onboarding) — add the repo to the
   orchestrator's matrix as a `kind: deploy` target (road-runner-bot is installed org-wide, so
   there is no per-repo bot install).
4. Verify the [Claude review prerequisites](#claude-review-prerequisites).

### Repo-level settings

Set on this repo and on each spawned repo (rulesets are not copied by "Use this template"):

- [ ] **Template repository flag enabled** (Settings → General → "Template repository") — for a
      spawned _deploy target_ this is optional; leave it off unless the new repo is itself a template.
- [ ] "Allow auto-merge" **on**; merge commits **and** squash merges allowed
      (feature PRs → merge commit; release-please + fan-out PRs → squash —
      R-1176 / R-1177).
- [ ] Secret scanning + push protection **on**.
- [ ] `Require GO/NO GO gate` ruleset configured (see [the required-check ruleset](#the-required-check-ruleset)).
- [ ] `Trunk` ruleset configured, with **road-runner-bot as a bypass actor** (see
      [the required-check ruleset](#the-required-check-ruleset) — the same bot bypass covers the
      in-repo changelog write-back).
- [ ] `Changelog write-back path guard` push ruleset configured — an octavo-parity
      `file_path_restriction` blocking non-bot direct pushes to code/config paths, bypassed by
      road-runner-bot and repo write-roles (defence-in-depth for the changelog write-back).
- [ ] `Protect main trunk` ruleset configured (deletion / non-fast-forward protection, no bypass).

> The `initialise-versioned-repo` skill provisions the first three rulesets above (`Require GO/NO GO
gate` with the bot bypass, `Trunk`, and the `Changelog write-back path guard`). `Protect main trunk`
> is org/repo-level and set separately.
>
> There is **no** npm-OIDC / Trusted-Publisher setup and **no** `npm-release` environment on a
> deploy target — it publishes nothing, so there is nothing to authenticate a publish for. (Those
> steps existed only in the npm-package template.)

#### The required-check ruleset

`ci.yml` ends with a single **`GO/NO GO`** aggregator job whose intrinsic **check-run** is the one
stable required gate. Require it on `main` via the `Require GO/NO GO gate` ruleset:

- [ ] PR required before merging.
- [ ] **0 required approvals.** ⚠️ A non-zero count blocks the orchestrator's own release-PR merge.
- [ ] Required status check: **`GO/NO GO`** — **not** the retired `🔬 Build & Lint`. The caller
      swap (R-447) replaced it with `lint / Lint` + `build-test / Build & Test`, and `GO/NO GO`
      aggregates them all.
- [ ] Ruleset **pinned to the GitHub Actions integration** (`integration_id: 15368`), so nothing
      but this repo's Actions can satisfy it.
- [ ] **road-runner-bot listed as a bypass actor** (R-944 / R-1019). The **in-repo**
      `changelog-enrich.yml` job pushes `changelog/**` **directly to `main`** as
      `road-runner-bot[bot]` after each merge (post-merge enrichment is in-repo now —
      R-796 / R-821 — not a central cron). Without the bypass, the required-check
      ruleset rejects that direct push. Human PRs still have to satisfy `GO/NO GO` as
      normal — the bypass is scoped to the bot actor only. npm-package templates need
      the same enricher bypass on GO/NO GO (R-1019); this is not deploy-target-only.

The `Trunk` ruleset carries the **same** road-runner-bot bypass (integration `2195582`, an `always`
bypass actor) for the pull-request / deletion / non-fast-forward rules, so the enrich push clears
both rulesets (ADR 0004 / R-794).

Footguns (R-418):

- The gate must be a **check-run, not a commit status** — a commit status is forgeable by any
  push-scoped token; a check-run can only be minted by a GitHub App (the repo's own Actions run).
- **Never path-filter** the gate — a path-filtered required check sits Pending forever and blocks
  merges. `ci.yml` keeps it on `always()`.

### Release-orchestrator onboarding

Hands-off releases are driven by the **private** `rheged-studio/release-orchestrator` repo, which
holds the bot key, runs `release-please release-pr`, merges the release PR, and — for a `kind: deploy`
repo — **cuts the git tag + GitHub Release directly** (there is no in-repo release/publish workflow;
a deploy target publishes nothing). Post-merge changelog enrichment runs **in-repo** via
`changelog-enrich.yml` (`mode: enrich`, `@rheged-studio/changelog-core`, R-944) — not through the
orchestrator's retired central cron (R-801) and not through a `pkg-release.yml` (there is none).
Without onboarding, the repo never gets its automatic release PRs or tags.

The template already ships everything the orchestrator needs on the repo side — release-please
config + manifest (`release-type: node`, `include-v-in-tag`, the mandatory group-title pattern),
`@rheged-studio/changelog-core`, `.nvmrc`, the in-repo `changelog-enrich.yml`, and `GO/NO GO`
running on the `release-please--*` branch. So onboarding reduces to a single step:

- [ ] **Register the repo in the orchestrator's matrix as `kind: deploy`** (R-648 / R-945) — the
      `deploy` kind tells the orchestrator to cut a tag + GitHub Release rather than trigger a
      publish.

> **No per-repo road-runner-bot install or `ROADRUNNER_*` grant step.** The road-runner-bot App is
> now installed **org-wide** across the config-estate repos with `contents: write` +
> `pull-requests: write`, and `ROADRUNNER_PRIVATE_KEY` (org secret) + `ROADRUNNER_CLIENT_ID` (org
> var) are likewise provisioned **org-wide** (R-945). So a spawned repo inherits both the bot and
> its credentials: the in-repo `changelog-enrich` job can mint its App token with no per-repo
> install, repository-selection edit, or secret-visibility edit. (These were manual per-repo steps
> in the npm-package template; they are gone.)

The required check the orchestrator waits on is **`GO/NO GO`** (the `🔬 Build & Lint` → `GO/NO GO`
cutover completed via R-419 / R-596 / R-437), and the CI callers already run on `release-please--*`
(no skip), so the changelog lane validates entries before the release PR merges.

> The old R-309 "exclude `CHANGELOG.md` from markdown lint" step no longer applies: release-please
> runs with `skip-changelog`, so there is no root `CHANGELOG.md` — the dated `changelog/` directory
> is the only changelog.

### Claude review prerequisites

`claude.yml` / `claude-code-review.yml` need **two** things, and **neither is copied** by "Use this
template":

1. **`CLAUDE_CODE_OAUTH_TOKEN`** — Anthropic model auth for the review action.
2. **The Claude GitHub App installed on the repo** — `claude-code-action` exchanges an OIDC token
   for a short-lived GitHub token, and that exchange only yields a token if the App is granted.
   Missing it, the action's internal `git fetch origin --depth=20 <branch>` runs unauthenticated
   and fails with `could not read Username` — so the review never runs **even after the secret is
   added** (R-621 / R-636).

**Preferred: provision both org-wide, then just verify per repo.** Rather than repeat this on every
spawned repo:

- [ ] `CLAUDE_CODE_OAUTH_TOKEN` as an **org secret** — new repos inherit it automatically (both the
      shared `reusable-claude.yml` caller's `secrets: inherit` and this template's explicit pass
      pick up an org secret).
- [ ] The **Claude GitHub App installed on the org** across the config-estate repos — the OIDC →
      GitHub-token exchange then works in every current/future repo with **no** per-repo grant.

> **Caveat:** the org secret alone does _not_ solve the whole problem — it fixes only the
> Anthropic-auth half; the `git fetch` failure is the **GitHub App / OIDC** half, which still needs
> the App installed. Both org-wide together is the real "zero per-repo Claude setup" answer.

**Per-repo fallback** (until org-wide provisioning is in place):

- [ ] Add the `CLAUDE_CODE_OAUTH_TOKEN` **repo secret**.
- [ ] Grant the **Claude GitHub App** to the repo. (The caller permissions — `id-token: write`,
      `contents: read`, `pull-requests: write`, `issues: read` — are already correct in the
      template; the App grant is the missing piece, not the workflow wiring.)

> **Security note on the org secret.** `ROADRUNNER_PRIVATE_KEY` is org-compromise-grade and — since
> post-merge enrichment moved in-repo — is now provisioned org-wide so every repo's own
> `changelog-enrich` job can mint an App token (R-822 / R-945), a deliberate widening from the old
> "`release-orchestrator` only" scope. `CLAUDE_CODE_OAUTH_TOKEN` is by contrast an Anthropic API
> token — blast radius is API usage / billing abuse, and it is rotatable. Still, an "All
> repositories" org secret is readable by any workflow in any org repo, so **scope it to the
> config-estate repos** (or all-private) rather than truly all, and rotate on exposure. Fork-PR
> secret withholding + "require approval for external contributors" (already on) mitigate the
> `pull_request`-trigger exposure.

### Org-level one-time bootstrap

_Template maintainer only — set once for the `rheged-studio` organisation. These protect the
release identity across every repo; a spawned-repo owner can skip this section._

- [ ] `ROADRUNNER_PRIVATE_KEY` (org **secret**) → provisioned **org-wide** so every repo's in-repo
      `changelog-enrich` job can mint an App token (R-822 / R-945). This is a deliberate widening from
      the npm-package template's "`release-orchestrator` only" scope, made when enrichment moved
      in-repo. The App private key never expires and is org-compromise-grade, so this trade-off is
      backed by SHA-pinned actions, the read-only default token, and fork-PR approval (all below);
      rotate on any exposure.
- [ ] `ROADRUNNER_CLIENT_ID` (org **variable**) → non-sensitive (Client/App IDs are public); share
      as needed by the enrich job.
- [ ] road-runner-bot App installed **org-wide** across the config-estate repos with
      `contents: write` **+** `pull-requests: write`, so every current/future spawned repo inherits
      it with no per-repo install or repository-selection edit.
- [ ] `CLAUDE_CODE_OAUTH_TOKEN` provisioned org-wide and the Claude GitHub App installed across the
      config-estate repos (see [Claude review prerequisites](#claude-review-prerequisites)).
- [ ] Actions → "Allow GitHub Actions to create and approve pull requests" → **off**.
- [ ] Default workflow token permissions → **read**.
- [ ] "Require approval for all external contributors" (fork-PR workflows) → **on**.
- [ ] "Require actions to be pinned to a full-length commit SHA" (SHA-pin enforcement) → **on**.
- [ ] Remove any org `main`-ruleset bot `bypass: always` entry that isn't road-runner-bot —
      auto-merge respects branch protection once the required check is green.
