# initialise-versioned-repo

One-shot, idempotent post-generation setup for a repo freshly created from
**versioned-package-template** — the versioned, non-npm **deploy target** archetype
(the `octavo` / `shared-workflows` pattern). It drives a spawned repo to a
lint/release-ready state in a single pass, so no one has to walk the manual
generation checklist and silently miss a step. Dry-run first, safe to re-run.

This is a **repo-local** skill: it lives in the template's own tree (not the shared
`agent-skills` bundle) because the settings it applies are specific to this
template's release shell. It travels into every spawned repo via "Use this
template", where it is run once. Committed shared skill bundles in the template are
**bootstrap only** — this skill **pulls** the locked set from `agent-skills` at
scaffold time (`npx skills add … --copy`, A-776) and never overwrites itself.

## Use

Run it through your agent (it drives the dry-run → confirm → write flow across the
file edits + skills pull, the wrapped `rheged-skills-setup` run, and the GitHub
rulesets), or invoke the bundled script directly:

```bash
# Preview everything (writes nothing; skills pull reports pending)
node .claude/skills/initialise-versioned-repo/scripts/initialise-versioned-repo.mjs --dry-run

# Apply the in-repo file edits + shared-skills pull, supplying human-authored facts
echo '{"facts":{"description":"My deploy target","keywords":["a","b"]}}' \
  | node .claude/skills/initialise-versioned-repo/scripts/initialise-versioned-repo.mjs --write --files-only

# Apply just the GitHub rulesets (needs repo-admin)
node .claude/skills/initialise-versioned-repo/scripts/initialise-versioned-repo.mjs --write --github-only
```

## What it does

**In-repo file edits:** resets `changelog/` to just its `README.md` (the
changelog-poisoning fix), re-seeds `.release-please-manifest.json` to the starting
`package.json` version, rewrites the `package.json` identity (keeping
`private: true`) and `infrastructure/repo-config.yaml` (`defaultBranch`) from the
repo's own facts (`gh repo view`), **pulls the shared skills** from
`rheged-studio/agent-skills` into both agent trees (`--copy`), and **clears the
template-seed skill-config gitignore** (A-812) so resolved per-skill `config.json`
files are trackable and committed in the consumer.

**GitHub rulesets (via `gh api`):** create-or-updates the `Require GO/NO GO gate`
required-check ruleset (pinned to the GitHub Actions integration) **with the
road-runner-bot bypass** (A-944, so the in-repo changelog-enrich push to `main`
clears the required check), ensures the `Trunk` road-runner-bot changelog bypass
(ADR 0004 / A-808), and ensures the octavo-parity `Changelog write-back path guard`
push ruleset. There is **no** npm-release environment, OIDC bootstrap, or
enable-Release step — a deploy target publishes nothing.

**Wrapped:** runs the `rheged-skills-setup` skill **after** the skills pull and
gitignore strip to generate each skill's `config.json` (then commit those files).

**Reported, not automated:** registering the repo in the release-orchestrator matrix
as `kind: deploy` (A-945) and the Claude review prerequisites — the steps that need
org/cross-repo privilege. (road-runner-bot is installed org-wide, so there is no
per-repo bot install.) See
[`README.md#setup`](../../../README.md#setup) for the authoritative checklist this
mirrors.

## Requirements

- `git` and `gh` CLIs; `gh` authenticated with **repo-admin** on the target repo.
- Network access for `npx skills add` (shared-skills pull).
- Node.js ≥22 for the bundled scripts — no npm dependencies, no build step.
- Bootstrap skill copies from the template tree (refreshed by the pull).

See [`SKILL.md`](SKILL.md) for the full step-by-step process and flags.
