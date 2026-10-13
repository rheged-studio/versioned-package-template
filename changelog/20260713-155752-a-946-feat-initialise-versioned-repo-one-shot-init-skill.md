---
title: Add the initialise-versioned-repo one-shot init skill
release_note: Repos spawned from this template now run the initialise-versioned-repo skill to reach a release-ready state in one idempotent, dry-run-first pass.
version:
created_at: "2026-07-13T15:57:52Z"
merged_at: "2026-07-13T16:07:30Z"
branch: a-946-feat-initialise-versioned-repo-one-shot-init-skill
pr: 10
commit: 1f6712b
merge_strategy:
author: hello@robeasthope.com
co_authors: []
category: feature
breaking: false
issues:
  - R-946
stats:
  files_changed: 43
  loc_added: 1466
  loc_removed: 1254
---

## Added

- Added the repo-local **`initialise-versioned-repo`** skill (in `.claude/skills/`
  and the byte-identical `.agents/skills/` mirror) — the deploy-target sibling of
  `initialise-package-repo` and the executable form of the generation checklist
  ([R-946](https://linear.app/rheged-studio/issue/R-946)). It resets `changelog/` to just its README, re-seeds
  `.release-please-manifest.json`, rewrites the `package.json` identity +
  `infrastructure/repo-config.yaml` from `gh repo view`, pulls the shared skills,
  wraps `initialise-skills`, and applies the non-copied GitHub rulesets — behind a
  dry-run-first confirmation gate, safe to re-run.
- Its GitHub-settings layer provisions the **three deploy-target rulesets**: the
  `Require GO/NO GO gate` required-check ruleset **with the road-runner-bot bypass**
  ([R-944](https://linear.app/rheged-studio/issue/R-944) — the in-repo `changelog-enrich` push is rejected by the required check
  without it; `ensureGoNoGoRuleset` is create-or-update), the `Trunk` changelog
  bypass, and a new octavo-parity **`Changelog write-back path guard`** push
  ruleset (`file_path_restriction`, bypassed by road-runner-bot and the repo
  write-roles). It has **no** npm-release environment, npm-OIDC, or enable-Release
  steps — a deploy target publishes nothing. The verify-and-report step covers the
  orchestrator `kind: deploy` registration ([R-945](https://linear.app/rheged-studio/issue/R-945)), road-runner-bot install, and
  Claude review.

## Removed

- Removed the npm-oriented `initialise-package-repo` skill from both trees — a repo
  spawned from this template runs `initialise-versioned-repo`, and the old skill
  hardcoded the `npm-release` environment, `pkg-release.yml`, and the
  `@acme-skunkworks/npm-package-template` placeholder that no longer apply.

## Changed

- `PLACEHOLDER_NAME` is now `@acme-skunkworks/versioned-package-template`;
  `repo-config.yaml` reconciliation is `defaultBranch`-only (npm scope dropped).
  Renamed the four `infrastructure/tests/initialise-versioned-repo-*.test.mjs`
  suites and updated them (55 tests) to assert the bypass, create-or-update, and
  path-guard behaviour and the absence of any npm-release / Release-enable call.
  Updated `.claude/skills.lock` and reconciled the top-level CLAUDE.md / README
  ruleset docs to the skill's three actual rulesets.
