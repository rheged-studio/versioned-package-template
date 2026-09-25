---
name: initialise-versioned-repo
description: >-
  One-shot, idempotent post-generation setup for a repo created from
  versioned-package-template (a versioned, non-npm deploy target). Drives it to a
  lint/release-ready state in one pass: resets changelog/ to just its README (the
  changelog-poisoning fix), re-seeds .release-please-manifest.json to the starting
  package.json version, rewrites the package.json identity and
  infrastructure/repo-config.yaml from the repo's own facts, pulls the shared
  agent-skills set via npx skills add --copy (A-776), runs the rheged-skills-setup
  skill to generate every skill's config.json, and applies the three GitHub rulesets
  "Use this template" does not copy (GO/NO GO required-check, Trunk changelog bypass,
  changelog write-back path guard) — then verifies-and-reports the org/cross-repo
  steps it cannot automate. Use right after "Use this template" on a spawned repo, or
  when asked to initialise / bootstrap / set up a newly-generated versioned repo.
  Dry-run first, safe to re-run (a second run is a no-op).
license: MIT
compatibility: >-
  Requires the `git` and `gh` CLIs (`gh` authenticated with repo-admin on the
  target repo — creating the rulesets needs admin). Network access for
  `npx skills add` when pulling shared skills. Node.js ≥22 for the bundled scripts
  (Node built-ins only — no npm dependencies, no build step, no tsx). Wraps the
  `rheged-skills-setup` skill (pulled in the shared-skills step); its Linear-facts step
  uses the Linear MCP server when present. Designed for a repo spawned from
  rheged-studio/versioned-package-template; the GitHub-settings values
  (integration_id 15368, the road-runner-bot App id 2195582) are specific to that
  template's release shell.
metadata:
  version: 0.1.1
  author: Rob Easthope
allowed-tools: Read, Bash(node:*), Bash(git:*), Bash(gh:*), Bash(pnpm:*), Bash(npx:*), mcp__linear-server__list_teams, mcp__linear-server__get_team
---

# initialise-versioned-repo

Take a repo that was just created from **versioned-package-template** — the
versioned, non-npm **deploy target** archetype (the `octavo` / `shared-workflows`
pattern) — via GitHub's "Use this template", and drive it to a fully-configured,
releasable state in one pass, so no one has to walk the manual generation checklist
and silently miss a step.

"Use this template" copies the whole default-branch tree but **not** repo/org
settings, and it copies files that must be _reset_ in the new repo. This skill owns
both halves: the in-repo file edits (including a **pull of the shared skills** from
`agent-skills` — A-776) and the deterministic GitHub rulesets, wrapping the existing
`rheged-skills-setup` skill so per-repo setup and per-skill `config.json` generation
happen together. It is **dry-run first** and **idempotent** — the preview shows every
pending change, writes happen only after you confirm, and a re-run with nothing left
to do is a clean no-op.

> **Deploy target, not npm package.** This repo publishes **nothing** — no npm or
> GitHub package, no `src/`, no build. `package.json` is `private: true` and exists
> purely as the version-of-record. So, unlike the npm-package template's scaffolder,
> this skill has **no** npm-release environment, **no** OIDC / Trusted-Publisher
> bootstrap, **no** "enable the Release workflow" step, and **no `src/` API to
> author**. Releases are git tags + GitHub Releases cut by the orchestrator.
>
> **Why this exists (A-946).** The template dogfoods its own `changelog/`, so it
> ships dated entries documenting the _template's own_ development. Left in a
> spawned repo, the post-merge enricher would sweep them into its first release
> notes as noise. Resetting `changelog/` is the flagship fix; the missed non-copied
> GitHub rulesets (GO/NO GO with the bot bypass, Trunk changelog bypass, the path
> guard) are the other half. The authoritative checklist this mirrors is
> [`README.md#setup`](../../../README.md#setup).
>
> **Why it pulls skills (A-776).** Committed skill bundles in the template are
> bootstrap only — enough for this scaffolder to run after "Use this template". A
> spawned repo then **pulls** the locked shared set once via
> `npx skills add … --copy`, rather than relying on stale copied trees or the
> estate's hourly skills push fan-out (this template is not a push consumer —
> A-774). Repo-local `initialise-versioned-repo` is never part of that pull set.

## What it changes vs. what it reports

**Automated — in-repo file edits (working tree):**

- **Reset `changelog/`** to just its `README.md` — delete every dated entry.
- **Re-seed `.release-please-manifest.json`** so `"."` equals the starting
  `package.json` version (the #1 release-please failure mode).
- **Rewrite the `package.json` identity** — `name`, `description`, `keywords`,
  `repository`, `homepage`, `bugs` — from the repo's own facts. `private: true`
  stays; never touches the tooling shell.
- **Reconcile `infrastructure/repo-config.yaml`** — `defaultBranch`, preserving
  comments and quoting. (`nodeVersionFile` is the constant `.nvmrc`; there is no
  `npmScope` on a deploy target.)
- **Pull the shared skills** — `npx skills add` from
  `rheged-studio/agent-skills` for the locked set (`changelog`, `cleanup-repo`,
  `commit`, `rheged-skills-setup`, `linear-sync`, `preflight`, `release-status`,
  `send-it`, `triage-pr`) into both Claude Code and Cursor trees
  (`--agent claude-code --agent cursor --copy`). Does **not** overwrite this
  scaffolder.
- **Clear the template-seed skill-config gitignore** (A-812) — strip
  `.claude/skills/*/config.json` and `.agents/skills/*/config.json` (and the
  accompanying comment) from `.gitignore` so the resolved configs written next are
  trackable and can be committed.

**Automated — GitHub rulesets via `gh api` (repo-admin required):**

- **Create-or-update the `Require GO/NO GO gate` required-check ruleset** (pinned to
  the GitHub Actions integration, `integration_id: 15368`) **with road-runner-bot
  (`2195582`) as a bypass actor** (A-944). The in-repo `changelog-enrich.yml` job
  pushes `changelog/**` directly to `main` as the bot after each merge, and would
  otherwise be rejected by the required check; human PRs still satisfy `GO/NO GO`
  as normal. If a same-named ruleset already exists without the bot bypass, it is
  PUT to add the bypass without wiping other actors.
- **Ensure the Trunk changelog bypass** (ADR 0004 / A-808) — repo-level `Trunk`
  ruleset with `road-runner-bot` as an `always` bypass actor for its
  pull-request / deletion / non-fast-forward rules. Creates `Trunk` when absent;
  merges the bypass into an existing repo-sourced Trunk. Does **not** mutate the
  org-level `Protect main trunk` ruleset.
- **Ensure the `Changelog write-back path guard` push ruleset** — an octavo-parity
  defense-in-depth guard restricting direct pushes to the workflow/tooling/manifest
  paths, with the repo write-roles (RepositoryRole ids 2/4/5) and road-runner-bot as
  bypass actors. Idempotent create-if-absent by name. **Note:** unlike the GO/NO GO
  and Trunk ops (which bypass-merge into an existing ruleset), the path guard is
  create-only — a re-run does **not** reconcile a pre-existing guard whose
  `restricted_file_paths` have drifted from the current payload; to update a stale
  guard, delete it and re-run. The Trunk op also enforces `allowed_merge_methods:
["merge", "squash"]` on the repo — dual merge policy (feature merge commits;
  release/fan-out squash), applied at the repo
  level for a spawned repo that only had org-level trunk protection before.

**Wrapped:** the **`rheged-skills-setup`** skill, to generate each skill's
`config.json` from the corrected repo facts — run **after** the skills pull and the
skill-config gitignore strip so configs match the pulled bundle versions and are
left trackable for the consumer to commit (A-812).

**Reported, not automated** (org/cross-repo privilege — the skill verifies and
prints exact next steps). road-runner-bot is installed org-wide, so there is **no**
per-repo bot install to report:

- Register the repo in the orchestrator's `orchestrate-releases.yml` matrix as
  `kind: deploy` (A-945) — the `deploy` kind tells the orchestrator to open the
  release PR and cut the git tag + GitHub Release rather than trigger a publish.
- Verify Claude review prerequisites (`CLAUDE_CODE_OAUTH_TOKEN` + the Claude App).

## Process

1. **Dry run.** From the host repo root, preview every pending change:

   ```bash
   node .claude/skills/initialise-versioned-repo/scripts/initialise-versioned-repo.mjs --dry-run --json
   ```

   The CLI reads the repo's identity via `gh repo view`. Exit code `3` means `gh`
   is unauthenticated or this is not a GitHub repo — resolve that (`gh auth login`)
   before continuing. Parse the JSON: `ops.files` (per file-edit status, including
   `skillsPull: pending`), `ops.github` (per ruleset), and `reminders` (the manual
   steps).

2. **Gather the human-authored facts.** The CLI auto-derives `name` and every URL
   from `gh repo view`, and `description` from the GitHub repo description. Ask the
   user for anything they want to override — chiefly the package **`description`**
   and **`keywords`** (the template defaults are placeholders). Collect them into a
   `facts` object: `{ name?, description?, keywords? }`.

3. **Present the diff and confirm the file edits.** Show the dry-run report. Call
   out the changelog entries to be deleted, the manifest re-seed, the identity
   rewrite, and the **pending shared-skills pull**. **This is the confirmation gate
   for the working-tree edits** — do not write before it.

4. **Apply the file edits** (including the skills pull), piping the gathered facts
   as stdin JSON:

   ```bash
   echo '{"facts":{"description":"…","keywords":["…"]}}' \
     | node .claude/skills/initialise-versioned-repo/scripts/initialise-versioned-repo.mjs --write --files-only --json
   ```

   `--files-only` runs the changelog/manifest/identity/repo-config edits **and**
   `npx skills add … --copy` for the locked shared set. Needs network. Confirm
   `ops.files.skillsPull.status` is `pulled` before continuing.

5. **Generate the skill configs.** Run the **`rheged-skills-setup`** skill
   end-to-end (its own dry-run → confirm → write → idempotency flow, including the
   Linear-facts step via the Linear MCP). Do not reimplement it — invoke it. Must
   run **after** step 4 so configs match the just-pulled bundles and the
   skill-config gitignore has already been cleared. Remind the operator that the
   generated `.claude/skills/*/config.json` and `.agents/skills/*/config.json`
   files are **committed** in the consumer (agent-skills contract) — they are no
   longer gitignored after step 4.

6. **Confirm and apply the GitHub rulesets.** These need repo-admin and change
   server-side state, so confirm separately, then:

   ```bash
   node .claude/skills/initialise-versioned-repo/scripts/initialise-versioned-repo.mjs --write --github-only --json
   ```

   Each op is idempotent — it probes current state first and skips anything already
   present (the GO/NO GO ruleset with the bot bypass, the Trunk bypass, the path
   guard).

7. **Report the manual next steps.** Surface the `reminders` from the report — the
   orchestrator `kind: deploy` matrix registration and the Claude review
   prerequisites — each cross-linking its `README.md#setup` subsection. The repo is
   not "done" until these are handled. (road-runner-bot is installed org-wide, so
   there is no per-repo bot install to surface.)

8. **Confirm idempotency.** Re-run the dry run; every file/GitHub op should now
   report `unchanged` / `present` / `already-customised` (apart from the manual
   steps). The skills pull still reports `pending` on dry-run (it does not probe
   lock hashes) — a second `--write` re-pulls safely.

## Flags

- `--dry-run` (default) — detect and report; write nothing (skills pull reports
  `pending`, no network).
- `--write` — apply the changes (skills pull runs `npx skills add`).
- `--files-only` — only the in-repo file edits **and** the skills pull (Phase 4).
- `--github-only` — only the GitHub rulesets (Phase 6). Mutually exclusive with
  `--files-only`; omit both to do everything.
- `--json` — machine-readable report (parse this to drive the flow); human text
  otherwise.
- `--repo-root <path>` — the repo to operate on (default: cwd).
- **stdin JSON** — `{ "facts": { "name"?, "description"?, "keywords"? } }`, read
  when stdin is piped (not a TTY).

## Safety

- **Dry-run first, write only after confirmation.** Nothing is written without an
  explicit `--write` pass gated on the user's go-ahead. The file edits (incl.
  skills pull) and the GitHub rulesets have separate confirmation gates.
- **Idempotent.** Every op probes current state and no-ops when already done: the
  changelog reset is clean once only `README.md` remains; the manifest re-seed is a
  no-op when `"."` already matches; the identity rewrite is skipped once the name is
  no longer the placeholder; the ruleset calls skip (or bypass-merge) when already
  present. The skills pull is safe to re-run (`skills add --copy` refreshes in
  place) and never overwrites this scaffolder.
- **Only the deterministic GitHub rulesets are automated.** The orchestrator matrix
  and Claude review prerequisites are verified-and-reported, never silently assumed
  done. (road-runner-bot is installed org-wide, so no per-repo App install is
  needed.)

## Prerequisites

- A repo created from `rheged-studio/versioned-package-template`.
- `gh` authenticated with **repo-admin** on the target repo (the ruleset calls need
  admin).
- Network access for `npx skills add` (the shared-skills pull).
- Bootstrap copies of the shared skills (and this scaffolder) from the template
  tree — enough to run before the pull refreshes them.
- Node.js ≥22 for the bundled scripts (no npm dependencies).
